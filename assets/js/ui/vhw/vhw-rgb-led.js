/**
 * VHW RGB LED — Single RGB LED with color mixing display
 */
class VHWRGBLed {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.port = cfg.port || 'B';
        this.rPin = parseInt(cfg.rPin) || 0;
        this.gPin = parseInt(cfg.gPin) || 1;
        this.bPin = parseInt(cfg.bPin) || 2;
        this.name = 'RGB LED [R' + this.port + this.rPin + '/' + this.gPin + '/' + this.bPin + ']';
        this._led = null; this._gpio = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-rgb-led">' +
            '<div class="pic-rgb-dot" id="' + this.id + '-dot"></div>' +
            '<div class="pic-rgb-hex" id="' + this.id + '-hex">#000000</div>' +
            '<div class="pic-rgb-bars">' +
            '<div class="pic-rgb-ch"><span class="pic-rgb-r">R</span><div class="pic-rgb-bar"><div class="pic-rgb-fill" id="' + this.id + '-br" style="background:#ff0000"></div></div><span class="pic-rgb-val" id="' + this.id + '-vr">0</span></div>' +
            '<div class="pic-rgb-ch"><span class="pic-rgb-g">G</span><div class="pic-rgb-bar"><div class="pic-rgb-fill" id="' + this.id + '-bg" style="background:#00ff00"></div></div><span class="pic-rgb-val" id="' + this.id + '-vg">0</span></div>' +
            '<div class="pic-rgb-ch"><span class="pic-rgb-b">B</span><div class="pic-rgb-bar"><div class="pic-rgb-fill" id="' + this.id + '-bb" style="background:#0088ff"></div></div><span class="pic-rgb-val" id="' + this.id + '-vb">0</span></div>' +
            '</div></div>' +
            '<div class="pic-sensor-status">R=R' + this.port + this.rPin + ' G=R' + this.port + this.gPin + ' B=R' + this.port + this.bPin + '</div>';
        this._attach();
    }

    _attach() {
        if (typeof VirtualRGBLed === 'undefined') return;
        this._led = new VirtualRGBLed();
        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.port);
        if (!this._gpio) return;
        var led = this._led, rP = this.rPin, gP = this.gPin, bP = this.bPin, gpio = this._gpio;
        if (!gpio._rgbTicks) gpio._rgbTicks = [];
        gpio._rgbTicks.push({ led: led, rPin: rP, gPin: gP, bPin: bP });
        if (!gpio._rgbHooked) {
            gpio._rgbHooked = true;
            var origTick = gpio.tick ? gpio.tick.bind(gpio) : null;
            gpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var data = gpio.cpu.ram[gpio.dataAddr];
                var tris = gpio.cpu.ram[gpio.trisAddr];
                for (var i = 0; i < gpio._rgbTicks.length; i++) {
                    var l = gpio._rgbTicks[i];
                    var pin = function(n) { return (!((tris >> n) & 1)) ? ((data >> n) & 1) : 0; };
                    l.led.tick(pin(l.rPin), pin(l.gPin), pin(l.bPin));
                }
            };
        }
    }

    update() {
        if (!this._led) return;
        var s = this._led.getState();
        var dot = document.getElementById(this.id + '-dot');
        if (dot) {
            var isOff = s.r === 0 && s.g === 0 && s.b === 0;
            dot.style.background = isOff ? '#111' : 'rgb(' + s.r + ',' + s.g + ',' + s.b + ')';
            dot.style.boxShadow = isOff ? 'none' : '0 0 20px rgb(' + s.r + ',' + s.g + ',' + s.b + '), 0 0 40px rgba(' + s.r + ',' + s.g + ',' + s.b + ',0.3)';
        }
        var hexEl = document.getElementById(this.id + '-hex');
        if (hexEl) hexEl.textContent = s.hex;
        var set = function(id, val) {
            var el = document.getElementById(id);
            if (el) el.style.width = (val / 255 * 100) + '%';
        };
        set(this.id + '-br', s.r); set(this.id + '-bg', s.g); set(this.id + '-bb', s.b);
        var sv = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
        sv(this.id + '-vr', s.r); sv(this.id + '-vg', s.g); sv(this.id + '-vb', s.b);
    }

    destroy() {
        if (this._gpio && this._gpio._rgbTicks) {
            var idx = this._gpio._rgbTicks.findIndex(function(l) { return l.led === this._led; }.bind(this));
            if (idx >= 0) this._gpio._rgbTicks.splice(idx, 1);
        }
    }
}
