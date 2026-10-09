/**
 * VirtualMCP9808 — High accuracy temperature sensor
 * I²C @ 0x18-0x1F (A2:A1:A0 configurabili)
 * Registri: 0x00=RFU, 0x01=config, 0x02=T_upper, 0x03=T_lower,
 * 0x04=T_critical, 0x05=T_ambient, 0x06=manufacturer ID, 0x07=device ID,
 * 0x08=resolution
 * T_ambient: 13-bit signed, 0.0625°C resolution
 */
class VirtualMCP9808 extends VirtualI2CDevice {
    constructor(a2a1a0) {
        super('MCP9808 Temp', 0x18 | ((a2a1a0 || 0) & 0x07));
        this._temperature = 25.0;
        this._pointer = 0x05; // Default: read ambient
        this._pointerSet = false;
        this._writeBuffer = [];

        // Registers (16-bit, stored as pairs)
        this._regs = {
            0x01: 0x0000, // Config
            0x02: 0x0000, // T_upper
            0x03: 0x0000, // T_lower
            0x04: 0x0000, // T_critical
            0x05: 0x0000, // T_ambient (read-only, computed)
            0x06: 0x0054, // Manufacturer ID = 0x0054
            0x07: 0x0400, // Device ID = 0x04, revision 0x00
            0x08: 0x0003  // Resolution: 13-bit (0.0625°C)
        };
        this._readIndex = 0;
        this._updateAmbient();
    }

    setTemperature(celsius) {
        this._temperature = Math.max(-40, Math.min(125, celsius));
        this._updateAmbient();
    }

    _updateAmbient() {
        // 13-bit signed, 0.0625°C per LSB
        // Bit 12 = sign, bits 11-4 = integer, bits 3-0 = fraction
        var raw = Math.round(this._temperature / 0.0625);
        var reg = 0;
        if (raw < 0) {
            reg = 0x1000 | ((-raw) & 0x0FFF); // Sign bit + magnitude
        } else {
            reg = raw & 0x0FFF;
        }
        // Alert flags in bits 15-13
        var upper = this._tempFromReg(this._regs[0x02]);
        var lower = this._tempFromReg(this._regs[0x03]);
        var critical = this._tempFromReg(this._regs[0x04]);
        if (this._temperature >= critical) reg |= 0x8000;  // TA >= TCRIT
        if (this._temperature > upper) reg |= 0x4000;      // TA > TUPPER
        if (this._temperature < lower) reg |= 0x2000;      // TA < TLOWER
        this._regs[0x05] = reg;
    }

    _tempFromReg(reg) {
        var raw = reg & 0x0FFF;
        if (reg & 0x1000) return -(raw * 0.0625);
        return raw * 0.0625;
    }

    busStart() {
        this._pointerSet = false;
        this._writeBuffer = [];
        this._readIndex = 0;
    }

    busWrite(value) {
        if (!this._pointerSet) {
            this._pointer = value & 0x0F;
            this._pointerSet = true;
            this._readIndex = 0;
        } else {
            this._writeBuffer.push(value);
            // 16-bit register write (2 bytes)
            if (this._writeBuffer.length === 2) {
                var regVal = (this._writeBuffer[0] << 8) | this._writeBuffer[1];
                if (this._pointer >= 0x01 && this._pointer <= 0x04) {
                    this._regs[this._pointer] = regVal;
                    this._updateAmbient(); // Recalc alert flags
                } else if (this._pointer === 0x08) {
                    this._regs[0x08] = regVal & 0x0003;
                }
                this._writeBuffer = [];
            }
        }
        return true;
    }

    busRead() {
        var reg = this._regs[this._pointer] || 0;
        var val;
        if (this._readIndex === 0) {
            val = (reg >> 8) & 0xFF; // MSB
        } else {
            val = reg & 0xFF; // LSB
        }
        this._readIndex++;
        return val;
    }

    getTemperature() { return this._temperature; }

    getAlertFlags() {
        var amb = this._regs[0x05];
        return {
            critical: !!(amb & 0x8000),
            upper: !!(amb & 0x4000),
            lower: !!(amb & 0x2000)
        };
    }

    getState() {
        var flags = this.getAlertFlags();
        return {
            name: this.name, address: this.address,
            temperature: this._temperature.toFixed(2) + ' °C',
            alerts: (flags.critical ? 'CRIT ' : '') + (flags.upper ? 'HIGH ' : '') + (flags.lower ? 'LOW ' : '') || 'none'
        };
    }
}
