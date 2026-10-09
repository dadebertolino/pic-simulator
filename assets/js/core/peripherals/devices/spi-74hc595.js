class Virtual74HC595 extends VirtualSPIDevice {
    constructor() {
        super('74HC595 Shift Reg');
        this.shiftReg = 0x00;
        this.outputLatch = 0x00;
        this.bitCount = 0;
        this.onOutputChange = null;
    }

    select() {
        this.selected = true;
        this.bitCount = 0;
        this.shiftReg = 0x00;
    }

    transfer(byteIn) {
        // MSB first shift in
        this.shiftReg = byteIn;
        return this.outputLatch; // Shift out previous value
    }

    deselect() {
        // Rising edge of latch clock: transfer shift → output
        this.outputLatch = this.shiftReg;
        this.selected = false;
        if (this.onOutputChange) this.onOutputChange(this.outputLatch);
    }

    getState() {
        return { name: this.name, shift: this.shiftReg, output: this.outputLatch };
    }
}
