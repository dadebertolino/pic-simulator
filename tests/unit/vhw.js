/**
 * Collegamenti dell'hardware virtuale per i test, equivalenti a quelli dei
 * componenti dell'interfaccia (assets/js/ui/vhw/*): i modelli dei device
 * sono quelli del core, il cablaggio ai pin lo fa una pseudo-periferica
 * eseguita a ogni ciclo istruzione.
 */
const { ctx } = require('./helpers');

let hookId = 0;

/** Esegue fn(cpu) a ogni ciclo istruzione, dopo le periferiche gia' registrate. */
function onEveryCycle(cpu, fn) {
    cpu.addPeripheral({
        name: 'TEST_HOOK_' + (++hookId),
        runsInSleep: false,
        getRegisters: () => [],
        tick: () => fn(cpu),
        reset: () => {},
    });
}

/** Livello che il PIC impone su un pin: latch se e' un'uscita, null se e' un ingresso. */
function pinOut(cpu, port, pin) {
    const out = cpu.getPortOutput(port);
    if ((out.tris >> pin) & 1) return null;
    return (out.raw >> pin) & 1;
}

/** Sensore a ultrasuoni HC-SR04: trigger e echo su due pin. */
function attachHCSR04(cpu, { trig, echo, cm }) {
    const sensor = new ctx.VirtualHCSR04();
    sensor.setDistance(cm);
    onEveryCycle(cpu, () => {
        const t = pinOut(cpu, trig[0], trig[1]) || 0;
        cpu.setExternalInput(echo[0], echo[1], sensor.tick(t));
    });
    return sensor;
}

/**
 * Bus 1-Wire su un pin (open drain con pull-up): il PIC scrive col TRIS
 * (uscita a 0 = linea bassa, ingresso = rilasciata). Al bus va il livello
 * del master; sul pin si legge l'AND con quello del device.
 */
function attachOneWire(cpu, port, pin, devices) {
    const bus = new ctx.VirtualOneWireBus();
    for (const d of devices) bus.attach(d);
    let last = null;
    onEveryCycle(cpu, () => {
        const driven = pinOut(cpu, port, pin);
        const master = driven === null ? 1 : driven;
        if (master !== last) {
            bus.pinWrite(master);
            last = master;
        }
        bus.tick();
        cpu.setExternalInput(port, pin, master & bus.pinRead());
    });
    return bus;
}

/** Tastierino 4x4: righe su 4 bit in uscita, colonne su 4 bit in ingresso (attive basse). */
function attachKeypad(cpu, { port, rowStart, colStart }) {
    const keypad = new ctx.VirtualKeypad();
    let lastCols = -1;
    onEveryCycle(cpu, () => {
        const out = cpu.getPortOutput(port);
        // Righe non pilotate (ingressi) restano alte
        const rows = (((out.raw | out.tris) >> rowStart) & 0x0F);
        const cols = keypad.scan(rows);
        if (cols === lastCols) return;
        lastCols = cols;
        for (let c = 0; c < 4; c++) cpu.setExternalInput(port, colStart + c, (cols >> c) & 1);
    });
    return keypad;
}

/**
 * Decodificatore HD44780 minimo: comandi di clear e indirizzo DDRAM,
 * caratteri, modalita' a 8 e a 4 bit (il passaggio a 4 bit e' il
 * "function set" con DL = 0, inviato come singolo nibble).
 */
class LcdDecoder {
    constructor() {
        this.ddram = new Array(0x68).fill(' ');
        this.cursor = 0;
        this.fourBit = false;
        this.pending = null; // nibble alto in attesa del basso
        this.lastEn = 0;
        this.commands = [];
    }

    /** Un campionamento dei pin: data sono i bit D0-D7 (in 4 bit contano D4-D7). */
    sample(rs, en, data) {
        if (this.lastEn && !en) this._latch(rs, data & 0xFF);
        this.lastEn = en;
    }

    _latch(rs, data) {
        if (!this.fourBit) {
            this._byte(rs, data);
            if (!rs && (data & 0xF0) === 0x20) this.fourBit = true;
            return;
        }
        const nibble = data & 0xF0;
        if (this.pending === null) {
            this.pending = nibble;
        } else {
            this._byte(rs, this.pending | (nibble >> 4));
            this.pending = null;
        }
    }

    _byte(rs, value) {
        if (rs) {
            this.ddram[this.cursor] = String.fromCharCode(value);
            this.cursor = (this.cursor + 1) % this.ddram.length;
            return;
        }
        this.commands.push(value);
        if (value === 0x01) {
            this.ddram.fill(' ');
            this.cursor = 0;
        } else if (value & 0x80) {
            this.cursor = (value & 0x7F) % this.ddram.length;
        }
    }

    line(n) {
        const start = n === 2 ? 0x40 : 0x00;
        return this.ddram.slice(start, start + 16).join('');
    }
}

/** LCD con bus dati a 8 bit su una porta e RS/EN su un'altra. */
function attachLcd8(cpu, { dataPort, ctrlPort, rs, en }) {
    const lcd = new LcdDecoder();
    onEveryCycle(cpu, () => {
        const ctrl = cpu.getPortOutput(ctrlPort).raw;
        lcd.sample((ctrl >> rs) & 1, (ctrl >> en) & 1, cpu.getPortOutput(dataPort).raw);
    });
    return lcd;
}

/** LCD a 4 bit: RS, EN e D4-D7 sulla stessa porta. */
function attachLcd4(cpu, { port, rs, en, dataStart }) {
    const lcd = new LcdDecoder();
    onEveryCycle(cpu, () => {
        const raw = cpu.getPortOutput(port).raw;
        lcd.sample((raw >> rs) & 1, (raw >> en) & 1, ((raw >> dataStart) & 0x0F) << 4);
    });
    return lcd;
}

/** LCD dietro un PCF8574 sul bus I2C: P0 = RS, P2 = EN, P4-P7 = D4-D7. */
function attachLcdI2C(cpu, address) {
    const lcd = new LcdDecoder();
    const pcf = new ctx.VirtualPCF8574(address & 0x07, false);
    pcf.onOutputChange = (v) => lcd.sample(v & 1, (v >> 2) & 1, v & 0xF0);
    cpu.getPeripheral('MSSP').i2cBus.attach(address, pcf);
    return lcd;
}

module.exports = { onEveryCycle, pinOut, attachHCSR04, attachOneWire, attachKeypad, LcdDecoder, attachLcd8, attachLcd4, attachLcdI2C };
