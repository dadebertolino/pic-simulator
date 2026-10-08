class VHWBMP280 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.sdoHigh = cfg.addr === 'high';
        this.i2cAddr = this.sdoHigh ? 0x77 : 0x76;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.initPress = parseFloat(cfg.press) || 1013;
        this.name = 'BMP280 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-bmp280';
        this.el.innerHTML =
            '<div class="pic-bmp-readings">' +
            '<div class="pic-bmp-reading"><span class="pic-bmp-icon">🌡</span><span class="pic-bmp-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(1) + '</span><span class="pic-bmp-unit">°C</span></div>' +
            '<div class="pic-bmp-reading"><span class="pic-bmp-icon">⬇</span><span class="pic-bmp-value" id="' + this.id + '-press">' + this.initPress.toFixed(1) + '</span><span class="pic-bmp-unit">hPa</span></div>' +
            '</div>' +
            '<div class="pic-bmp-controls">' +
            '<div class="pic-bmp-slider-row"><label>Temp</label><input type="range" class="pic-adc-slider" id="' + this.id + '-temp-slider" min="-40" max="85" value="' + this.initTemp + '" step="0.5"><span class="pic-bmp-slider-val" id="' + this.id + '-temp-sval">' + this.initTemp + '°C</span></div>' +
            '<div class="pic-bmp-slider-row"><label>Press</label><input type="range" class="pic-adc-slider" id="' + this.id + '-press-slider" min="300" max="1100" value="' + this.initPress + '" step="1"><span class="pic-bmp-slider-val" id="' + this.id + '-press-sval">' + this.initPress + ' hPa</span></div>' +
            '</div>' +
            '<div class="pic-bmp-status" id="' + this.id + '-status">Mode: Sleep | ID: 0x58</div>' +
            '<details class="pic-lcd-debug"><summary>BMP280 Registers</summary>' +
            '<div class="pic-lcd-debug-body" id="' + this.id + '-regs"></div></details>';
        container.appendChild(this.el);

        this._attachToI2CBus();
        this._bindSliders();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualBMP280 !== 'undefined') {
            this._device = new VirtualBMP280(this.sdoHigh);
            this._device.setTemperature(this.initTemp);
            this._device.setPressure(this.initPress);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    _bindSliders() {
        var self = this;
        var tempSlider = document.getElementById(this.id + '-temp-slider');
        if (tempSlider) {
            tempSlider.addEventListener('input', function() {
                var val = parseFloat(tempSlider.value);
                if (self._device) self._device.setTemperature(val);
                var sval = document.getElementById(self.id + '-temp-sval');
                if (sval) sval.textContent = val.toFixed(1) + '°C';
            });
        }
        var pressSlider = document.getElementById(this.id + '-press-slider');
        if (pressSlider) {
            pressSlider.addEventListener('input', function() {
                var val = parseFloat(pressSlider.value);
                if (self._device) self._device.setPressure(val);
                var sval = document.getElementById(self.id + '-press-sval');
                if (sval) sval.textContent = val.toFixed(0) + ' hPa';
            });
        }
    }

    update() {
        if (!this._device) return;
        var state = this._device.getState();

        var tempEl = document.getElementById(this.id + '-temp');
        if (tempEl) tempEl.textContent = this._device.getTemperature().toFixed(1);
        var pressEl = document.getElementById(this.id + '-press');
        if (pressEl) pressEl.textContent = this._device.getPressure().toFixed(1);

        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) statusEl.textContent = 'Mode: ' + state.mode + ' | ID: ' + state.chipId +
            ' | ctrl: 0x' + this._device.registers[0xF4].toString(16).toUpperCase().padStart(2, '0');

        var regsEl = document.getElementById(this.id + '-regs');
        if (regsEl) {
            var hex = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
            var r = this._device.registers;
            regsEl.innerHTML =
                '<div class="dbg-cmd">chip_id(D0): 0x' + hex(r[0xD0]) + '</div>' +
                '<div class="dbg-cmd">ctrl_meas(F4): 0x' + hex(r[0xF4]) + ' [osrs_t=' + ((r[0xF4] >> 5) & 7) + ' osrs_p=' + ((r[0xF4] >> 2) & 7) + ' mode=' + (r[0xF4] & 3) + ']</div>' +
                '<div class="dbg-cmd">config(F5): 0x' + hex(r[0xF5]) + '</div>' +
                '<div class="dbg-cmd">status(F3): 0x' + hex(r[0xF3]) + '</div>' +
                '<div class="dbg-data">temp raw: ' + hex(r[0xFA]) + ' ' + hex(r[0xFB]) + ' ' + hex(r[0xFC]) + ' = 0x' + ((r[0xFA] << 12) | (r[0xFB] << 4) | (r[0xFC] >> 4)).toString(16).toUpperCase() + '</div>' +
                '<div class="dbg-data">press raw: ' + hex(r[0xF7]) + ' ' + hex(r[0xF8]) + ' ' + hex(r[0xF9]) + ' = 0x' + ((r[0xF7] << 12) | (r[0xF8] << 4) | (r[0xF9] >> 4)).toString(16).toUpperCase() + '</div>' +
                '<div class="dbg-cmd">calib T1=' + (r[0x88] | (r[0x89] << 8)) + ' T2=' + this._s16(r[0x8A] | (r[0x8B] << 8)) + ' T3=' + this._s16(r[0x8C] | (r[0x8D] << 8)) + '</div>';
        }
    }

    _s16(v) { return v > 32767 ? v - 65536 : v; }

    destroy() {}
}
