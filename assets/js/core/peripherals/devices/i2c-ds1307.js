class VirtualDS1307 extends VirtualI2CDevice {
    /**
     * DS1307 RTC: 7 registri BCD (sec, min, hr, day, date, month, year) + 56 bytes RAM
     * Indirizzo fisso 0x68
     */
    constructor() {
        super('DS1307 RTC', 0x68);
        this.registers = new Uint8Array(64); // 0x00-0x07 = time, 0x08-0x3F = RAM
        this.regPointer = 0;
        this.pointerSet = false;
        this.running = true; // CH bit = 0 → running

        // Imposta ora corrente
        this._setCurrentTime();

        // Tick interno (simulato)
        this._tickCounter = 0;
        this._tickRate = 1000; // ogni N cicli CPU = 1 secondo simulato

        // Callback UI
        this.onTimeChange = null;
    }

    _setCurrentTime() {
        var now = new Date();
        this.registers[0] = this._toBCD(now.getSeconds());    // Seconds (+ CH bit7=0)
        this.registers[1] = this._toBCD(now.getMinutes());    // Minutes
        this.registers[2] = this._toBCD(now.getHours());      // Hours (24h mode, bit6=0)
        this.registers[3] = now.getDay() + 1;                 // Day of week (1-7)
        this.registers[4] = this._toBCD(now.getDate());       // Date
        this.registers[5] = this._toBCD(now.getMonth() + 1);  // Month
        this.registers[6] = this._toBCD(now.getFullYear() % 100); // Year (00-99)
        this.registers[7] = 0x00;                             // Control: no SQW
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
            this.regPointer = value & 0x3F;
            this.pointerSet = true;
        } else {
            this.registers[this.regPointer] = value;
            // CH bit: bit 7 di registro 0
            if (this.regPointer === 0) this.running = !(value & 0x80);
            this.regPointer = (this.regPointer + 1) & 0x3F;
            if (this.onTimeChange) this.onTimeChange();
        }
        return true;
    }

    busRead() {
        var val = this.registers[this.regPointer];
        this.regPointer = (this.regPointer + 1) & 0x3F;
        return val;
    }

    /**
     * Chiamato dal tick della simulazione per avanzare il tempo.
     * @param {number} cycles - cicli CPU trascorsi
     */
    tick(cycles) {
        if (!this.running) return;
        this._tickCounter += cycles;
        if (this._tickCounter >= this._tickRate) {
            this._tickCounter -= this._tickRate;
            this._incrementSecond();
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
        this.registers[0] = (this.registers[0] & 0x80) | this._toBCD(sec);
        if (this.onTimeChange) this.onTimeChange();
    }

    /**
     * Imposta ora manualmente (per UI).
     */
    setTime(hours, minutes, seconds) {
        this.registers[0] = (this.registers[0] & 0x80) | this._toBCD(seconds);
        this.registers[1] = this._toBCD(minutes);
        this.registers[2] = this._toBCD(hours);
    }

    getTime() {
        return {
            seconds: this._fromBCD(this.registers[0] & 0x7F),
            minutes: this._fromBCD(this.registers[1]),
            hours: this._fromBCD(this.registers[2] & 0x3F),
            day: this.registers[3],
            date: this._fromBCD(this.registers[4]),
            month: this._fromBCD(this.registers[5]),
            year: 2000 + this._fromBCD(this.registers[6]),
            running: this.running
        };
    }

    getState() {
        var t = this.getTime();
        return {
            name: this.name, address: this.address,
            time: t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0'),
            date: t.date + '/' + t.month + '/' + t.year,
            running: t.running
        };
    }
}
