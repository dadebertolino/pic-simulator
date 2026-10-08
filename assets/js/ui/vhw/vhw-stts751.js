/**
 * VHW STTS751 — ST 12-bit temperature sensor
 */
class VHWSTTS751 {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.a2a1a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x48 | this.a2a1a0;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.name = 'STTS751 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this._device = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83C\uDF21</span>' +
            '<span class="pic-sensor-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(2) + '</span>' +
            '<span class="pic-sensor-unit">\u00B0C</span></div></div>' +
            '<div class="pic-mcp9808-alerts" id="' + this.id + '-flags"></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="-64" max="127" value="' + this.initTemp + '" step="0.0625">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">12-bit | Manuf: 0x53 (ST)</div>';
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
        else if (typeof VirtualSTTS751 !== 'undefined') {
            this._device = new VirtualSTTS751(this.a2a1a0);
            this._device.setTemperature(this.initTemp);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.getTemperature().toFixed(2);
        var fEl = document.getElementById(this.id + '-flags');
        if (fEl) {
            var s = this._device._status || 0;
            var html = '';
            if (s & 0x01) html += '<span class="pic-alert-badge pic-alert-high">T>HIGH</span> ';
            if (s & 0x02) html += '<span class="pic-alert-badge pic-alert-low">T<LOW</span>';
            fEl.innerHTML = html || '<span class="pic-alert-badge pic-alert-ok">Normal</span>';
        }
    }

    destroy() {}
}
