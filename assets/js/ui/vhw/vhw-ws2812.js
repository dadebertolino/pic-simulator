/**
 * VHW WS2812 — Addressable RGB LED Strip UI
 * Supporta layout griglia con ledsPerRow configurabile.
 * ledsPerRow=0 → auto (tutti su una riga, wrap naturale)
 */
class VHWWS2812 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.port = cfg.port || 'B';
        this.pin = parseInt(cfg.pin) || 0;
        this.numLeds = Math.min(256, Math.max(1, parseInt(cfg.numLeds) || 8));
        this.ledsPerRow = Math.min(64, Math.max(0, parseInt(cfg.ledsPerRow) || 0));
        var layout = this.ledsPerRow > 0 ? this.ledsPerRow + '/row' : 'strip';
        this.name = 'WS2812 x' + this.numLeds + ' [R' + this.port + this.pin + '] ' + layout;
        this._strip = null;
        this._gpio = null;
    }

    render(container) {
        // Calcola righe
        var perRow = this.ledsPerRow > 0 ? this.ledsPerRow : this.numLeds;
        var rows = Math.ceil(this.numLeds / perRow);
        var ledSize = this.numLeds > 64 ? 8 : (this.numLeds > 32 ? 12 : 16);
        var gap = this.numLeds > 64 ? 1 : (this.numLeds > 32 ? 2 : 3);

        var html = '<div class="pic-ws2812-panel">';

        // Strip/Matrix
        html += '<div class="pic-ws2812-grid" id="' + this.id + '-grid" style="' +
            'grid-template-columns: repeat(' + perRow + ', ' + ledSize + 'px); gap: ' + gap + 'px;">';
        for (var i = 0; i < this.numLeds; i++) {
            html += '<div class="pic-ws2812-dot" id="' + this.id + '-d' + i + '" ' +
                'style="width:' + ledSize + 'px; height:' + ledSize + 'px;" ' +
                'title="LED ' + i + '"></div>';
        }
        html += '</div>';

        // Info bar
        var rowInfo = this.ledsPerRow > 0 ? this.ledsPerRow + ' x ' + rows : 'strip';
        html += '<div class="pic-ws2812-info">' +
            '<span class="pic-ws2812-count">' + this.numLeds + ' LEDs (' + rowInfo + ')</span>' +
            '<span class="pic-ws2812-bytes" id="' + this.id + '-bytes">0/' + (this.numLeds * 3) + ' bytes</span></div>';

        // Hex view (primi 16 LED max)
        html += '<div class="pic-ws2812-hex" id="' + this.id + '-hex"></div>';

        // Status
        html += '<div class="pic-sensor-status" id="' + this.id + '-status">DIN=R' + this.port + this.pin + '</div>';

        html += '</div>';
        container.innerHTML = html;

        this._attach();
    }

    _attach() {
        if (typeof VirtualWS2812 === 'undefined') return;
        this._strip = new VirtualWS2812(this.numLeds);

        this._gpio = this.hw.cpu.getPeripheral('GPIO_' + this.port);
        if (!this._gpio) return;

        var strip = this._strip;
        var pin = this.pin;
        var gpio = this._gpio;

        if (!gpio._ws2812Ticks) gpio._ws2812Ticks = [];
        gpio._ws2812Ticks.push({ strip: strip, pin: pin });

        if (!gpio._ws2812Hooked) {
            gpio._ws2812Hooked = true;
            var origTick = gpio.tick ? gpio.tick.bind(gpio) : null;
            gpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                var tris = gpio.cpu.ram[gpio.trisAddr];
                var data = gpio.cpu.ram[gpio.dataAddr];
                for (var i = 0; i < gpio._ws2812Ticks.length; i++) {
                    var w = gpio._ws2812Ticks[i];
                    var isOutput = !((tris >> w.pin) & 1);
                    var pinVal = isOutput ? ((data >> w.pin) & 1) : 0;
                    w.strip.tick(pinVal);
                }
            };
        }
    }

    update() {
        if (!this._strip) return;

        // Aggiorna LED
        for (var i = 0; i < this.numLeds; i++) {
            var led = this._strip.leds[i];
            var dot = document.getElementById(this.id + '-d' + i);
            if (!dot) continue;
            var r = led.r, g = led.g, b = led.b;
            var isOff = (r === 0 && g === 0 && b === 0);
            dot.style.background = isOff ? '#111' : 'rgb(' + r + ',' + g + ',' + b + ')';
            dot.style.boxShadow = isOff ? 'none' :
                '0 0 4px rgb(' + r + ',' + g + ',' + b + '), ' +
                '0 0 8px rgba(' + r + ',' + g + ',' + b + ',0.3)';
        }

        // Bytes counter
        var bytesEl = document.getElementById(this.id + '-bytes');
        if (bytesEl) {
            var st = this._strip.getState();
            bytesEl.textContent = st.bytesReceived + '/' + (this.numLeds * 3) + ' bytes';
        }

        // Hex view (primi 16)
        var hexEl = document.getElementById(this.id + '-hex');
        if (hexEl) {
            var parts = [];
            var show = Math.min(this.numLeds, 16);
            for (var j = 0; j < show; j++) {
                var l = this._strip.leds[j];
                var bright = Math.max(l.r, l.g, l.b);
                var style = bright > 0
                    ? 'color:rgb(' + Math.max(l.r, 50) + ',' + Math.max(l.g, 50) + ',' + Math.max(l.b, 50) + ')'
                    : 'color:#444';
                parts.push('<span style="' + style + '">' + this._hex(l.r) + this._hex(l.g) + this._hex(l.b) + '</span>');
            }
            if (this.numLeds > 16) parts.push('<span style="color:#444">...</span>');
            hexEl.innerHTML = parts.join(' ');
        }
    }

    _hex(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }

    destroy() {
        if (this._gpio && this._gpio._ws2812Ticks && this._strip) {
            var idx = this._gpio._ws2812Ticks.findIndex(function(w) { return w.strip === this._strip; }.bind(this));
            if (idx >= 0) this._gpio._ws2812Ticks.splice(idx, 1);
        }
    }
}
