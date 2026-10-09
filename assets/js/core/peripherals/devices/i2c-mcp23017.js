class VirtualMCP23017 extends VirtualI2CDevice {
    constructor(a2a1a0) {
        super('MCP23017 16-IO', 0x20 | ((a2a1a0 || 0) & 0x07));
        // 22 registri (BANK=0 mode)
        this.registers = new Uint8Array(22);
        this.registers[0x00] = 0xFF; // IODIRA (all input)
        this.registers[0x01] = 0xFF; // IODIRB
        this.regPointer = 0;
        this.autoIncrement = true;
        
        this.inputA = 0x00;
        this.inputB = 0x00;
        this.onOutputChange = null;
    }

    busStart() { /* regPointer preserved */ }

    busAddress(address, rw) {
        if (address === this.address) {
            this.reading = (rw === 1);
            // In scrittura il primo byte e' l'indirizzo del registro; in
            // lettura (anche dopo un restart) il puntatore resta.
            this._expectPointer = !this.reading;
            return true;
        }
        return false;
    }

    busWrite(value) {
        if (!this.reading) {
            if (this._expectPointer) {
                this.regPointer = value % 22; // 0x00-0x15 in BANK = 0
                this._expectPointer = false;
            } else {
                this.registers[this.regPointer] = value;
                if (this.regPointer === 0x12 || this.regPointer === 0x13) {
                    // GPIOA/GPIOB write
                    if (this.onOutputChange) {
                        this.onOutputChange(this.registers[0x12], this.registers[0x13]);
                    }
                }
                if (this.autoIncrement) this.regPointer = (this.regPointer + 1) % 22;
            }
        }
        return true;
    }

    busRead() {
        var val;
        if (this.regPointer === 0x12) val = this._readGPIO('A');
        else if (this.regPointer === 0x13) val = this._readGPIO('B');
        else val = this.registers[this.regPointer] || 0;
        
        if (this.autoIncrement) this.regPointer = (this.regPointer + 1) % 22;
        return val;
    }

    _readGPIO(port) {
        var iodir = port === 'A' ? this.registers[0x00] : this.registers[0x01];
        var olat = port === 'A' ? this.registers[0x14] : this.registers[0x15];
        var ext = port === 'A' ? this.inputA : this.inputB;
        var result = 0;
        for (var i = 0; i < 8; i++) {
            if (iodir & (1 << i)) result |= (ext & (1 << i));
            else result |= (olat & (1 << i));
        }
        return result;
    }

    setInputA(value) { this.inputA = value & 0xFF; }
    setInputB(value) { this.inputB = value & 0xFF; }

    getState() {
        return {
            name: this.name, address: this.address,
            gpioA: this.registers[0x12], gpioB: this.registers[0x13],
            iodirA: this.registers[0x00], iodirB: this.registers[0x01]
        };
    }
}
