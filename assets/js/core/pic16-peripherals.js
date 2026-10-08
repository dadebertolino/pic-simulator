/**
 * PIC16 Peripheral System
 * Classe base per periferiche pluggabili e registry per il core CPU.
 * 
 * Ogni periferica si registra con gli indirizzi SFR che gestisce.
 * Il core CPU delega read/write a questi hook e chiama tick() ogni ciclo.
 */

// === BASE CLASS ===

class PIC16Peripheral {
    /**
     * @param {string} name - Nome univoco periferica (es. 'TMR0', 'GPIO_A')
     * @param {PIC16Core} cpu - Riferimento al core CPU
     */
    constructor(name, cpu) {
        this.name = name;
        this.cpu = cpu;
    }

    /**
     * Restituisce gli indirizzi SFR gestiti da questa periferica.
     * Il core li usa per instradare read/write.
     * @returns {number[]} Array di indirizzi effettivi (es. [0x05, 0x85])
     */
    getRegisters() {
        return [];
    }

    /**
     * Lettura di un registro SFR gestito da questa periferica.
     * @param {number} addr - Indirizzo effettivo
     * @returns {number} Valore letto (0-255)
     */
    read(addr) {
        return this.cpu.ram[addr];
    }

    /**
     * Scrittura di un registro SFR gestito da questa periferica.
     * @param {number} addr - Indirizzo effettivo
     * @param {number} value - Valore da scrivere (0-255)
     */
    write(addr, value) {
        this.cpu.ram[addr] = value;
    }

    /**
     * Chiamato ogni ciclo CPU. Usato per timer, contatori, etc.
     * @param {number} cycles - Numero cicli trascorsi (normalmente 1)
     */
    tick(cycles) {
        // Override nelle sottoclassi
    }

    /**
     * Reset della periferica ai valori iniziali.
     */
    reset() {
        // Override nelle sottoclassi
    }

    /**
     * Restituisce lo stato per debug/UI.
     * @returns {object}
     */
    getState() {
        return {};
    }

    // === Utility per accesso ai bit della RAM CPU ===

    /** Legge un byte dalla RAM del core */
    readRam(addr) {
        return this.cpu.ram[addr];
    }

    /** Scrive un byte nella RAM del core */
    writeRam(addr, value) {
        this.cpu.ram[addr] = value & 0xFF;
    }

    /** Legge un bit dalla RAM */
    readBit(addr, bit) {
        return (this.cpu.ram[addr] >> bit) & 0x01;
    }

    /** Setta un bit nella RAM */
    setBit(addr, bit) {
        this.cpu.ram[addr] |= (1 << bit);
    }

    /** Resetta un bit nella RAM */
    clearBit(addr, bit) {
        this.cpu.ram[addr] &= ~(1 << bit);
    }

    /** Notifica cambio porta alla UI */
    notifyPortChange(port, value) {
        this.cpu.notifyPortChange(port, value);
    }

    /** Notifica cambio registro alla UI */
    notifyRegisterChange(name, value) {
        this.cpu.notifyRegisterChange(name, value);
    }
}

// === PERIPHERAL REGISTRY ===

class PIC16PeripheralRegistry {
    constructor() {
        /** @type {Map<string, PIC16Peripheral>} Nome → istanza */
        this.peripherals = new Map();
        
        /** @type {Map<number, PIC16Peripheral>} Indirizzo SFR → periferica che lo gestisce */
        this.addressMap = new Map();
        
        /** @type {PIC16Peripheral[]} Lista ordinata per tick() */
        this.tickList = [];
    }

    /**
     * Registra una periferica. I suoi indirizzi SFR vengono mappati.
     * @param {PIC16Peripheral} peripheral
     */
    register(peripheral) {
        this.peripherals.set(peripheral.name, peripheral);
        
        for (const addr of peripheral.getRegisters()) {
            this.addressMap.set(addr, peripheral);
        }
        
        this.tickList.push(peripheral);
    }

    /**
     * Rimuove una periferica.
     * @param {string} name
     */
    unregister(name) {
        const p = this.peripherals.get(name);
        if (!p) return;
        
        for (const addr of p.getRegisters()) {
            this.addressMap.delete(addr);
        }
        
        this.peripherals.delete(name);
        this.tickList = this.tickList.filter(x => x.name !== name);
    }

    /**
     * Controlla se un indirizzo è gestito da una periferica.
     * @param {number} addr - Indirizzo effettivo
     * @returns {PIC16Peripheral|null}
     */
    getHandler(addr) {
        return this.addressMap.get(addr) || null;
    }

    /**
     * Chiama tick() su tutte le periferiche registrate.
     * @param {number} cycles
     */
    tickAll(cycles) {
        for (const p of this.tickList) {
            p.tick(cycles);
        }
    }

    /**
     * Reset di tutte le periferiche.
     */
    resetAll() {
        for (const p of this.tickList) {
            p.reset();
        }
    }

    /**
     * Restituisce periferica per nome.
     * @param {string} name
     * @returns {PIC16Peripheral|null}
     */
    get(name) {
        return this.peripherals.get(name) || null;
    }

    /**
     * Lista nomi periferiche registrate.
     * @returns {string[]}
     */
    list() {
        return Array.from(this.peripherals.keys());
    }

    /**
     * Stato di tutte le periferiche per debug.
     * @returns {object}
     */
    getState() {
        const state = {};
        for (const [name, p] of this.peripherals) {
            state[name] = p.getState();
        }
        return state;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PIC16Peripheral, PIC16PeripheralRegistry };
}
