/**
 * VHW SSD1306 — 128x64 OLED Display (I²C)
 */
class VHWSSD1306 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.sa0 = cfg.addr === '1';
        this.i2cAddr = this.sa0 ? 0x3D : 0x3C;
        this.scale = Math.max(1, Math.min(3, parseInt(cfg.scale) || 2));
        this.name = 'SSD1306 OLED [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this._device = null;
        this._canvas = null;
        this._ctx = null;
    }

    render(container) {
        var w = 128 * this.scale;
        var h = 64 * this.scale;
        container.innerHTML =
            '<div class="pic-oled-wrap">' +
            '<canvas id="' + this.id + '-canvas" width="' + w + '" height="' + h + '" class="pic-oled-canvas"></canvas></div>' +
            '<div class="pic-oled-info" id="' + this.id + '-info">Display OFF</div>' +
            '<details class="pic-lcd-debug"><summary>SSD1306 Commands</summary>' +
            '<div class="pic-lcd-debug-body" id="' + this.id + '-log"></div></details>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">I\u00B2C @ 0x' + this.i2cAddr.toString(16).toUpperCase() + ' | 128x64</div>';

        this._canvas = document.getElementById(this.id + '-canvas');
        this._ctx = this._canvas ? this._canvas.getContext('2d') : null;
        if (this._ctx) {
            this._ctx.fillStyle = '#000';
            this._ctx.fillRect(0, 0, w, h);
        }
        this._attach();
    }

    _attach() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualSSD1306 !== 'undefined') {
            this._device = new VirtualSSD1306(this.sa0);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() {
        if (!this._device || !this._ctx) return;
        var d = this._device;
        var ctx = this._ctx;
        var s = this.scale;

        // Render pixels
        var imgData = ctx.createImageData(128 * s, 64 * s);
        var pixels = imgData.data;
        var onR, onG, onB;
        if (d.invertDisplay) { onR = 0; onG = 0; onB = 0; } else { onR = 0; onG = 180; onB = 255; }
        var offR = d.invertDisplay ? 0 : 0;
        var offG = d.invertDisplay ? 180 : 0;
        var offB = d.invertDisplay ? 255 : 0;

        if (!d.displayOn) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 128 * s, 64 * s);
        } else {
            for (var page = 0; page < 8; page++) {
                for (var col = 0; col < 128; col++) {
                    var byte = d.gddram[page * 128 + col];
                    for (var bit = 0; bit < 8; bit++) {
                        var px = (byte >> bit) & 1;
                        var x = col;
                        var y = page * 8 + bit;
                        if (d.invertDisplay) px = px ? 0 : 1;
                        var r = px ? onR : 0;
                        var g = px ? 180 : 0;
                        var b = px ? 255 : 0;
                        // Scale pixels
                        for (var sy = 0; sy < s; sy++) {
                            for (var sx = 0; sx < s; sx++) {
                                var idx = ((y * s + sy) * 128 * s + (x * s + sx)) * 4;
                                pixels[idx] = r;
                                pixels[idx + 1] = g;
                                pixels[idx + 2] = b;
                                pixels[idx + 3] = 255;
                            }
                        }
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        }

        // Info
        var infoEl = document.getElementById(this.id + '-info');
        if (infoEl) {
            infoEl.textContent = (d.displayOn ? 'ON' : 'OFF') +
                ' | Contrast: ' + d.contrast +
                ' | Mode: ' + ['Horiz', 'Vert', 'Page'][d.addressMode] +
                (d.invertDisplay ? ' | INVERTED' : '');
        }

        // Log
        var logEl = document.getElementById(this.id + '-log');
        if (logEl && d.cmdLog.length > 0) {
            logEl.innerHTML = d.cmdLog.slice(-10).map(function(m) {
                return '<div class="dbg-cmd">' + m + '</div>';
            }).join('');
        }
    }

    destroy() {}
}
