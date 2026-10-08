/**
 * VirtualPCF8563 — NXP Real Time Clock
 * I²C @ 0x51 (fixed)
 * Regs: 0x00=ctrl1, 0x01=ctrl2, 0x02=seconds, 0x03=minutes,
 * 0x04=hours, 0x05=days, 0x06=weekdays, 0x07=months, 0x08=years
 * 0x09-0x0C=alarm, 0x0D=CLKOUT, 0x0E=timer ctrl, 0x0F=timer
 * BCD format, VL bit = bit7 of seconds (clock integrity)
 */
class VirtualPCF8563 extends VirtualI2CDevice {
    constructor() {
        super('PCF8563 RTC', 0x51);
        this.registers = new Uint8Array(16);
        this.regPointer = 0;
        this.pointerSet = false;
        this.running = true;
        this._tickCounter = 0;
        this._tickRate = 1000;
        // Timer
        this._timerCounter = 0;
        this._timerEnabled = false;

        this._setCurrentTime();
    }

    _setCurrentTime() {
        var now = new Date();
        this.registers[0x00] = 0x00; // Control1: normal mode
        this.registers[0x01] = 0x00; // Control2: no alarms/timer
        this.registers[0x02] = this._toBCD(now.getSeconds());    // VL=0 (clock OK)
        this.registers[0x03] = this._toBCD(now.getMinutes());
        this.registers[0x04] = this._toBCD(now.getHours());
        this.registers[0x05] = this._toBCD(now.getDate());
        this.registers[0x06] = now.getDay(); // 0-6
        this.registers[0x07] = this._toBCD(now.getMonth() + 1); // Century bit=0
        this.registers[0x08] = this._toBCD(now.getFullYear() % 100);
        // Alarm regs disabled
        this.registers[0x09] = 0x80; // Minute alarm disabled
        this.registers[0x0A] = 0x80; // Hour alarm disabled
        this.registers[0x0B] = 0x80; // Day alarm disabled
        this.registers[0x0C] = 0x80; // Weekday alarm disabled
        this.registers[0x0D] = 0x00; // CLKOUT
        this.registers[0x0E] = 0x00; // Timer control
        this.registers[0x0F] = 0x00; // Timer value
    }

    _toBCD(val) {
        val = Math.max(0, Math.min(99, val));
        return ((Math.floor(val / 10) & 0x0F) << 4) | (val % 10);
    }

    _fromBCD(bcd) {
        return ((bcd >> 4) & 0x0F) * 10 + (bcd & 0x0F);
    }

    busStart() { this.pointerSet = false; }

    busWrite(value) {
        if (!this.pointerSet) {
            this.regPointer = value & 0x0F;
            this.pointerSet = true;
        } else {
            this.registers[this.regPointer] = value;
            // STOP bit in Control1
            if (this.regPointer === 0x00) this.running = !(value & 0x20);
            // Timer control
            if (this.regPointer === 0x0E) this._timerEnabled = !!(value & 0x80);
            this.regPointer = (this.regPointer + 1) & 0x0F;
        }
        return true;
    }

    busRead() {
        var val = this.registers[this.regPointer];
        this.regPointer = (this.regPointer + 1) & 0x0F;
        return val;
    }

    tick(cycles) {
        if (!this.running) return;
        this._tickCounter += cycles;
        if (this._tickCounter >= this._tickRate) {
            this._tickCounter -= this._tickRate;
            this._incrementSecond();
            this._checkAlarm();
        }
    }

    _incrementSecond() {
        var sec = this._fromBCD(this.registers[0x02] & 0x7F);
        sec++;
        if (sec >= 60) {
            sec = 0;
            var min = this._fromBCD(this.registers[0x03] & 0x7F);
            min++;
            if (min >= 60) {
                min = 0;
                var hr = this._fromBCD(this.registers[0x04] & 0x3F);
                hr++;
                if (hr >= 24) hr = 0;
                this.registers[0x04] = this._toBCD(hr);
            }
            this.registers[0x03] = this._toBCD(min);
        }
        // Preserve VL bit
        this.registers[0x02] = (this.registers[0x02] & 0x80) | this._toBCD(sec);
    }

    _checkAlarm() {
        var match = true;
        if (!(this.registers[0x09] & 0x80)) { // Minute alarm enabled
            if ((this.registers[0x09] & 0x7F) !== (this.registers[0x03] & 0x7F)) match = false;
        }
        if (!(this.registers[0x0A] & 0x80)) { // Hour alarm enabled
            if ((this.registers[0x0A] & 0x3F) !== (this.registers[0x04] & 0x3F)) match = false;
        }
        if (match && (!(this.registers[0x09] & 0x80) || !(this.registers[0x0A] & 0x80))) {
            this.registers[0x01] |= 0x08; // AF flag
        }
    }

    setTime(h, m, s) {
        this.registers[0x02] = (this.registers[0x02] & 0x80) | this._toBCD(s);
        this.registers[0x03] = this._toBCD(m);
        this.registers[0x04] = this._toBCD(h);
    }

    getTime() {
        return {
            seconds: this._fromBCD(this.registers[0x02] & 0x7F),
            minutes: this._fromBCD(this.registers[0x03] & 0x7F),
            hours: this._fromBCD(this.registers[0x04] & 0x3F),
            day: this.registers[0x06],
            date: this._fromBCD(this.registers[0x05] & 0x3F),
            month: this._fromBCD(this.registers[0x07] & 0x1F),
            year: 2000 + this._fromBCD(this.registers[0x08]),
            running: this.running,
            vlFlag: !!(this.registers[0x02] & 0x80),
            alarmFlag: !!(this.registers[0x01] & 0x08)
        };
    }

    getState() {
        var t = this.getTime();
        return { name: this.name, address: this.address,
            time: t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0') };
    }
}
