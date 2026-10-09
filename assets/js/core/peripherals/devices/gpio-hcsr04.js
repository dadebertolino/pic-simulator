/**
 * VirtualHCSR04 — Ultrasonic Distance Sensor
 *
 * Trigger: PIC sends 10µs HIGH pulse on trigger pin
 * Echo: device responds with HIGH pulse on echo pin
 * Duration: distance_cm * 58µs (round trip at 340m/s)
 *
 * A 4MHz: 1µs = 1 ciclo
 * Max range: 400cm → echo = 23200µs
 * Min range: 2cm → echo = 116µs
 */
class VirtualHCSR04 {
    constructor() {
        this.name = 'HC-SR04';
        this.distance = 20.0;       // cm (2-400)
        this.echoPulseWidth = 0;    // µs calcolato
        this._state = 'IDLE';       // IDLE, TRIGGERED, ECHO_DELAY, ECHO_HIGH
        this._trigHighCycles = 0;
        this._delayCycles = 0;
        this._echoCycles = 0;
        this._echoPin = 0;          // Valore pin echo (0 o 1)

        this._trigPinPrev = 0;
        this._updateEcho();
    }

    /**
     * Imposta distanza simulata.
     * @param {number} cm - Da 2 a 400
     */
    setDistance(cm) {
        this.distance = Math.max(2, Math.min(400, cm));
        this._updateEcho();
    }

    _updateEcho() {
        // Durata echo = distanza * 58µs (andata+ritorno, velocità suono 340m/s)
        this.echoPulseWidth = Math.round(this.distance * 58);
    }

    /**
     * Chiamato ad ogni ciclo CPU.
     * @param {number} trigPin - stato pin trigger (0 o 1)
     * @returns {number} stato pin echo (0 o 1)
     */
    tick(trigPin) {
        switch (this._state) {
            case 'IDLE':
                this._echoPin = 0;
                // Detect rising edge trigger
                if (trigPin && !this._trigPinPrev) {
                    this._trigHighCycles = 0;
                }
                // Count trigger high time
                if (trigPin) {
                    this._trigHighCycles++;
                }
                // Detect falling edge: check if was >= 10µs trigger
                if (!trigPin && this._trigPinPrev && this._trigHighCycles >= 8) {
                    this._state = 'ECHO_DELAY';
                    this._delayCycles = 0;
                }
                break;

            case 'ECHO_DELAY':
                // Delay ~460µs before echo starts (simulate sensor processing)
                this._delayCycles++;
                this._echoPin = 0;
                if (this._delayCycles >= 460) {
                    this._state = 'ECHO_HIGH';
                    this._echoCycles = 0;
                    this._echoPin = 1;
                }
                break;

            case 'ECHO_HIGH':
                // Echo pin HIGH for duration proportional to distance
                this._echoCycles++;
                this._echoPin = 1;
                if (this._echoCycles >= this.echoPulseWidth) {
                    this._echoPin = 0;
                    this._state = 'IDLE';
                }
                break;
        }

        this._trigPinPrev = trigPin;
        return this._echoPin;
    }

    getState() {
        return {
            distance: this.distance,
            echoPulse: this.echoPulseWidth,
            state: this._state,
            echoPin: this._echoPin
        };
    }
}
