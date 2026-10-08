class VirtualMAX7219 extends VirtualSPIDevice {
    constructor() {
        super('MAX7219 LED');
        this.digits = new Uint8Array(8);       // Digit data
        this.intensity = 0x0F;                   // Brightness
        this.scanLimit = 7;                      // Active digits
        this.decodeMode = 0x00;                  // BCD decode
        this.shutdown = true;                    // Shutdown on reset
        this.displayTest = false;

        this.rxBuffer = [];
        this.onDisplayChange = null;
    }

    select() {
        this.selected = true;
        this.rxBuffer = [];
    }

    transfer(byteIn) {
        this.rxBuffer.push(byteIn);
        return 0;
    }

    deselect() {
        this.selected = false;
        // Processa comando (16-bit: address + data)
        if (this.rxBuffer.length >= 2) {
            var addr = this.rxBuffer[0] & 0x0F;
            var data = this.rxBuffer[1];
            this._processCommand(addr, data);
        }
        this.rxBuffer = [];
    }

    _processCommand(addr, data) {
        switch (addr) {
            case 0x00: break; // NOP
            case 0x01: case 0x02: case 0x03: case 0x04:
            case 0x05: case 0x06: case 0x07: case 0x08:
                this.digits[addr - 1] = data;
                break;
            case 0x09: this.decodeMode = data; break;
            case 0x0A: this.intensity = data & 0x0F; break;
            case 0x0B: this.scanLimit = data & 0x07; break;
            case 0x0C: this.shutdown = !(data & 0x01); break;
            case 0x0F: this.displayTest = !!(data & 0x01); break;
        }
        if (this.onDisplayChange) this.onDisplayChange(this.getDisplayData());
    }

    /**
     * Restituisce dati display per rendering UI.
     * @returns {{ digits: number[], intensity: number, active: number, shutdown: boolean }}
     */
    getDisplayData() {
        return {
            digits: Array.from(this.digits),
            intensity: this.intensity,
            active: this.scanLimit + 1,
            shutdown: this.shutdown,
            displayTest: this.displayTest,
            decodeMode: this.decodeMode
        };
    }

    getState() {
        return {
            name: this.name,
            digits: Array.from(this.digits),
            intensity: this.intensity,
            shutdown: this.shutdown
        };
    }
}
