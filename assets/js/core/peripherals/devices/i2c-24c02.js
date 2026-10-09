class Virtual24C02 extends VirtualI2CDevice {
    /**
     * @param {number} [a2a1a0=0] - Bit indirizzo hardware (0-7)
     */
    constructor(a2a1a0) {
        super('24C02 EEPROM', 0x50 | ((a2a1a0 || 0) & 0x07));
        this.memory = new Uint8Array(256);
        this.wordAddr = 0;
        this.wordAddrSet = false;
    }

    busStart() { this.wordAddrSet = false; }

    busWrite(value) {
        if (!this.wordAddrSet) {
            this.wordAddr = value & 0xFF;
            this.wordAddrSet = true;
        } else {
            this.memory[this.wordAddr] = value;
            this.wordAddr = (this.wordAddr + 1) & 0xFF;
        }
        return true;
    }

    busRead() {
        var val = this.memory[this.wordAddr];
        this.wordAddr = (this.wordAddr + 1) & 0xFF;
        return val;
    }

    reset() { this.memory.fill(0xFF); this.wordAddr = 0; this.wordAddrSet = false; }

    getState() {
        return { name: this.name, address: this.address, size: 256, wordAddr: this.wordAddr };
    }
}
