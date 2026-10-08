/**
 * VirtualBuzzer — Piezo Buzzer / Speaker
 * Misura la frequenza del segnale su un pin GPIO.
 * A 4MHz: periodo in cicli → freq = 4000000 / periodo
 */
class VirtualBuzzer {
    constructor() {
        this.name = 'Buzzer';
        this.frequency = 0;
        this.period = 0;
        this.active = false;
        this._pinPrev = 0;
        this._cycleCount = 0;
        this._lastPeriod = 0;
        this._silentCycles = 0;
    }

    tick(pinValue) {
        this._cycleCount++;
        if (pinValue && !this._pinPrev) {
            // Rising edge
            if (this._cycleCount > 5 && this._cycleCount < 50000) {
                this._lastPeriod = this._cycleCount;
                this.period = this._cycleCount;
                this.frequency = Math.round(4000000 / this._cycleCount);
                this.active = true;
                this._silentCycles = 0;
            }
            this._cycleCount = 0;
        }
        if (!pinValue) this._silentCycles++;
        if (this._silentCycles > 50000) { this.active = false; this.frequency = 0; }
        this._pinPrev = pinValue;
    }

    getNote() {
        if (!this.active || this.frequency < 20) return '--';
        var notes = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        var midi = Math.round(12 * Math.log2(this.frequency / 440) + 69);
        if (midi < 0 || midi > 127) return '?';
        return notes[midi % 12] + Math.floor(midi / 12 - 1);
    }

    getState() {
        return { frequency: this.frequency, period: this.period, active: this.active, note: this.getNote() };
    }
}
