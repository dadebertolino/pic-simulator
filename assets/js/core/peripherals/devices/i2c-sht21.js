class VirtualSHT21 extends VirtualI2CDevice {
    /**
     * SHT21 / HTU21D: temp + humidity
     * Indirizzo fisso 0x40
     * Comandi: 0xE3=trigger temp (hold), 0xE5=trigger RH (hold),
     *          0xF3=trigger temp (no hold), 0xF5=trigger RH (no hold),
     *          0xE6=write user reg, 0xE7=read user reg, 0xFE=soft reset
     */
    constructor() {
        super('SHT21 T/RH', 0x40);
        this._temperature = 25.0;  // °C
        this._humidity = 50.0;     // %RH
        this._userReg = 0x02;      // Default: 12-bit RH, 14-bit temp
        this._command = -1;
        this._readIndex = 0;
        this._readData = [];
    }

    setTemperature(celsius) {
        this._temperature = Math.max(-40, Math.min(125, celsius));
    }

    setHumidity(rh) {
        this._humidity = Math.max(0, Math.min(100, rh));
    }

    busAddress(address, rw) {
        if (address !== this.address) return false;
        this._readIndex = 0;
        return true;
    }

    busWrite(value) {
        this._command = value;
        if (value === 0xFE) {
            // Soft reset
            this._userReg = 0x02;
        } else if (value === 0xE3 || value === 0xF3) {
            // Trigger temperature measurement
            this._prepTempData();
        } else if (value === 0xE5 || value === 0xF5) {
            // Trigger humidity measurement
            this._prepHumData();
        } else if (value === 0xE7) {
            // Read user register
            this._readData = [this._userReg];
        } else if (value === 0xE6) {
            // Next write will be user reg value (simplified)
            this._command = 0xE6;
        } else if (this._command === 0xE6) {
            this._userReg = value;
            this._command = -1;
        }
        this._readIndex = 0;
        return true;
    }

    busRead() {
        if (this._readIndex < this._readData.length) {
            return this._readData[this._readIndex++];
        }
        return 0xFF;
    }

    _prepTempData() {
        // Formula: S_temp = (T + 46.85) * 65536 / 175.72
        var raw = Math.round((this._temperature + 46.85) * 65536 / 175.72);
        raw = Math.max(0, Math.min(0xFFFC, raw)) & 0xFFFC;
        // Status bits [1:0] = 00 for temperature
        var crc = this._crc8([(raw >> 8) & 0xFF, raw & 0xFF]);
        this._readData = [(raw >> 8) & 0xFF, raw & 0xFF, crc];
    }

    _prepHumData() {
        // Formula: S_rh = (RH + 6) * 65536 / 125
        var raw = Math.round((this._humidity + 6) * 65536 / 125);
        raw = Math.max(0, Math.min(0xFFFC, raw)) & 0xFFFC;
        // Status bits [1:0] = 10 for humidity
        raw |= 0x02;
        var crc = this._crc8([(raw >> 8) & 0xFF, raw & 0xFF]);
        this._readData = [(raw >> 8) & 0xFF, raw & 0xFF, crc];
    }

    _crc8(data) {
        var crc = 0;
        for (var i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (var b = 0; b < 8; b++) {
                if (crc & 0x80) crc = ((crc << 1) ^ 0x131) & 0xFF;
                else crc = (crc << 1) & 0xFF;
            }
        }
        return crc;
    }

    getTemperature() { return this._temperature; }
    getHumidity() { return this._humidity; }

    getState() {
        return {
            name: this.name, address: this.address,
            temperature: this._temperature.toFixed(1) + ' °C',
            humidity: this._humidity.toFixed(1) + ' %RH'
        };
    }
}
