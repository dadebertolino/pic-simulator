/**
 * VirtualTMP102 — 12-bit Temperature Sensor (TI)
 * I²C @ 0x48-0x4B (A0 pin selects)
 * Pointer: 0=temp(RO), 1=config, 2=T_low, 3=T_high
 * Temp: 12-bit signed, 0.0625°C, left-justified in 16-bit word
 */
class VirtualTMP102 extends VirtualI2CDevice {
    constructor(a0) {
        super('TMP102 Temp', 0x48 | ((a0 || 0) & 0x03));
        this._temperature = 25.0;
        this._pointer = 0;
        this._pointerSet = false;
        this._readIndex = 0;
        this._writeBuffer = [];
        this._config = 0x60A0;  // 12-bit, 4Hz, comparator mode
        this._tLow = 0x4B00;   // 75°C default
        this._tHigh = 0x5000;  // 80°C default
        this._alert = false;
    }

    setTemperature(c) {
        this._temperature = Math.max(-55, Math.min(150, c));
        this._checkAlert();
    }

    _tempToReg(c) {
        var raw = Math.round(c / 0.0625);
        if (raw < 0) raw = 0x1000 + raw;
        return (raw << 4) & 0xFFF0;
    }

    _regToTemp(reg) {
        var raw = (reg >> 4) & 0x0FFF;
        if (raw & 0x0800) raw = raw - 0x1000;
        return raw * 0.0625;
    }

    _checkAlert() {
        var tHigh = this._regToTemp(this._tHigh);
        var tLow = this._regToTemp(this._tLow);
        this._alert = (this._temperature >= tHigh) || (this._temperature <= tLow);
    }

    busStart() {
        this._pointerSet = false;
        this._readIndex = 0;
        this._writeBuffer = [];
    }

    busWrite(value) {
        if (!this._pointerSet) {
            this._pointer = value & 0x03;
            this._pointerSet = true;
            this._readIndex = 0;
        } else {
            this._writeBuffer.push(value);
            if (this._writeBuffer.length === 2) {
                var val = (this._writeBuffer[0] << 8) | this._writeBuffer[1];
                if (this._pointer === 1) this._config = val;
                else if (this._pointer === 2) { this._tLow = val; this._checkAlert(); }
                else if (this._pointer === 3) { this._tHigh = val; this._checkAlert(); }
                this._writeBuffer = [];
            }
        }
        return true;
    }

    busRead() {
        var reg;
        if (this._pointer === 0) reg = this._tempToReg(this._temperature);
        else if (this._pointer === 1) reg = this._config | (this._alert ? 0x0020 : 0);
        else if (this._pointer === 2) reg = this._tLow;
        else reg = this._tHigh;
        var val = this._readIndex === 0 ? (reg >> 8) & 0xFF : reg & 0xFF;
        this._readIndex++;
        return val;
    }

    getTemperature() { return this._temperature; }
    isAlert() { return this._alert; }

    getState() {
        return { name: this.name, address: this.address,
            temperature: this._temperature.toFixed(2) + ' °C', alert: this._alert };
    }
}
