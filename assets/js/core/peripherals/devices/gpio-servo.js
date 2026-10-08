/**
 * VirtualServo — RC Servo Motor
 * Legge la durata dell'impulso HIGH su un pin GPIO.
 * Pulse 1ms = 0°, 1.5ms = 90°, 2ms = 180° (standard servo)
 *
 * A 4MHz: 1ms = 1000 cicli, 2ms = 2000 cicli
 */
class VirtualServo {
    constructor() {
        this.name = 'RC Servo';
        this.angle = 90;           // Angolo corrente (0-180)
        this.pulseWidth = 1500;    // Pulse width in µs
        this.period = 0;           // Periodo totale in µs
        this.active = false;       // Segnale PWM rilevato

        // Timing detection
        this._pinState = 0;
        this._prevPinState = 0;
        this._highCycles = 0;
        this._lowCycles = 0;
        this._totalCycles = 0;

        // Calibrazione (µs a 4MHz = cicli)
        this.pulseMin = 500;       // µs per 0°
        this.pulseMax = 2500;      // µs per 180°
        this.pulseMid = 1500;      // µs per 90°

        // Smoothing
        this._lastValidAngle = 90;
        this._noSignalCount = 0;
    }

    /**
     * Chiamato ad ogni ciclo CPU.
     * @param {number} pinValue - stato del pin (0 o 1)
     */
    tick(pinValue) {
        this._prevPinState = this._pinState;
        this._pinState = pinValue;

        if (pinValue) {
            this._highCycles++;
        } else {
            this._lowCycles++;
        }
        this._totalCycles++;

        // Rising edge: inizio nuovo impulso
        if (!this._prevPinState && pinValue) {
            // Fine periodo: calcola
            if (this._totalCycles > 100) {
                this.period = this._totalCycles;
            }
            this._totalCycles = 0;
            this._highCycles = 0;
        }

        // Falling edge: fine impulso high
        if (this._prevPinState && !pinValue) {
            var pw = this._highCycles;
            if (pw >= this.pulseMin && pw <= this.pulseMax) {
                this.pulseWidth = pw;
                // Converte pulse width in angolo
                var range = this.pulseMax - this.pulseMin;
                this.angle = Math.round(((pw - this.pulseMin) / range) * 180);
                this.angle = Math.max(0, Math.min(180, this.angle));
                this._lastValidAngle = this.angle;
                this.active = true;
                this._noSignalCount = 0;
            }
            this._highCycles = 0;
        }

        // Timeout: nessun segnale per >50ms
        if (this._lowCycles > 50000) {
            this._noSignalCount++;
            if (this._noSignalCount > 3) this.active = false;
            this._lowCycles = 0;
        }
    }

    getState() {
        return {
            angle: this.angle,
            pulseWidth: this.pulseWidth,
            period: this.period,
            active: this.active
        };
    }
}
