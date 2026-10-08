class VirtualLM75 extends VirtualI2CDevice {
    /**
     * @param {number} [a2a1a0=0] - Bit indirizzo (0-7)
     */
    constructor(a2a1a0) {
        super('LM75 Temp', 0x48 | ((a2a1a0 || 0) & 0x07));
        this.temperature = 25.0; // °C, impostabile dalla UI
        this.pointer = 0;       // Registro puntatore: 0=temp, 1=config, 2=Thyst, 3=Tos
        this.config = 0x00;
        this.thyst = 75 * 2;    // 75°C
        this.tos = 80 * 2;      // 80°C
        this.readIndex = 0;
    }

    busAddress(address, rw) {
        if (address === this.address) {
            this.reading = (rw === 1);
            this.readIndex = 0;
            return true;
        }
        return false;
    }

    busWrite(value) {
        this.pointer = value & 0x03;
        return true;
    }

    busRead() {
        var val = 0;
        if (this.pointer === 0) {
            // Temperature register (16-bit, 9-bit resolution)
            var raw = Math.round(this.temperature * 2) & 0x1FF;
            if (this.temperature < 0) raw = ((~Math.round(-this.temperature * 2)) + 1) & 0x1FF;
            if (this.readIndex === 0) val = (raw >> 1) & 0xFF;
            else val = (raw & 0x01) << 7;
        } else if (this.pointer === 1) {
            val = this.config;
        }
        this.readIndex++;
        return val;
    }

    /**
     * Imposta temperatura simulata.
     * @param {number} celsius - Es. 25.5
     */
    setTemperature(celsius) {
        this.temperature = Math.max(-55, Math.min(125, celsius));
    }

    getState() {
        return { name: this.name, address: this.address, temperature: this.temperature };
    }
}
