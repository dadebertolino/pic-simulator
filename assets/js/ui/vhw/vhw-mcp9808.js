/**
 * VHW MCP9808 — Temperature sensor with alert thresholds
 */
class VHWMCP9808 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.a2a1a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x18 | this.a2a1a0;
        this.initTemp = parseFloat(cfg.temp) || 25;
        this.name = 'MCP9808 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-sensor';
        this.el.innerHTML =
            '<div class="pic-sensor-readings">' +
            '<div class="pic-sensor-reading"><span class="pic-sensor-icon">\uD83C\uDF21</span>' +
            '<span class="pic-sensor-value" id="' + this.id + '-temp">' + this.initTemp.toFixed(2) + '</span>' +
            '<span class="pic-sensor-unit">\u00B0C</span></div></div>' +
            '<div class="pic-mcp9808-alerts" id="' + this.id + '-alerts"></div>' +
            '<div class="pic-sensor-slider"><label>Temp</label>' +
            '<input type="range" class="pic-adc-slider" id="' + this.id + '-slider" min="-40" max="125" value="' + this.initTemp + '" step="0.0625">' +
            '<span class="pic-bmp-slider-val" id="' + this.id + '-sval">' + this.initTemp + '\u00B0C</span></div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">13-bit, \u00B10.25\u00B0C | ID: 0x0054</div>' +
            '<details class="pic-lcd-debug"><summary>MCP9808 Registers</summary>' +
            '<div class="pic-lcd-debug-body" id="' + this.id + '-regs"></div></details>';
        container.appendChild(this.el);

        this._attachToI2CBus();
        var self = this;
        var slider = document.getElementById(this.id + '-slider');
        if (slider) {
            slider.addEventListener('input', function() {
                var val = parseFloat(slider.value);
                if (self._device) self._device.setTemperature(val);
                var sval = document.getElementById(self.id + '-sval');
                if (sval) sval.textContent = val.toFixed(2) + '\u00B0C';
            });
        }
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualMCP9808 !== 'undefined') {
            this._device = new VirtualMCP9808(this.a2a1a0);
            this._device.setTemperature(this.initTemp);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-temp');
        if (el) el.textContent = this._device.getTemperature().toFixed(2);
        var flags = this._device.getAlertFlags();
        var alertsEl = document.getElementById(this.id + '-alerts');
        if (alertsEl) {
            var html = '';
            if (flags.critical) html += '<span class="pic-alert-badge pic-alert-crit">CRITICAL</span> ';
            if (flags.upper) html += '<span class="pic-alert-badge pic-alert-high">T>UPPER</span> ';
            if (flags.lower) html += '<span class="pic-alert-badge pic-alert-low">T<LOWER</span>';
            alertsEl.innerHTML = html || '<span class="pic-alert-badge pic-alert-ok">Normal</span>';
        }
        var regsEl = document.getElementById(this.id + '-regs');
        if (regsEl) {
            var hex16 = function(v) { return '0x' + v.toString(16).toUpperCase().padStart(4, '0'); };
            var r = this._device._regs;
            regsEl.innerHTML =
                '<div class="dbg-data">T_ambient(05): ' + hex16(r[0x05]) + '</div>' +
                '<div class="dbg-cmd">T_upper(02): ' + hex16(r[0x02]) + ' = ' + (r[0x02] ? ((r[0x02] & 0x0FFF) * 0.0625).toFixed(2) : '0') + '\u00B0C</div>' +
                '<div class="dbg-cmd">T_lower(03): ' + hex16(r[0x03]) + '</div>' +
                '<div class="dbg-cmd">T_critical(04): ' + hex16(r[0x04]) + '</div>' +
                '<div class="dbg-cmd">Config(01): ' + hex16(r[0x01]) + '</div>' +
                '<div class="dbg-cmd">Manuf ID(06): ' + hex16(r[0x06]) + ' Device(07): ' + hex16(r[0x07]) + '</div>';
        }
    }

    destroy() {}
}
