/**
 * Virtual Bus System for PIC16 MSSP
 * Bus SPI e I²C virtuali con supporto multi-device.
 */

// ================================================================
//  SPI BUS
// ================================================================

class VirtualSPIBus {
    constructor() {
        /** @type {VirtualSPIDevice[]} */
        this.devices = [];
        this.selectedDevice = -1;
    }

    /**
     * Collega un device al bus SPI.
     * Con `cs` il device e' selezionato dal suo pin di chip select (attivo
     * basso), letto dalla GPIO a ogni ciclo: fronte di discesa = select(),
     * fronte di salita = deselect() (latch del 74HC595, caricamento del
     * MAX7219). Senza `cs` vale la selezione manuale con select(index).
     * @param {VirtualSPIDevice} device
     * @param {{port: string, pin: number}} [cs] - Es. { port: 'A', pin: 0 }
     */
    attach(device, cs) {
        device._cs = cs || null;
        this.devices.push(device);
    }

    /** Livello del pin di chip select: un pin in ingresso resta alto. */
    _csLevel(cpu, cs) {
        var out = cpu.getPortOutput(cs.port);
        if (!out || (out.tris >> cs.pin) & 1) return 1;
        return (out.raw >> cs.pin) & 1;
    }

    /**
     * Segue i pin di chip select. Chiamato dalla MSSP a ogni ciclo e prima
     * di ogni trasferimento.
     * @param {PIC16Core} cpu
     */
    updateChipSelects(cpu) {
        for (var i = 0; i < this.devices.length; i++) {
            var dev = this.devices[i];
            if (!dev._cs) continue;
            var low = this._csLevel(cpu, dev._cs) === 0;
            if (low && !dev.selected) dev.select();
            else if (!low && dev.selected) dev.deselect();
        }
    }

    /**
     * Seleziona un device (via chip select).
     * @param {number} index - Indice device (0-based)
     */
    select(index) {
        if (this.selectedDevice >= 0 && this.selectedDevice < this.devices.length) {
            this.devices[this.selectedDevice].deselect();
        }
        this.selectedDevice = index;
        if (index >= 0 && index < this.devices.length) {
            this.devices[index].select();
        }
    }

    /**
     * Trasferisce un byte (full-duplex SPI).
     * @param {number} byteOut - Byte dal master (MOSI)
     * @returns {number} Byte dal slave (MISO)
     */
    transfer(byteOut) {
        // Device con chip select: ricevono tutti quelli selezionati; MISO dal primo
        var result = null;
        for (var i = 0; i < this.devices.length; i++) {
            var dev = this.devices[i];
            if (dev._cs && dev.selected) {
                var miso = dev.transfer(byteOut);
                if (result === null) result = miso;
            }
        }
        if (result !== null) return result;

        if (this.selectedDevice >= 0 && this.selectedDevice < this.devices.length) {
            return this.devices[this.selectedDevice].transfer(byteOut);
        }
        return 0xFF; // Bus libero = high
    }

    /**
     * Deseleziona tutti i device.
     */
    deselectAll() {
        for (var i = 0; i < this.devices.length; i++) {
            this.devices[i].deselect();
        }
        this.selectedDevice = -1;
    }

    getDeviceCount() { return this.devices.length; }
    
    getDeviceList() {
        return this.devices.map(function(d, i) {
            return { index: i, name: d.name, selected: i === this.selectedDevice };
        }.bind(this));
    }
}

// ================================================================
//  SPI DEVICE BASE
// ================================================================

class VirtualSPIDevice {
    constructor(name) {
        this.name = name || 'SPI Device';
        this.selected = false;
    }

    select() { this.selected = true; }
    deselect() { this.selected = false; }

    /**
     * Full-duplex SPI transfer.
     * @param {number} byteIn - Byte ricevuto (MOSI)
     * @returns {number} Byte da trasmettere (MISO)
     */
    transfer(byteIn) { return 0xFF; }

    reset() {}
    getState() { return { name: this.name }; }
}

// ================================================================
//  I²C BUS
// ================================================================

class VirtualI2CBus {
    constructor() {
        /** @type {Map<number, VirtualI2CDevice>} address → device */
        this.devices = new Map();
        this.currentDevice = null;
        this.started = false;
    }

    /**
     * Collega un device con il suo indirizzo I²C.
     * @param {number} address - Indirizzo 7-bit (es. 0x50)
     * @param {VirtualI2CDevice} device
     */
    attach(address, device) {
        device.address = address;
        this.devices.set(address, device);
    }

    /**
     * Rimuove un device.
     * @param {number} address
     */
    detach(address) {
        this.devices.delete(address);
    }

    /**
     * Avanza nel tempo simulato i device che ne hanno bisogno (RTC).
     * Chiamato dalla MSSP a ogni ciclo istruzione.
     * @param {number} cycles
     */
    tick(cycles) {
        this.devices.forEach(function(dev) { if (dev.tick) dev.tick(cycles); });
    }

    /**
     * START condition.
     */
    start() {
        this.started = true;
        this.currentDevice = null;
        // Notifica tutti i device
        this.devices.forEach(function(dev) { dev.busStart(); });
    }

    /**
     * STOP condition.
     */
    stop() {
        if (this.currentDevice) {
            this.currentDevice.busStop();
        }
        this.started = false;
        this.currentDevice = null;
        this.devices.forEach(function(dev) { dev.busStop(); });
    }

    /**
     * Scrive un byte sul bus.
     * Il primo byte dopo START contiene l'indirizzo (7 bit) + R/W (bit 0).
     * @param {number} value
     * @returns {boolean} true = ACK, false = NACK
     */
    write(value) {
        if (!this.started) return false;

        if (!this.currentDevice) {
            // Primo byte = indirizzo
            var address = (value >> 1) & 0x7F;
            var rw = value & 0x01;

            var dev = this.devices.get(address);
            if (dev) {
                this.currentDevice = dev;
                return dev.busAddress(address, rw);
            }
            return false; // NACK: nessun device a questo indirizzo
        }

        // Byte dati
        return this.currentDevice.busWrite(value);
    }

    /**
     * Legge un byte dal bus (il device corrente trasmette).
     * @returns {number}
     */
    read() {
        if (this.currentDevice) {
            return this.currentDevice.busRead();
        }
        return 0xFF; // Bus libero
    }

    /**
     * Master invia ACK/NACK dopo lettura.
     * @param {boolean} ack - true=ACK, false=NACK
     */
    ack(ack) {
        if (this.currentDevice) {
            this.currentDevice.busAck(ack);
        }
    }

    getDeviceCount() { return this.devices.size; }
    
    getDeviceList() {
        var list = [];
        this.devices.forEach(function(dev, addr) {
            list.push({
                address: '0x' + addr.toString(16).toUpperCase().padStart(2, '0'),
                name: dev.name,
                active: dev === this.currentDevice
            });
        }.bind(this));
        return list;
    }
}

// ================================================================
//  I²C DEVICE BASE
// ================================================================

class VirtualI2CDevice {
    constructor(name, address) {
        this.name = name || 'I2C Device';
        this.address = address || 0x00;
        this.reading = false; // true se master vuole leggere
    }

    /**
     * Bus START condition ricevuta.
     */
    busStart() {}

    /**
     * Bus STOP condition ricevuta.
     */
    busStop() { this.reading = false; }

    /**
     * Indirizzo ricevuto. Ritorna ACK se il device risponde.
     * @param {number} address - Indirizzo 7-bit
     * @param {number} rw - 0=write, 1=read
     * @returns {boolean} ACK
     */
    busAddress(address, rw) {
        if (address === this.address) {
            this.reading = (rw === 1);
            return true; // ACK
        }
        return false;
    }

    /**
     * Byte scritto dal master.
     * @param {number} value
     * @returns {boolean} ACK
     */
    busWrite(value) { return true; }

    /**
     * Master legge un byte.
     * @returns {number}
     */
    busRead() { return 0xFF; }

    /**
     * ACK/NACK dal master dopo lettura.
     * @param {boolean} ack
     */
    busAck(ack) {}

    reset() {}
    getState() { return { name: this.name, address: this.address }; }
}

// ================================================================
//  EXPORTS
// ================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VirtualSPIBus: VirtualSPIBus,
        VirtualSPIDevice: VirtualSPIDevice,
        VirtualI2CBus: VirtualI2CBus,
        VirtualI2CDevice: VirtualI2CDevice
    };
}
