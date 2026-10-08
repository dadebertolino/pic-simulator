/**
 * VHW KS0108 — 128x64 Graphic LCD (Parallel)
 */
class VHWKS0108 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.dataPort = cfg.dataPort || 'B';
        this.ctrlPort = cfg.ctrlPort || 'D';
        this.rsPin = parseInt(cfg.rsPin) || 0;
        this.enPin = parseInt(cfg.enPin) || 2;
        this.cs1Pin = parseInt(cfg.cs1Pin) || 3;
        this.cs2Pin = parseInt(cfg.cs2Pin) || 4;
        this.scale = Math.max(1, Math.min(3, parseInt(cfg.scale) || 2));
        this.color = cfg.color || 'green';
        this.name = 'KS0108 GLCD [D=PORT' + this.dataPort + ' C=PORT' + this.ctrlPort + ']';
        this._glcd = null;
        this._canvas = null;
        this._ctx = null;
    }

    render(container) {
        var w = 128 * this.scale;
        var h = 64 * this.scale;
        var bgColor = this.color === 'blue' ? '#0a1a3a' : '#1a2a10';
        container.innerHTML =
            '<div class="pic-glcd-wrap" style="background:' + bgColor + '">' +
            '<canvas id="' + this.id + '-canvas" width="' + w + '" height="' + h + '" class="pic-glcd-canvas"></canvas></div>' +
            '<div class="pic-oled-info" id="' + this.id + '-info">GLCD 128x64</div>' +
            '<details class="pic-lcd-debug"><summary>KS0108 Status</summary>' +
            '<div class="pic-lcd-debug-body" id="' + this.id + '-log"></div></details>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">D=PORT' + this.dataPort + ' RS=R' + this.ctrlPort + this.rsPin +
            ' EN=R' + this.ctrlPort + this.enPin + ' CS1=R' + this.ctrlPort + this.cs1Pin + ' CS2=R' + this.ctrlPort + this.cs2Pin + '</div>';

        this._canvas = document.getElementById(this.id + '-canvas');
        this._ctx = this._canvas ? this._canvas.getContext('2d') : null;
        if (this._ctx) {
            this._ctx.fillStyle = bgColor;
            this._ctx.fillRect(0, 0, w, h);
        }
        this._attach();
    }

    _attach() {
        if (typeof VirtualKS0108 === 'undefined') return;
        this._glcd = new VirtualKS0108();

        var ctrlGpio = this.hw.cpu.getPeripheral('GPIO_' + this.ctrlPort);
        var dataGpio = this.hw.cpu.getPeripheral('GPIO_' + this.dataPort);
        if (!ctrlGpio) return;

        var glcd = this._glcd;
        var dataG = dataGpio || ctrlGpio;
        var rsPin = this.rsPin, enPin = this.enPin, cs1Pin = this.cs1Pin, cs2Pin = this.cs2Pin;
        var self = this;

        // Hook tick on control GPIO
        if (!ctrlGpio._glcdTicks) ctrlGpio._glcdTicks = [];
        ctrlGpio._glcdTicks.push({
            glcd: glcd, dataGpio: dataG, rsPin: rsPin, enPin: enPin, cs1Pin: cs1Pin, cs2Pin: cs2Pin
        });

        if (!ctrlGpio._glcdHooked) {
            ctrlGpio._glcdHooked = true;
            var origTick = ctrlGpio.tick ? ctrlGpio.tick.bind(ctrlGpio) : null;
            ctrlGpio.tick = function(cycles) {
                if (origTick) origTick(cycles);
                for (var i = 0; i < ctrlGpio._glcdTicks.length; i++) {
                    var g = ctrlGpio._glcdTicks[i];
                    var ctrl = ctrlGpio.cpu.ram[ctrlGpio.dataAddr];
                    var data = g.dataGpio.cpu.ram[g.dataGpio.dataAddr];
                    var rs = (ctrl >> g.rsPin) & 1;
                    var en = (ctrl >> g.enPin) & 1;
                    var cs1 = (ctrl >> g.cs1Pin) & 1;
                    var cs2 = (ctrl >> g.cs2Pin) & 1;
                    g.glcd.tick(data, rs, en, cs1, cs2);
                }
            };
        }
    }

    update() {
        if (!this._glcd || !this._ctx) return;
        var g = this._glcd;
        var ctx = this._ctx;
        var s = this.scale;

        var colors = {
            green: [138, 184, 72],
            blue: [90, 154, 238],
            white: [200, 200, 200]
        };
        var onColor = colors[this.color] || colors.green;
        var bgColors = { green: [26, 42, 16], blue: [10, 26, 58], white: [20, 20, 20] };
        var bgColor = bgColors[this.color] || bgColors.green;

        var imgData = ctx.createImageData(128 * s, 64 * s);
        var pixels = imgData.data;

        for (var y = 0; y < 64; y++) {
            for (var x = 0; x < 128; x++) {
                var px = g.getPixel(x, y);
                var r = px ? onColor[0] : bgColor[0];
                var gr = px ? onColor[1] : bgColor[1];
                var b = px ? onColor[2] : bgColor[2];
                for (var sy = 0; sy < s; sy++) {
                    for (var sx = 0; sx < s; sx++) {
                        var idx = ((y * s + sy) * 128 * s + (x * s + sx)) * 4;
                        pixels[idx] = r;
                        pixels[idx + 1] = gr;
                        pixels[idx + 2] = b;
                        pixels[idx + 3] = 255;
                    }
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);

        var infoEl = document.getElementById(this.id + '-info');
        if (infoEl) {
            infoEl.textContent = 'CS1:' + (g.displayOn[0] ? 'ON' : 'off') + ' CS2:' + (g.displayOn[1] ? 'ON' : 'off') +
                ' | P:' + g.page[0] + '/' + g.page[1] + ' C:' + g.column[0] + '/' + g.column[1];
        }

        var logEl = document.getElementById(this.id + '-log');
        if (logEl && g.cmdLog.length > 0) {
            logEl.innerHTML = g.cmdLog.slice(-10).map(function(m) {
                return '<div class="dbg-cmd">' + m + '</div>';
            }).join('');
        }
    }

    destroy() {
        var ctrlGpio = this.hw.cpu.getPeripheral('GPIO_' + this.ctrlPort);
        if (ctrlGpio && ctrlGpio._glcdTicks && this._glcd) {
            var idx = ctrlGpio._glcdTicks.findIndex(function(g) { return g.glcd === this._glcd; }.bind(this));
            if (idx >= 0) ctrlGpio._glcdTicks.splice(idx, 1);
        }
    }
}
