/**
 * VHW TMP102 — 12-bit temperature sensor with alert
 */
class VHWTMP102 {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x48 | this.a0;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.name = 'TMP102 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this._device = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83C\uDF21</span>' +
            '<span class="pic-sensor-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(2) + '</span>' +
            '<span class="pic-sensor-unit">\u00B0C</span></div></div>' +
            '<div class="pic-mcp9808-alerts" id="' + this.id + '-alert"></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="-55" max="150" value="' + this.initTemp + '" step="0.0625">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">12-bit, 0.0625\u00B0C</div>';
        this._attach();
        var self = this;
        document.getElementById(this.id + '-slider')?.addEventListener('input', function() {
            var v = parseFloat(this.value);
            if (self._device) self._device.setTemperature(v);
            var s = document.getElementById(self.id + '-sval');
            if (s) s.textContent = v.toFixed(2) + '\u00B0C';
        });
    }

    _attach() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var ex = mssp.i2cBus.devices.get(this.i2cAddr);
        if (ex) { this._device = ex; }
        else if (typeof VirtualTMP102 !== 'undefined') {
            this._device = new VirtualTMP102(this.a0);
            this._device.setTemperature(this.initTemp);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.getTemperature().toFixed(2);
        var aEl = document.getElementById(this.id + '-alert');
        if (aEl) aEl.innerHTML = this._device.isAlert()
            ? '<span class="pic-alert-badge pic-alert-high">ALERT</span>'
            : '<span class="pic-alert-badge pic-alert-ok">Normal</span>';
    }

    destroy() {}
}
