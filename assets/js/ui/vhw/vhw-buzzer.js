/**
 * VHW Buzzer — Piezo buzzer/speaker UI
 */
class VHWBuzzer {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.port = cfg.port || 'B';
        this.pin = parseInt(cfg.pin) || 0;
        this.name = 'Buzzer [R' + this.port + this.pin + ']';
        this._buzzer = null; this._gpio = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-buzzer">' +
            '<div class="pic-buzzer-icon" id="' + this.id + '-icon">\uD83D\uDD14</div>' +
            '<div class="pic-buzzer-note" id="' + this.id + '-note">--</div>' +
            '<div class="pic-buzzer-freq" id="' + this.id + '-freq">0 Hz</div>' +
            '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">Pin R' + this.port + this.pin + '</div>';
        this._attach();
    }

    _attach() {
        if (typeof VirtualBuzzer === 'undefined') return;
        this._buzzer = new VirtualBuzzer();
        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.port);
        if (!this._gpio) return;
        var buz = this._buzzer, pin = this.pin, gpio = this._gpio;
        if (!gpio._buzzerTicks) gpio._buzzerTicks = [];
        gpio._buzzerTicks.push({ buzzer: buz, pin: pin });
        if (!gpio._buzzerHooked) {
            gpio._buzzerHooked = true;
            var origTick = gpio.tick ? gpio.tick.bind(gpio) : null;
            gpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var data = gpio.cpu.ram[gpio.dataAddr];
                var tris = gpio.cpu.ram[gpio.trisAddr];
                for (var i = 0; i < gpio._buzzerTicks.length; i++) {
                    var b = gpio._buzzerTicks[i];
                    var v = (!((tris >> b.pin) & 1)) ? ((data >> b.pin) & 1) : 0;
                    b.buzzer.tick(v);
                }
            };
        }
    }

    update() {
        if (!this._buzzer) return;
        var s = this._buzzer.getState();
        var noteEl = document.getElementById(this.id + '-note');
        if (noteEl) noteEl.textContent = s.active ? s.note : '--';
        var freqEl = document.getElementById(this.id + '-freq');
        if (freqEl) freqEl.textContent = s.active ? s.frequency + ' Hz' : 'Silent';
        var iconEl = document.getElementById(this.id + '-icon');
        if (iconEl) iconEl.style.opacity = s.active ? '1' : '0.3';
    }

    destroy() {
        if (this._gpio && this._gpio._buzzerTicks) {
            var idx = this._gpio._buzzerTicks.findIndex(function(b) { return b.buzzer === this._buzzer; }.bind(this));
            if (idx >= 0) this._gpio._buzzerTicks.splice(idx, 1);
        }
    }
}
