class VHWLM75 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.a2a1a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x48 | this.a2a1a0;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.name = 'LM75 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
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
            '<span class="pic-sensor-unit">\u00B0C</span></div></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="-55" max="125" value="' + this.initTemp + '" step="0.5">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">9-bit, \u00B10.5\u00B0C</div>';
        container.appendChild(this.el);

        this._attachToI2CBus();
        var self = this;
        var slider = document.getElementById(this.id + '-slider');
        if (slider) {
            slider.addEventListener('input', function() {
                var val = parseFloat(slider.value);
                if (self._device) self._device.setTemperature(val);
                var sval = document.getElementById(self.id + '-sval');
                if (sval) sval.textContent = val.toFixed(1) + '\u00B0C';
            });
        }
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualLM75 !== 'undefined') {
            this._device = new VirtualLM75(this.a2a1a0);
            this._device.setTemperature(this.initTemp);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.temperature.toFixed(1);
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            var raw = Math.round(this._device.temperature * 2) & 0x1FF;
            statusEl.textContent = '9-bit | raw: 0x' + raw.toString(16).toUpperCase().padStart(3, '0') +
                ' | ptr: ' + this._device.pointer;
        }
    }

    destroy() {}
}
