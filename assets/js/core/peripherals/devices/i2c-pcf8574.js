class VirtualPCF8574 extends VirtualI2CDevice {
    /**
     * @param {number} [a2a1a0=7] - Default 0x27 (PCF8574A) o 0x20 (PCF8574)
     * @param {boolean} [isTypeA=true] - true=PCF8574A (0x38-0x3F), false=PCF8574 (0x20-0x27)
     */
    constructor(a2a1a0, isTypeA) {
        var base = isTypeA !== false ? 0x38 : 0x20;
        super('PCF8574 I/O', base | ((a2a1a0 !== undefined ? a2a1a0 : 7) & 0x07));
        this.outputLatch = 0xFF; // All high (input mode)
        this.inputPins = 0xFF;   // External input state

        // Callback per UI: chiamato quando l'output cambia
        this.onOutputChange = null;
    }

    busWrite(value) {
        this.outputLatch = value;
        if (this.onOutputChange) this.onOutputChange(value);
        return true;
    }

    busRead() {
        // Lettura: output latch AND pin esterni
        return this.outputLatch & this.inputPins;
    }

    /**
     * Imposta pin esterni (dalla UI, es. busy flag LCD).
     * @param {number} value - 8-bit
     */
    setInputPins(value) { this.inputPins = value & 0xFF; }

    getState() {
        return { name: this.name, address: this.address, output: this.outputLatch, input: this.inputPins };
    }
}
