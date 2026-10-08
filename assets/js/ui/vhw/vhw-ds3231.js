/**
 * VHW DS3231 — RTC con allarmi e temperatura interna
 */
class VHWDS3231 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.tickRate = parseInt(cfg.tickRate) || 1000;
        this.name = 'DS3231 RTC [0x68]';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-rtc';
        this.el.innerHTML =
            '<div class="pic-rtc-display" id="' + this.id + '-time">00:00:00</div>' +
            '<div class="pic-rtc-date" id="' + this.id + '-date">01/01/2025</div>' +
            '<div class="pic-rtc-extras">' +
            '<span class="pic-rtc-temp" id="' + this.id + '-temp">\uD83C\uDF21 25.0\u00B0C</span>' +
            '<span class="pic-rtc-alarms" id="' + this.id + '-alarms"></span>' +
            '</div>' +
            '<div class="pic-rtc-status" id="' + this.id + '-status">Running</div>' +
            '<div class="pic-rtc-regs" id="' + this.id + '-regs"></div>' +
            '<div class="pic-rtc-controls">' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-sync">Sync Now</button>' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-toggle">Start/Stop</button>' +
            '</div>';
        container.appendChild(this.el);

        var legend = document.createElement('div');
        legend.className = 'pic-vhw-legend';
        legend.textContent = 'DS3231 @ 0x68 | 0-6=time 7-A=alarm1 B-D=alarm2 E=ctrl F=status 11-12=temp';
        container.appendChild(legend);

        this._attachToI2CBus();
        var self = this;
        document.getElementById(this.id + '-sync')?.addEventListener('click', function() {
            if (self._device) { self._device._setCurrentTime(); }
        });
        document.getElementById(this.id + '-toggle')?.addEventListener('click', function() {
            if (self._device) { self._device.running = !self._device.running; }
        });
        this._render();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(0x68);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualDS3231 !== 'undefined') {
            this._device = new VirtualDS3231();
            this._device._tickRate = this.tickRate;
            mssp.i2cBus.attach(0x68, this._device);
        }
    }

    update() {
        if (!this._device) return;
        this._device.tick(1);
        this._render();
    }

    _render() {
        if (!this._device) return;
        var t = this._device.getTime();
        var timeEl = document.getElementById(this.id + '-time');
        if (timeEl) timeEl.textContent = t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0');
        var dateEl = document.getElementById(this.id + '-date');
        if (dateEl) dateEl.textContent = t.date.toString().padStart(2, '0') + '/' + t.month.toString().padStart(2, '0') + '/' + t.year;
        var tempEl = document.getElementById(this.id + '-temp');
        if (tempEl) tempEl.textContent = '\uD83C\uDF21 ' + t.temperature.toFixed(1) + '\u00B0C';
        var alarmsEl = document.getElementById(this.id + '-alarms');
        if (alarmsEl) {
            var a = '';
            if (t.alarm1) a += '<span class="pic-rtc-alarm-flag">ALM1</span> ';
            if (t.alarm2) a += '<span class="pic-rtc-alarm-flag">ALM2</span>';
            alarmsEl.innerHTML = a;
        }
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            statusEl.textContent = t.running ? 'Running' : 'Stopped';
            statusEl.className = 'pic-rtc-status' + (t.running ? ' pic-rtc-running' : '');
        }
        var regsEl = document.getElementById(this.id + '-regs');
        if (regsEl) {
            var r = this._device.registers;
            var hex = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
            regsEl.textContent = 'Time: ' + hex(r[0]) + ' ' + hex(r[1]) + ' ' + hex(r[2]) +
                ' | Ctrl: ' + hex(r[0x0E]) + ' Stat: ' + hex(r[0x0F]) +
                ' | Temp: ' + hex(r[0x11]) + '.' + hex(r[0x12]);
        }
    }

    destroy() {}
}
