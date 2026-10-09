/**
 * VHW L293D — Dual H-Bridge Motor Driver UI
 * 2 motori con disco rotante, indicatore velocità e direzione.
 */
class VHWL293D {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.enPort = cfg.enPort || 'B';
        this.en1Pin = parseInt(cfg.en1Pin) || 0;
        this.in1aPin = parseInt(cfg.in1aPin) || 1;
        this.in1bPin = parseInt(cfg.in1bPin) || 2;
        this.en2Pin = parseInt(cfg.en2Pin) || 3;
        this.in2aPin = parseInt(cfg.in2aPin) || 4;
        this.in2bPin = parseInt(cfg.in2bPin) || 5;
        this.name = 'L293D [PORT' + this.enPort + ']';
        this._driver = null;
        this._gpio = null;
        this._angle = [0, 0]; // rotation angles for animation
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-l293d-motors">' +
            this._motorHTML(0, 'Motor A') +
            this._motorHTML(1, 'Motor B') +
            '</div>' +
            '<div class="pic-l293d-pins">' +
            '<span>EN1=R' + this.enPort + this.en1Pin + ' IN1=R' + this.enPort + this.in1aPin + ' IN2=R' + this.enPort + this.in1bPin + '</span>' +
            '<span>EN2=R' + this.enPort + this.en2Pin + ' IN3=R' + this.enPort + this.in2aPin + ' IN4=R' + this.enPort + this.in2bPin + '</span>' +
            '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">L293D Dual H-Bridge</div>';

        this._attach();
    }

    _motorHTML(ch, label) {
        return '<div class="pic-motor">' +
            '<div class="pic-motor-label">' + label + '</div>' +
            '<svg viewBox="0 0 60 60" class="pic-motor-svg">' +
            '<circle cx="30" cy="30" r="26" fill="#333" stroke="#555" stroke-width="1.5"/>' +
            '<circle cx="30" cy="30" r="20" fill="#222" stroke="#444" stroke-width="1"/>' +
            '<line id="' + this.id + '-arm' + ch + '" x1="30" y1="30" x2="30" y2="10" stroke="#ff6b35" stroke-width="2.5" stroke-linecap="round"/>' +
            '<circle cx="30" cy="30" r="4" fill="#666"/>' +
            '</svg>' +
            '<div class="pic-motor-dir" id="' + this.id + '-dir' + ch + '">STOP</div>' +
            '<div class="pic-motor-speed">' +
            '<div class="pic-motor-bar"><div class="pic-motor-fill" id="' + this.id + '-bar' + ch + '"></div></div>' +
            '<span class="pic-motor-pct" id="' + this.id + '-pct' + ch + '">0%</span></div></div>';
    }

    _attach() {
        if (typeof VirtualL293D === 'undefined') return;
        this._driver = new VirtualL293D();

        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.enPort);
        if (!this._gpio) return;

        var driver = this._driver;
        var pins = {
            en1: this.en1Pin, in1a: this.in1aPin, in1b: this.in1bPin,
            en2: this.en2Pin, in2a: this.in2aPin, in2b: this.in2bPin
        };
        var gpio = this._gpio;

        if (!gpio._motorTicks) gpio._motorTicks = [];
        gpio._motorTicks.push({ driver: driver, pins: pins });

        if (!gpio._motorHooked) {
            gpio._motorHooked = true;
            var origTick = gpio.tick ? gpio.tick.bind(gpio) : null;
            gpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var data = gpio.cpu.ram[gpio.dataAddr];
                var tris = gpio.cpu.ram[gpio.trisAddr];
                for (var i = 0; i < gpio._motorTicks.length; i++) {
                    var m = gpio._motorTicks[i];
                    var p = m.pins;
                    var pin = function(n) { return (!((tris >> n) & 1)) ? ((data >> n) & 1) : 0; };
                    m.driver.tickChannel(0, pin(p.en1), pin(p.in1a), pin(p.in1b));
                    m.driver.tickChannel(1, pin(p.en2), pin(p.in2a), pin(p.in2b));
                }
            };
        }
    }

    update() {
        if (!this._driver) return;

        for (var ch = 0; ch < 2; ch++) {
            var m = this._driver.motors[ch];

            // Rotate arm
            var arm = document.getElementById(this.id + '-arm' + ch);
            if (arm) {
                var rotSpeed = m.speed * 0.1;
                if (m.direction === 'REVERSE') rotSpeed = -rotSpeed;
                if (m.direction === 'BRAKE' || m.direction === 'COAST' || m.direction === 'DISABLED') rotSpeed = 0;
                this._angle[ch] = (this._angle[ch] + rotSpeed) % 360;
                arm.setAttribute('transform', 'rotate(' + this._angle[ch] + ' 30 30)');
                arm.setAttribute('stroke', m.direction === 'DISABLED' ? '#444' : '#ff6b35');
            }

            // Direction label
            var dirEl = document.getElementById(this.id + '-dir' + ch);
            if (dirEl) {
                dirEl.textContent = m.direction;
                var colors = { FORWARD: '#3fb950', REVERSE: '#f59e0b', BRAKE: '#ef4444', COAST: '#888', DISABLED: '#555', STOP: '#555' };
                dirEl.style.color = colors[m.direction] || '#888';
            }

            // Speed bar
            var barEl = document.getElementById(this.id + '-bar' + ch);
            if (barEl) {
                barEl.style.width = m.speed + '%';
                barEl.style.background = m.speed > 75 ? '#ef4444' : m.speed > 50 ? '#f59e0b' : '#3fb950';
            }

            var pctEl = document.getElementById(this.id + '-pct' + ch);
            if (pctEl) pctEl.textContent = m.speed + '%';
        }
    }

    destroy() {
        if (this._gpio && this._gpio._motorTicks && this._driver) {
            var idx = this._gpio._motorTicks.findIndex(function(m) { return m.driver === this._driver; }.bind(this));
            if (idx >= 0) this._gpio._motorTicks.splice(idx, 1);
        }
    }
}
