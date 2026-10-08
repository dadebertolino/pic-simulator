class VHWSHT21 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.initHum = parseFloat(cfg.hum) || 50;
        this.name = 'SHT21 [0x40]';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-sensor';
        this.el.innerHTML =
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83C\uDF21</span>' +
            '<span class="pic-sensor-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(1) + '</span>' +
            '<span class="pic-sensor-unit">\u00B0C</span></div>' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83D\uDCA7</span>' +
            '<span class="pic-sensor-value pic-sensor-hum" id="' + this.id + '-hum">' + this.initHum.toFixed(1) + '</span>' +
            '<span class="pic-sensor-unit">%RH</span></div></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-tslider" min="-40" max="125" value="' + this.initTemp + '" step="0.5">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-tsval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-sensor-slider"><label>RH</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-hslider" min="0" max="100" value="' + this.initHum + '" step="1">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-hsval">' + this.initHum + '%</span></div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">14-bit temp, 12-bit RH</div>';
        container.appendChild(this.el);

        this._attachToI2CBus();
        var self = this;
        var tslider = document.getElementById(this.id + '-tslider');
        if (tslider) {
            tslider.addEventListener('input', function() {
                var val = parseFloat(tslider.value);
                if (self._device) self._device.setTemperature(val);
                var s = document.getElementById(self.id + '-tsval');
                if (s) s.textContent = val.toFixed(1) + '\u00B0C';
            });
        }
        var hslider = document.getElementById(this.id + '-hslider');
        if (hslider) {
            hslider.addEventListener('input', function() {
                var val = parseFloat(hslider.value);
                if (self._device) self._device.setHumidity(val);
                var s = document.getElementById(self.id + '-hsval');
                if (s) s.textContent = val.toFixed(0) + '%';
            });
        }
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(0x40);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualSHT21 !== 'undefined') {
            this._device = new VirtualSHT21();
            this._device.setTemperature(this.initTemp);
            this._device.setHumidity(this.initHum);
            mssp.i2cBus.attach(0x40, this._device);
        }
    }

    update() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.getTemperature().toFixed(1);
        var hel = document.getElementById(this.id + '-hum');
        if (hel) hel.textContent = this._device.getHumidity().toFixed(1);
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            statusEl.textContent = '14-bit T, 12-bit RH | cmd: 0x' +
                (this._device._command >= 0 ? this._device._command.toString(16).toUpperCase() : '--');
        }
    }

    destroy() {}
}
