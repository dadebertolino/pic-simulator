/**
 * Esempi integrati (SimulatorUI.prototype._getExamples): si assemblano
 * tutti sul device della loro direttiva LIST P= e fanno quello che dichiarano
 * nell'intestazione. Si osservano i pin delle porte, il terminale seriale e
 * l'hardware virtuale collegato come indica l'esempio (">> Add ...").
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ctx, assemblerFor, cpuWith, examples, pins } = require('./helpers');
const vhw = require('./vhw');

const ALL = examples();
const deviceOf = (ex) => 'PIC16F' + ex.source.match(/LIST\s+P\s*=\s*16F(\w+)/i)[1].toUpperCase();
const byName = (name) => {
    const ex = Object.values(ALL).find((e) => e.name === name);
    assert.ok(ex, 'esempio mancante: ' + name);
    return ex;
};

/** CPU con l'esempio caricato e, se serve, l'hardware virtuale collegato. */
async function load(name, attach) {
    const ex = byName(name);
    const cpu = await cpuWith(ex.source, deviceOf(ex));
    const hw = attach ? attach(cpu) : undefined;
    return { cpu, hw };
}

/**
 * Esegue l'esempio e restituisce i primi `count` valori distinti letti da
 * `probe(cpu)` (di default i pin di `port`), nell'ordine in cui compaiono.
 * `stimulus(step, cpu)` simula pulsanti e interruttori sui pin di ingresso.
 */
async function sequence(name, port, count, { stimulus = () => {}, maxSteps = 3e6, attach, probe } = {}) {
    const { cpu, hw } = await load(name, attach);
    const read = probe || ((c) => pins(c, port));
    const seen = [];
    let last = null;
    for (let i = 0; i < maxSteps && seen.length < count; i++) {
        stimulus(i, cpu);
        cpu.step();
        const value = read(cpu, hw);
        if (value !== last) {
            seen.push(value);
            last = value;
        }
    }
    return { seen, cpu, hw };
}

/** Esegue per un certo numero di cicli istruzione (non di istruzioni). */
function runCycles(cpu, cycles) {
    const end = cpu.cycles + cycles;
    while (cpu.cycles < end) cpu.step();
    return cpu;
}

/** Device I2C/SPI del core collegati alla MSSP, come fanno i componenti VHW. */
const i2c = (addr, device) => (cpu) => {
    cpu.getPeripheral('MSSP').i2cBus.attach(addr, device);
    return device;
};
const spi = (device) => (cpu) => {
    cpu.getPeripheral('MSSP').spiBus.attach(device, { port: 'A', pin: 0 });
    return device;
};

const SEG = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]; // 0-9, a = bit 0

describe('esempi: assemblaggio', () => {
    test('sono 53 e si assemblano tutti sul loro device', async () => {
        const list = Object.values(ALL);
        assert.equal(list.length, 53);
        for (const ex of list) {
            const r = (await assemblerFor(deviceOf(ex))).assemble(ex.source);
            assert.ok(r.success, `${ex.name}: ${JSON.stringify(r.errors)}`);
        }
    });
});

describe('esempi: base, I/O e interrupt (16F84A)', () => {
    test('LED Blink: RB0 lampeggia', async () => {
        assert.deepEqual((await sequence('LED Blink', 'B', 5)).seen, [0, 1, 0, 1, 0]);
    });

    test('Knight Rider: il LED scorre avanti e indietro', async () => {
        // Regressione: con il flag Z mai impostato il verso non cambiava.
        assert.deepEqual((await sequence('Knight Rider', 'B', 13)).seen,
            [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x40, 0x20, 0x10, 0x08]);
    });

    test('Binary Counter: PORTB conta da 0 in su', async () => {
        assert.deepEqual((await sequence('Binary Counter', 'B', 6)).seen, [0, 1, 2, 3, 4, 5]);
    });

    test('Button + LED: RB0 segue RA0', async () => {
        const press = (i, cpu) => {
            if (i === 100) cpu.setExternalInput('A', 0, 1);
            if (i === 200) cpu.setExternalInput('A', 0, 0);
        };
        assert.deepEqual((await sequence('Button + LED', 'B', 3, { stimulus: press, maxSteps: 400 })).seen, [0, 1, 0]);
    });

    test('TMR0 Interrupt: la ISR commuta RB0', async () => {
        // Regressione: T0IF non si alzava mai.
        assert.deepEqual((await sequence('TMR0 Interrupt', 'B', 4)).seen, [0, 1, 0, 1]);
    });

    test('EEPROM Read/Write: scrive 0x42 e lo rilegge su PORTB', async () => {
        const { seen, cpu } = await sequence('EEPROM Read/Write', 'B', 2);
        assert.deepEqual(seen, [0, 0x42]);
        assert.equal(cpu.readEEPROM(0), 0x42);
    });

    test('8-bit Addition e Multiply 8x8', async () => {
        assert.deepEqual((await sequence('8-bit Addition', 'B', 2)).seen, [0, 0x37 + 0x4A]);
        assert.deepEqual((await sequence('Multiply 8x8', 'B', 2)).seen, [0, 6 * 7]);
    });

    test('Lookup Table: cifre 0-9 sul display a 7 segmenti', async () => {
        assert.deepEqual((await sequence('Lookup Table', 'B', 11)).seen, [0, ...SEG]);
    });

    test('Stack Demo: quattro livelli di CALL accendono e spengono RB0-RB3', async () => {
        assert.deepEqual((await sequence('Stack Demo', 'B', 9)).seen, [0, 1, 3, 7, 0xF, 7, 3, 1, 0]);
    });
});

describe('esempi: periferiche di 628A e 877A', () => {
    test('Serial Hello World (628A): "Hello!" sul terminale', async () => {
        const { cpu } = await load('Serial Hello World');
        runCycles(cpu, 200000);
        assert.match(cpu.getPeripheral('USART').getTxString(), /Hello!/);
    });

    test('Serial Echo (628A): rimanda il carattere ricevuto', async () => {
        const { cpu } = await load('Serial Echo');
        const usart = cpu.getPeripheral('USART');
        runCycles(cpu, 5000);
        usart.receiveData('A'.charCodeAt(0));
        runCycles(cpu, 20000);
        usart.receiveData('z'.charCodeAt(0));
        runCycles(cpu, 20000);
        assert.equal(usart.getTxString(), 'Az');
    });

    test('ADC Read Channel 0 (877A): gli 8 bit alti di AN0 su PORTB', async () => {
        const { cpu } = await load('ADC Read Channel 0');
        cpu.getPeripheral('ADC').setChannelValue(0, 0x2A5);
        runCycles(cpu, 300000);
        assert.equal(pins(cpu, 'B'), 0x2A5 >> 2);
    });

    test('ADC Threshold (877A): RB0 acceso sopra meta\' scala', async () => {
        const { cpu } = await load('ADC Threshold');
        const adc = cpu.getPeripheral('ADC');
        adc.setChannelValue(0, 800);
        runCycles(cpu, 20000);
        assert.equal(pins(cpu, 'B') & 1, 1);
        adc.setChannelValue(0, 200);
        runCycles(cpu, 20000);
        assert.equal(pins(cpu, 'B') & 1, 0);
    });

    test('PWM LED Dimmer (628A): il duty di CCP1 sale', async () => {
        const { cpu } = await load('PWM LED Dimmer');
        const ccp = cpu.getPeripheral('CCP1');
        const duties = new Set();
        for (let i = 0; i < 40; i++) {
            runCycles(cpu, 140000);
            duties.add(ccp.getPWMDuty());
        }
        const list = [...duties];
        assert.ok(list.length > 10, `valori di duty: ${list.join(', ')}`);
        assert.ok(Math.max(...list) > Math.min(...list));
    });

    test('Timer1 Overflow (628A): la ISR di periferica commuta RB0', async () => {
        assert.deepEqual((await sequence('Timer1 Overflow', 'B', 4)).seen, [0, 1, 0, 1]);
    });

    test('Voltage Comparator (628A): RB0 = AN3 > AN0, RB1 = AN2 > AN1', async () => {
        // Regressione: l'esempio usava il modo 010 (confronto con la Vref
        // interna, spenta) e C1OUT restava sempre a 0.
        const { cpu } = await load('Voltage Comparator');
        const comp = cpu.getPeripheral('COMPARATOR');
        const set = (an0, an1, an2, an3) => {
            [an0, an1, an2, an3].forEach((v, ch) => comp.setInputVoltage(ch, v));
            runCycles(cpu, 2000);
            return pins(cpu, 'B') & 0x03;
        };
        assert.equal(set(1, 1, 1, 3), 0x01);
        assert.equal(set(1, 1, 3, 0.5), 0x02);
        assert.equal(set(4, 4, 1, 1), 0x00);
        assert.equal(cpu.ram[0x0C] & 0x40, 0x40, 'CMIF al cambio delle uscite');
    });

    test('Multi-Port I/O (877A): PORTA copiata, negata e scambiata su B, C, D', async () => {
        // Regressione: PORTD/TRISD erano occupati dai registri della EEPROM.
        const set = (i, cpu) => {
            if (i === 0) { cpu.setExternalInput('A', 0, 1); cpu.setExternalInput('A', 2, 1); }
        };
        const { cpu } = await sequence('Multi-Port I/O', 'D', 2, { stimulus: set });
        assert.equal(pins(cpu, 'B'), 0x05);
        assert.equal(pins(cpu, 'C'), 0xFA);
        assert.equal(pins(cpu, 'D'), 0x50);
    });

    test('ADC + USART (877A): il valore di AN0 in esadecimale sul terminale', async () => {
        const { cpu } = await load('ADC + USART');
        cpu.getPeripheral('ADC').setChannelValue(0, 0x2A5);
        runCycles(cpu, 400000);
        assert.match(cpu.getPeripheral('USART').getTxString(), /A9/);
    });

    test('Dual PWM (877A): CCP1 al 25%, CCP2 al 75%', async () => {
        const { cpu } = await load('Dual PWM');
        runCycles(cpu, 5000);
        assert.ok(Math.abs(cpu.getPeripheral('CCP1').getPWMPercent() - 25) <= 1);
        assert.ok(Math.abs(cpu.getPeripheral('CCP2').getPWMPercent() - 75) <= 1);
    });
});

describe('esempi: hardware virtuale su GPIO', () => {
    test('7-Seg Counter: cifre 0-9 su PORTB', async () => {
        assert.deepEqual((await sequence('7-Seg Counter', 'B', 11)).seen, [0, ...SEG]);
    });

    test('7-Seg 4-Digit MUX: "1234", una cifra per volta (selezione attiva bassa)', async () => {
        const shown = new Map();
        await sequence('7-Seg 4-Digit MUX', null, 200, {
            maxSteps: 100000,
            probe: (cpu) => {
                const sel = pins(cpu, 'A') & 0x0F;
                const digit = [0x0E, 0x0D, 0x0B, 0x07].indexOf(sel);
                if (digit >= 0) shown.set(digit, pins(cpu, 'B'));
                return sel;
            },
        });
        assert.deepEqual([0, 1, 2, 3].map((d) => shown.get(d)), [SEG[1], SEG[2], SEG[3], SEG[4]]);
    });

    test('LED Bar VU Meter (877A): la barra segue AN0, da spenta a 8 LED', async () => {
        // Regressione: ADRESH >> 5 arriva a 7 e l'ottavo LED non si accendeva mai.
        const { cpu } = await load('LED Bar VU Meter');
        const adc = cpu.getPeripheral('ADC');
        for (const [value, bar] of [[0, 0x00], [1023, 0xFF], [520, 0x1F], [8, 0x01]]) {
            adc.setChannelValue(0, value);
            runCycles(cpu, 5000);
            assert.equal(pins(cpu, 'B'), bar, `AN0 = ${value}`);
        }
    });

    test('Buttons + LEDs: ogni pressione di RA0-RA3 commuta il LED corrispondente', async () => {
        const { cpu } = await load('Buttons + LEDs');
        const press = (pin) => {
            cpu.setExternalInput('A', pin, 1);
            runCycles(cpu, 300000);
            cpu.setExternalInput('A', pin, 0);
            runCycles(cpu, 300000);
        };
        runCycles(cpu, 1000);
        press(0);
        assert.equal(pins(cpu, 'B') & 0x0F, 0x01);
        press(2);
        assert.equal(pins(cpu, 'B') & 0x0F, 0x05);
        press(0);
        assert.equal(pins(cpu, 'B') & 0x0F, 0x04);
    });

    test('DIP Switch + 7-Seg: il nibble di PORTA in esadecimale', async () => {
        const { cpu } = await load('DIP Switch + 7-Seg');
        for (const [value, seg] of [[0x0, 0x3F], [0x7, 0x07], [0xA, 0x77]]) {
            for (let b = 0; b < 4; b++) cpu.setExternalInput('A', b, (value >> b) & 1);
            runCycles(cpu, 2000);
            assert.equal(pins(cpu, 'B') & 0x7F, seg, `DIP = ${value}`);
        }
    });

    test('LCD Hello World (8-bit, 877A): due righe sul display', async () => {
        const { cpu, hw } = await load('LCD Hello World (8-bit)', (c) => vhw.attachLcd8(c, { dataPort: 'B', ctrlPort: 'D', rs: 0, en: 2 }));
        runCycles(cpu, 300000);
        assert.equal(hw.line(1).trim(), 'Hello World!');
        assert.equal(hw.line(2).trim(), 'PIC16F877A');
    });

    test('LCD 4-bit Mode: due righe sul display', async () => {
        const { cpu, hw } = await load('LCD 4-bit Mode', (c) => vhw.attachLcd4(c, { port: 'B', rs: 0, en: 2, dataStart: 4 }));
        runCycles(cpu, 300000);
        assert.equal(hw.line(1).trim(), 'Hello!');
        assert.equal(hw.line(2).trim(), '4-bit');
    });

    test('DS18B20 Read Temp: la temperatura intera su PORTB', async () => {
        // Regressione: il bus 1-Wire spostava il bit letto di una posizione.
        for (const t of [23.5, 85, 0]) {
            const sensor = new ctx.VirtualDS18B20();
            sensor.setTemperature(t);
            const { cpu } = await load('DS18B20 Read Temp', (c) => vhw.attachOneWire(c, 'A', 0, [sensor]));
            runCycles(cpu, 300000);
            assert.equal(pins(cpu, 'B'), Math.floor(t), `${t} gradi`);
        }
    });

    test('Servo Sweep: impulsi a 50 Hz da 0 a 180 gradi', async () => {
        const servo = new ctx.VirtualServo();
        const { cpu } = await load('Servo Sweep', (c) => vhw.onEveryCycle(c, () => servo.tick(vhw.pinOut(c, 'B', 0) || 0)));
        const angles = new Set();
        for (let i = 0; i < 300; i++) {
            runCycles(cpu, 20000);
            angles.add(servo.getState().angle);
        }
        assert.ok(Math.abs(servo.getState().period - 20000) < 2000, `periodo ${servo.getState().period} cicli`);
        assert.ok(Math.min(...angles) <= 10 && Math.max(...angles) >= 170, `angoli ${Math.min(...angles)}-${Math.max(...angles)}`);
    });

    test('Servo + ADC Control (877A): AN0 decide l\'angolo', async () => {
        for (const [value, lo, hi] of [[0, 0, 10], [1023, 170, 180]]) {
            const servo = new ctx.VirtualServo();
            const { cpu } = await load('Servo + ADC Control', (c) => vhw.onEveryCycle(c, () => servo.tick(vhw.pinOut(c, 'B', 0) || 0)));
            cpu.getPeripheral('ADC').setChannelValue(0, value);
            runCycles(cpu, 200000);
            const { angle } = servo.getState();
            assert.ok(angle >= lo && angle <= hi, `AN0 = ${value}: angolo ${angle}`);
        }
    });

    test('HC-SR04 Distance: la durata dell\'eco cresce con la distanza', async () => {
        const echo = async (cm) => {
            const { cpu } = await load('HC-SR04 Distance', (c) => vhw.attachHCSR04(c, { trig: ['B', 0], echo: ['B', 1], cm }));
            // Fine della prima misura (eco di 300 cm = 17 400 us), prima che
            // la seconda azzeri il contatore dopo il ritardo di ~49 000 cicli
            runCycles(cpu, 25000);
            return (cpu.ram[0x0C] << 8) | cpu.ram[0x0D]; // ECHO_H:ECHO_L
        };
        // Ciclo di conteggio da 7 cicli, eco di 58 us per cm: ~8,3 per cm
        for (const cm of [20, 100, 300]) {
            const count = await echo(cm);
            assert.ok(Math.abs(count - cm * 58 / 7) <= cm * 58 / 7 * 0.03, `${cm} cm: conteggio ${count}`);
        }
    });

    test('WS2812 RGB Strip: gli 8 colori della tabella, ruotati a ogni fotogramma', async () => {
        // Regressione: il modello faceva il latch con 25 cicli bassi e la
        // striscia si azzerava tra un LED e l'altro.
        const COLORS = [[255, 0, 0], [255, 128, 0], [0, 255, 0], [0, 255, 255],
            [0, 0, 255], [255, 0, 255], [255, 64, 32], [255, 255, 255]]; // r, g, b
        const strip = new ctx.VirtualWS2812(8);
        const { cpu } = await load('WS2812 RGB Strip', (c) => vhw.onEveryCycle(c, () => strip.tick(vhw.pinOut(c, 'B', 0) || 0)));
        const frames = new Set();
        for (let i = 0; i < 6; i++) {
            runCycles(cpu, 30000);
            const leds = strip.getState().leds.map((l) => [l.r, l.g, l.b]);
            const offset = COLORS.findIndex((c) => c.join() === leds[0].join());
            assert.ok(offset >= 0, JSON.stringify(leds));
            assert.deepEqual(leds, leds.map((_, n) => COLORS[(n + offset) % 8]));
            frames.add(offset);
        }
        assert.ok(frames.size > 1, 'i colori scorrono');
    });

    test('KS0108 GLCD Draw (877A): entrambe le meta\' accese e disegnate', async () => {
        const glcd = new ctx.VirtualKS0108();
        const { cpu } = await load('KS0108 GLCD Draw', (c) => vhw.onEveryCycle(c, () => {
            const d = c.getPortOutput('D').raw;
            glcd.tick(c.getPortOutput('B').raw, d & 1, (d >> 2) & 1, (d >> 3) & 1, (d >> 4) & 1);
        }));
        runCycles(cpu, 2000000);
        assert.deepEqual(Array.from(glcd.getState().displayOn), [true, true]);
        let left = 0;
        let right = 0;
        for (let y = 0; y < 64; y++) {
            for (let x = 0; x < 64; x++) left += glcd.getPixel(x, y) ? 1 : 0;
            for (let x = 64; x < 128; x++) right += glcd.getPixel(x, y) ? 1 : 0;
        }
        assert.ok(left > 0 && right > 0, `pixel accesi: sinistra ${left}, destra ${right}`);
    });

    test('L293D Motor Control: i due motori girano in versi opposti e poi si invertono', async () => {
        const driver = new ctx.VirtualL293D();
        const bit = (c, n) => vhw.pinOut(c, 'B', n) || 0;
        const { cpu } = await load('L293D Motor Control', (c) => vhw.onEveryCycle(c, () => {
            driver.tickChannel(0, bit(c, 0), bit(c, 1), bit(c, 2));
            driver.tickChannel(1, bit(c, 3), bit(c, 4), bit(c, 5));
        }));
        const pairs = new Set();
        for (let i = 0; i < 400; i++) {
            runCycles(cpu, 20000);
            const s = driver.getState();
            if (s.motor1.direction !== 'DISABLED' && s.motor2.direction !== 'DISABLED') pairs.add(s.motor1.direction + '/' + s.motor2.direction);
        }
        assert.ok(pairs.has('FORWARD/REVERSE') && pairs.has('REVERSE/FORWARD'), [...pairs].join(', '));
    });

    test('Buzzer Melody: la scala do-do, frequenze crescenti', async () => {
        const buzzer = new ctx.VirtualBuzzer();
        const { cpu } = await load('Buzzer Melody', (c) => vhw.onEveryCycle(c, () => buzzer.tick(vhw.pinOut(c, 'B', 0) || 0)));
        const notes = [];
        for (let i = 0; i < 400 && notes.length < 8; i++) {
            runCycles(cpu, 10000);
            const f = Math.round(buzzer.getState().frequency);
            if (f > 0 && (notes.length === 0 || Math.abs(f - notes[notes.length - 1]) > 20)) notes.push(f);
        }
        assert.equal(notes.length, 8, `note: ${notes.join(', ')}`);
        for (let i = 1; i < notes.length; i++) assert.ok(notes[i] > notes[i - 1], `note: ${notes.join(', ')}`);
    });

    test('Keypad Scanner: il codice del tasto premuto su PORTA', async () => {
        const { cpu, hw } = await load('Keypad Scanner', (c) => vhw.attachKeypad(c, { port: 'B', rowStart: 0, colStart: 4 }));
        for (const [row, col] of [[0, 0], [2, 1], [3, 3]]) {
            hw.releaseAll();
            hw.pressKey(row, col);
            runCycles(cpu, 3000);
            assert.equal(pins(cpu, 'A'), row * 4 + col, `riga ${row}, colonna ${col}`);
        }
    });

    test('RGB LED Color Cycle: rosso, verde, blu, giallo, ciano, magenta, bianco', async () => {
        const { seen } = await sequence('RGB LED Color Cycle', null, 8, { probe: (c) => pins(c, 'B') & 0x07 });
        assert.deepEqual(seen, [0, 1, 2, 4, 3, 6, 5, 7]);
    });
});

describe('esempi: I2C (877A)', () => {
    test('LCD I2C (PCF8574): due righe sul display', async () => {
        // Regressione: l'impulso di EN non scendeva (variabile condivisa nell'esempio).
        const { cpu, hw } = await load('LCD I²C (PCF8574)', (c) => vhw.attachLcdI2C(c, 0x27));
        runCycles(cpu, 1500000);
        assert.equal(hw.line(1).trim(), 'I2C LCD!');
        assert.equal(hw.line(2).trim(), 'PCF8574');
    });

    test('RTC DS1307 Read: i secondi in BCD avanzano col tempo simulato', async () => {
        const { seen } = await sequence('RTC DS1307 Read', 'B', 3, { attach: i2c(0x68, new ctx.VirtualDS1307()), maxSteps: 4e6 });
        assert.deepEqual(seen, [0x00, 0x01, 0x02]);
    });

    test('EEPROM 24C02 Write: scrive 0x00, 0x11 ... 0xFF negli indirizzi 0-15', async () => {
        const eeprom = new ctx.Virtual24C02(0);
        const { cpu } = await load('EEPROM 24C02 Write', i2c(0x50, eeprom));
        runCycles(cpu, 2000000);
        assert.deepEqual(Array.from(eeprom.memory.slice(0, 16)), Array.from({ length: 16 }, (_, i) => i * 0x11));
    });

    test('BMP280 Read Temp: ID 0x58, poi la temperatura grezza', async () => {
        const { seen } = await sequence('BMP280 Read Temp', 'B', 3, { attach: i2c(0x76, new ctx.VirtualBMP280(false)) });
        assert.equal(seen[1], 0x58);
        assert.notEqual(seen[2], undefined);
    });

    test('LM75, TMP102: 25 gradi su PORTB', async () => {
        const lm75 = new ctx.VirtualLM75(0);
        lm75.setTemperature(25.5);
        assert.deepEqual((await sequence('LM75 Read Temp', 'B', 2, { attach: i2c(0x48, lm75) })).seen, [0, 25]);
        assert.deepEqual((await sequence('TMP102 Read Temp', 'B', 2, { attach: i2c(0x48, new ctx.VirtualTMP102(0)) })).seen, [0, 25]);
    });

    test('SHT21 Temp + Humidity: alterna i byte alti di temperatura e umidita\'', async () => {
        // 25 gradi -> 0x68xx, 50 %RH -> 0x72xx (formule del datasheet)
        const { seen } = await sequence('SHT21 Temp + Humidity', 'B', 5, { attach: i2c(0x40, new ctx.VirtualSHT21()) });
        assert.deepEqual(seen, [0, 0x68, 0x72, 0x68, 0x72]);
    });

    test('MCP23017 I/O Expander: il contatore arriva sulla porta A dell\'expander', async () => {
        const mcp = new ctx.VirtualMCP23017(0);
        const { cpu } = await load('MCP23017 I/O Expander', i2c(0x20, mcp));
        // Regressione: il primo byte dopo l'indirizzo veniva scritto come dato
        // invece di selezionare il registro.
        runCycles(cpu, 800000);
        assert.equal(mcp.registers[0x00], 0x00, 'IODIRA: uscite');
        assert.equal(mcp.registers[0x01], 0xFF, 'IODIRB: ingressi');
        const shown = pins(cpu, 'B');
        assert.ok(shown >= 2, `contatore ${shown}`);
        assert.equal(mcp.registers[0x14], shown, 'OLATA = contatore mostrato su PORTB');
    });

    test('DS3231 RTC + Temp: secondi e poi 25 gradi', async () => {
        const { seen } = await sequence('DS3231 RTC + Temp', 'B', 3, { attach: i2c(0x68, new ctx.VirtualDS3231()) });
        assert.deepEqual(seen, [0x00, 0x19, 0x00]);
    });

    test('MCP9808 Temp + Alerts: ID del costruttore, poi il byte alto di 25 gradi', async () => {
        const { seen } = await sequence('MCP9808 Temp + Alerts', 'B', 3, { attach: i2c(0x18, new ctx.VirtualMCP9808(0)) });
        assert.deepEqual(seen, [0, 0x54, 0x01]);
    });

    test('STTS751 Read + ID: ID 0x53, poi 25 gradi', async () => {
        const { seen } = await sequence('STTS751 Read + ID', 'B', 3, { attach: i2c(0x48, new ctx.VirtualSTTS751(0)) });
        assert.deepEqual(seen, [0, 0x53, 25]);
    });

    test('PCF8563 RTC Read: i secondi in BCD dal registro 0x02', async () => {
        const rtc = new ctx.VirtualPCF8563();
        rtc.registers[0x02] = 0x45;
        const { seen } = await sequence('PCF8563 RTC Read', 'B', 3, { attach: i2c(0x51, rtc), maxSteps: 4e6 });
        assert.deepEqual(seen, [0, 0x45, 0x46]);
    });

    test('SSD1306 OLED Draw: display acceso e scacchiera nella memoria video', async () => {
        const oled = new ctx.VirtualSSD1306(0);
        const { cpu } = await load('SSD1306 OLED Draw', i2c(0x3C, oled));
        runCycles(cpu, 3000000);
        assert.equal(oled.getState().displayOn, true);
        assert.equal(oled.getPixel(0, 0) !== oled.getPixel(1, 0) || oled.getPixel(0, 0) !== oled.getPixel(0, 1), true);
    });
});

describe('esempi: SPI (877A)', () => {
    test('74HC595 Shift Register: Knight Rider sulle uscite del registro', async () => {
        // Regressione: nessun device SPI veniva mai selezionato.
        const { seen } = await sequence('74HC595 Shift Register', null, 10, {
            attach: spi(new ctx.Virtual74HC595()),
            probe: (c, sr) => sr.outputLatch,
        });
        assert.deepEqual(seen, [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x40]);
    });

    test('MAX7219 8-Digit Display: init e cifre 1-8', async () => {
        const max = new ctx.VirtualMAX7219();
        const { cpu } = await load('MAX7219 8-Digit Display', spi(max));
        runCycles(cpu, 100000);
        const s = max.getState();
        assert.deepEqual(Array.from(s.digits), [1, 2, 3, 4, 5, 6, 7, 8]);
        assert.equal(s.shutdown, false);
    });

    test('MCP3008 ADC Read: gli 8 bit bassi del canale 0 su PORTB', async () => {
        const adc = new ctx.VirtualMCP3008();
        adc.setChannel(0, 0x2A5);
        assert.deepEqual((await sequence('MCP3008 ADC Read', 'B', 2, { attach: spi(adc) })).seen, [0, 0xA5]);
    });
});
