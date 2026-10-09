/**
 * VirtualL293D — Dual H-Bridge Motor Driver
 *
 * 2 canali indipendenti, ciascuno con:
 *   - ENx: Enable (PWM per velocità)
 *   - IN1, IN2: direzione
 *     IN1=1 IN2=0 → Forward
 *     IN1=0 IN2=1 → Reverse
 *     IN1=IN2 → Brake/Coast
 *
 * Misura duty cycle dell'enable per calcolare velocità.
 */
class VirtualL293D {
    constructor() {
        this.name = 'L293D H-Bridge';
        this.motors = [
            { in1: 0, in2: 0, enable: 0, speed: 0, direction: 'STOP', _highCycles: 0, _totalCycles: 0, _pwmWindow: 200 },
            { in1: 0, in2: 0, enable: 0, speed: 0, direction: 'STOP', _highCycles: 0, _totalCycles: 0, _pwmWindow: 200 }
        ];
    }

    /**
     * Tick: aggiorna stato motori dai pin GPIO.
     * @param {number} ch - canale (0 o 1)
     * @param {number} en - enable pin value
     * @param {number} in1 - input 1 value
     * @param {number} in2 - input 2 value
     */
    tickChannel(ch, en, in1, in2) {
        var m = this.motors[ch];
        m.in1 = en ? in1 : 0;
        m.in2 = en ? in2 : 0;
        m.enable = en;

        // PWM duty cycle measurement on enable
        m._totalCycles++;
        if (en) m._highCycles++;

        if (m._totalCycles >= m._pwmWindow) {
            m.speed = Math.round((m._highCycles / m._totalCycles) * 100);
            m._highCycles = 0;
            m._totalCycles = 0;
        }

        // Direction
        if (!en) {
            m.direction = 'DISABLED';
            m.speed = 0;
        } else if (in1 && !in2) {
            m.direction = 'FORWARD';
        } else if (!in1 && in2) {
            m.direction = 'REVERSE';
        } else if (in1 && in2) {
            m.direction = 'BRAKE';
        } else {
            m.direction = 'COAST';
        }
    }

    getState() {
        return {
            motor1: Object.assign({}, this.motors[0]),
            motor2: Object.assign({}, this.motors[1])
        };
    }
}
