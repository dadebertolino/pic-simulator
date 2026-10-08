/**
 * VirtualSTTS751 — ST 12-bit Temperature Sensor
 * I²C @ 0x48-0x4F (A2:A1:A0 + product variant)
 * Pointer byte selects register: 0x00=temp MSB, 0x02=temp LSB,
 * 0x03=config, 0x04=conv rate, 0x05=T_high MSB, 0x07=T_low MSB,
 * 0x01=status, 0xFE=manuf ID(0x53), 0xFF=rev
 */
class VirtualSTTS751 extends VirtualI2CDevice {
    constructor(a2a1a0) {
        super('STTS751 Temp', 0x48 | ((a2a1a0 || 0) & 0x07));
        this._temperature = 25.0;
        this._pointer = 0;
        this._pointerSet = false;
        this._config = 0x0C;    // 12-bit resolution
        this._status = 0x00;
        this._tHighMSB = 0x50;  // 80°C
        this._tLowMSB = 0x00;   // 0°C
        this._convRate = 0x04;   // 1 Hz
    }

    setTemperature(c) {
        this._temperature = Math.max(-64, Math.min(127.9375, c));
        // Update status flags
        this._status &= 0xFC;
        if (this._temperature > this._tHighMSB) this._status |= 0x01; // T_HIGH flag
        if (this._temperature < this._tLowMSB) this._status |= 0x02;  // T_LOW flag
    }

    busStart() {
        this._pointerSet = false;
    }

    busWrite(value) {
        if (!this._pointerSet) {
            this._pointer = value;
            this._pointerSet = true;
        } else {
            switch (this._pointer) {
                case 0x03: this._config = value; break;
                case 0x04: this._convRate = value; break;
                case 0x05: this._tHighMSB = value; this.setTemperature(this._temperature); break;
                case 0x07: this._tLowMSB = value; this.setTemperature(this._temperature); break;
            }
        }
        return true;
    }

    busRead() {
        var raw, val;
        switch (this._pointer) {
            case 0x00: // Temp MSB (integer + sign)
                raw = Math.round(this._temperature);
                return raw < 0 ? (256 + raw) & 0xFF : raw & 0xFF;
            case 0x02: // Temp LSB (fraction in upper nibble, 0.0625°C steps)
                raw = Math.round(this._temperature * 16);
                return (raw & 0x0F) << 4;
            case 0x01: return this._status;
            case 0x03: return this._config;
            case 0x04: return this._convRate;
            case 0x05: return this._tHighMSB;
            case 0x07: return this._tLowMSB;
            case 0xFE: return 0x53; // Manufacturer ID (ST)
            case 0xFF: return 0x01; // Revision
            default: return 0;
        }
    }

    getTemperature() { return this._temperature; }

    getState() {
        return { name: this.name, address: this.address,
            temperature: this._temperature.toFixed(2) + ' °C',
            status: this._status };
    }
}
