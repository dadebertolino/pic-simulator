/**
 * VHW Servo — RC Servo with rotating indicator
 */
class VHWServo {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'B';
        this.pin = parseInt(cfg.pin) || 0;
        this.name = 'Servo [R' + this.port + this.pin + ']';
        this._servo = null;
        this._gpio = null;
        this._origTick = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-servo-display">' +
            '<svg viewBox="0 0 120 80" class="pic-servo-svg" id="' + this.id + '-svg">' +
            // Corpo servo
            '<rect x="20" y="40" width="80" height="35" rx="4" fill="#333" stroke="#555" stroke-width="1"/>' +
            '<rect x="25" y="45" width="70" height="25" rx="2" fill="#222"/>' +
            // Disco rotore
            '<circle cx="60" cy="30" r="18" fill="#444" stroke="#666" stroke-width="1"/>' +
            '<circle cx="60" cy="30" r="3" fill="#888"/>' +
            // Lancetta
            '<line id="' + this.id + '-arm" x1="60" y1="30" x2="60" y2="14" stroke="#ff6b35" stroke-width="3" stroke-linecap="round"/>' +
            // Scala angoli
            '<text x="18" y="28" font-size="6" fill="#888">0\u00B0</text>' +
            '<text x="56" y="8" font-size="6" fill="#888" text-anchor="middle">90\u00B0</text>' +
            '<text x="95" y="28" font-size="6" fill="#888">180\u00B0</text>' +
            // Tacche scala
            '<line x1="42" y1="14" x2="44" y2="16" stroke="#555" stroke-width="0.5"/>' +
            '<line x1="60" y1="12" x2="60" y2="15" stroke="#555" stroke-width="0.5"/>' +
            '<line x1="78" y1="14" x2="76" y2="16" stroke="#555" stroke-width="0.5"/>' +
            // Label
            '<text x="60" y="62" font-size="7" fill="#aaa" text-anchor="middle" font-family="monospace" id="' + this.id + '-label">90\u00B0</text>' +
            '</svg></div>' +
            '<div class="pic-servo-info">' +
            '<div class="pic-servo-angle" id="' + this.id + '-angle">90\u00B0</div>' +
            '<div class="pic-servo-stats" id="' + this.id + '-stats">PW: -- \u00B5s | Period: -- ms</div>' +
            '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">No signal</div>';

        this._attach();
    }

    _attach() {
        if (typeof VirtualServo === 'undefined') return;
        this._servo = new VirtualServo();
        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.port);
        if (!this._gpio) return;

        var servo = this._servo;
        var pin = this.pin;
        var gpio = this._gpio;

        // Hook tick per misurare PWM ad ogni ciclo
        if (!gpio._servoTicks) gpio._servoTicks = [];
        gpio._servoTicks.push({ servo: servo, pin: pin });

        if (!gpio._servoTickHooked) {
            gpio._servoTickHooked = true;
            var origTick = gpio.tick ? gpio.tick.bind(gpio) : null;
            gpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var tris = gpio.cpu.ram[gpio.trisAddr];
                var data = gpio.cpu.ram[gpio.dataAddr];
                for (var i = 0; i < gpio._servoTicks.length; i++) {
                    var s = gpio._servoTicks[i];
                    var isOutput = !((tris >> s.pin) & 1);
                    var pinVal = isOutput ? ((data >> s.pin) & 1) : 0;
                    s.servo.tick(pinVal);
                }
            };
        }
    }

    update() {
        if (!this._servo) return;
        var state = this._servo.getState();

        // Ruota lancetta SVG
        var arm = document.getElementById(this.id + '-arm');
        if (arm) {
            // 0° = -90° rotazione (sinistra), 180° = +90° (destra)
            var rot = state.angle - 90;
            arm.setAttribute('transform', 'rotate(' + rot + ' 60 30)');
            arm.setAttribute('stroke', state.active ? '#ff6b35' : '#555');
        }

        var label = document.getElementById(this.id + '-label');
        if (label) label.textContent = state.angle + '\u00B0';

        var angleEl = document.getElementById(this.id + '-angle');
        if (angleEl) angleEl.textContent = state.angle + '\u00B0';

        var statsEl = document.getElementById(this.id + '-stats');
        if (statsEl) {
            statsEl.textContent = 'PW: ' + state.pulseWidth + ' \u00B5s | Period: ' +
                (state.period > 0 ? (state.period / 1000).toFixed(1) + ' ms' : '--');
        }

        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            statusEl.textContent = state.active ? 'Signal OK (' + state.pulseWidth + '\u00B5s)' : 'No signal';
            statusEl.style.color = state.active ? 'var(--pic-success)' : 'var(--pic-text-dim)';
        }
    }

    destroy() {
        if (this._gpio && this._gpio._servoTicks && this._servo) {
            var idx = this._gpio._servoTicks.findIndex(function(s) { return s.servo === this._servo; }.bind(this));
            if (idx >= 0) this._gpio._servoTicks.splice(idx, 1);
        }
    }
}
