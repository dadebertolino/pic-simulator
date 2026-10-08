/**
 * VirtualDS3231 — RTC con compensazione temperatura
 * I²C @ 0x68 (stesso del DS1307)
 * Registri: 0x00-0x06 = time (come DS1307), 0x07-0x0A = alarm1,
 * 0x0B-0x0D = alarm2, 0x0E = control, 0x0F = status, 0x11 = temp MSB, 0x12 = temp LSB
 */
class VirtualDS3231 extends VirtualI2CDevice {
    constructor() {
        super('DS3231 RTC', 0x68);
        this.registers = new Uint8Array(19); // 0x00-0x12
        this.regPointer = 0;
        this.pointerSet = false;
        this.running = true;
        this._tickCounter = 0;
        this._tickRate = 1000;
        this._temperature = 25.0; // Internal temp sensor

        this._setCurrentTime();
        this.registers[0x0E] = 0x1C; // Control: INTCN=1, default
        this.registers[0x0F] = 0x00; // Status
        this._updateTempRegs();
    }

    _setCurrentTime() {
        var now = new Date();
        this.registers[0] = this._toBCD(now.getSeconds());
        this.registers[1] = this._toBCD(now.getMinutes());
        this.registers[2] = this._toBCD(now.getHours()); // 24h
        this.registers[3] = now.getDay() + 1;
        this.registers[4] = this._toBCD(now.getDate());
        this.registers[5] = this._toBCD(now.getMonth() + 1);
        this.registers[6] = this._toBCD(now.getFullYear() % 100);
    }

    _toBCD(val) {
        val = Math.max(0, Math.min(99, val));
        return ((Math.floor(val / 10) & 0x0F) << 4) | (val % 10);
    }

    _fromBCD(bcd) {
        return ((bcd >> 4) & 0x0F) * 10 + (bcd & 0x0F);
    }

    _updateTempRegs() {
        // Temp: 10-bit, 0.25°C resolution, 2's complement
        var raw = Math.round(this._temperature * 4);
        if (raw < 0) raw = 0x400 + raw;
        this.registers[0x11] = (raw >> 2) & 0xFF;
        this.registers[0x12] = (raw & 0x03) << 6;
    }

    busStart() { this.pointerSet = false; }

    busWrite(value) {
        if (!this.pointerSet) {
            this.regPointer = value & 0x12 >= 0x12 ? value & 0xFF : value & 0x1F;
            this.pointerSet = true;
        } else {
            if (this.regPointer <= 0x12) this.registers[this.regPointer] = value;
            if (this.regPointer === 0) this.running = !(value & 0x80);
            // Clear alarm flags if written to status
            if (this.regPointer === 0x0F) this.registers[0x0F] = value & 0xFC;
            this.regPointer = (this.regPointer + 1) & 0x1F;
        }
        return true;
    }

    busRead() {
        var val = this.regPointer <= 0x12 ? this.registers[this.regPointer] : 0;
        this.regPointer = (this.regPointer + 1) & 0x1F;
        return val;
    }

    tick(cycles) {
        if (!this.running) return;
        this._tickCounter += cycles;
        if (this._tickCounter >= this._tickRate) {
            this._tickCounter -= this._tickRate;
            this._incrementSecond();
            this._checkAlarms();
        }
    }

    _incrementSecond() {
        var sec = this._fromBCD(this.registers[0] & 0x7F);
        sec++;
        if (sec >= 60) {
            sec = 0;
            var min = this._fromBCD(this.registers[1]);
            min++;
            if (min >= 60) {
                min = 0;
                var hr = this._fromBCD(this.registers[2] & 0x3F);
                hr++;
                if (hr >= 24) hr = 0;
                this.registers[2] = this._toBCD(hr);
            }
            this.registers[1] = this._toBCD(min);
        }
        this.registers[0] = this._toBCD(sec);
    }

    _checkAlarms() {
        // Alarm 1: compare sec/min/hr/day based on mask bits (A1M1-A1M4)
        var a1m1 = this.registers[0x07] & 0x80;
        var a1m2 = this.registers[0x08] & 0x80;
        var a1m3 = this.registers[0x09] & 0x80;
        var a1m4 = this.registers[0x0A] & 0x80;
        var match = true;
        if (!a1m1 && (this.registers[0x07] & 0x7F) !== this.registers[0]) match = false;
        if (!a1m2 && (this.registers[0x08] & 0x7F) !== this.registers[1]) match = false;
        if (!a1m3 && (this.registers[0x09] & 0x3F) !== this.registers[2]) match = false;
        if (match && !a1m1) this.registers[0x0F] |= 0x01; // A1F

        // Alarm 2: min/hr/day
        var a2m2 = this.registers[0x0B] & 0x80;
        var a2m3 = this.registers[0x0C] & 0x80;
        var a2m4 = this.registers[0x0D] & 0x80;
        var match2 = true;
        if (!a2m2 && (this.registers[0x0B] & 0x7F) !== this.registers[1]) match2 = false;
        if (!a2m3 && (this.registers[0x0C] & 0x3F) !== this.registers[2]) match2 = false;
        if (match2 && !a2m2) this.registers[0x0F] |= 0x02; // A2F
    }

    setTemperature(t) {
        this._temperature = Math.max(-40, Math.min(85, t));
        this._updateTempRegs();
    }

    setTime(h, m, s) {
        this.registers[0] = this._toBCD(s);
        this.registers[1] = this._toBCD(m);
        this.registers[2] = this._toBCD(h);
    }

    getTime() {
        return {
            seconds: this._fromBCD(this.registers[0] & 0x7F),
            minutes: this._fromBCD(this.registers[1]),
            hours: this._fromBCD(this.registers[2] & 0x3F),
            day: this.registers[3],
            date: this._fromBCD(this.registers[4]),
            month: this._fromBCD(this.registers[5] & 0x1F),
            year: 2000 + this._fromBCD(this.registers[6]),
            running: this.running,
            temperature: this._temperature,
            alarm1: !!(this.registers[0x0F] & 0x01),
            alarm2: !!(this.registers[0x0F] & 0x02)
        };
    }

    getState() {
        var t = this.getTime();
        return {
            name: this.name, address: this.address,
            time: t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0'),
            temperature: this._temperature
        };
    }
}
