/**
 * VHW PCF8563 — NXP RTC with alarm and timer
 */
class VHWPCF8563 {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.tickRate = parseInt(cfg.tickRate) || 1000;
        this.name = 'PCF8563 RTC [0x51]';
        this._device = null;
    }

    render(container) {
        container.innerHTML =
            '<div class="pic-rtc-display" id="' + this.id + '-time">00:00:00</div>' +
            '<div class="pic-rtc-date" id="' + this.id + '-date">01/01/2025</div>' +
            '<div class="pic-rtc-extras">' +
            '<span id="' + this.id + '-flags"></span>' +
            '</div>' +
            '<div class="pic-rtc-status" id="' + this.id + '-status">Stopped</div>' +
            '<div class="pic-rtc-regs" id="' + this.id + '-regs"></div>' +
            '<div class="pic-rtc-controls">' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-sync">Sync Now</button>' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-toggle">Start/Stop</button>' +
            '</div>';

        var legend = document.createElement('div');
        legend.className = 'pic-vhw-legend';
        legend.textContent = 'PCF8563 @ 0x51 | NXP | Reg: 02=sec 03=min 04=hr 05=day 07=mon 08=yr | VL=clock integrity';
        container.appendChild(legend);

        this._attach();
        var self = this;
        document.getElementById(this.id + '-sync')?.addEventListener('click', function() {
            if (self._device) self._device._setCurrentTime();
        });
        document.getElementById(this.id + '-toggle')?.addEventListener('click', function() {
            if (self._device) {
                self._device.running = !self._device.running;
                if (self._device.running) self._device.registers[0] &= 0xDF;
                else self._device.registers[0] |= 0x20;
            }
        });
    }

    _attach() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var ex = mssp.i2cBus.devices.get(0x51);
        if (ex) { this._device = ex; }
        else if (typeof VirtualPCF8563 !== 'undefined') {
            this._device = new VirtualPCF8563();
            this._device._tickRate = this.tickRate;
            mssp.i2cBus.attach(0x51, this._device);
        }
    }

    update() {
        if (!this._device) return;
        this._device.tick(1);
        var t = this._device.getTime();
        var timeEl = document.getElementById(this.id + '-time');
        if (timeEl) timeEl.textContent = t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0');
        var dateEl = document.getElementById(this.id + '-date');
        if (dateEl) dateEl.textContent = t.date.toString().padStart(2, '0') + '/' + t.month.toString().padStart(2, '0') + '/' + t.year;
        var flagsEl = document.getElementById(this.id + '-flags');
        if (flagsEl) {
            var html = '';
            if (t.vlFlag) html += '<span class="pic-rtc-alarm-flag">VL</span> ';
            if (t.alarmFlag) html += '<span class="pic-rtc-alarm-flag">ALM</span>';
            flagsEl.innerHTML = html;
        }
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            statusEl.textContent = t.running ? 'Running' : 'Stopped';
            statusEl.className = 'pic-rtc-status' + (t.running ? ' pic-rtc-running' : '');
        }
        var regsEl = document.getElementById(this.id + '-regs');
        if (regsEl) {
            var r = this._device.registers;
            var h = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
            regsEl.textContent = 'Ctrl: ' + h(r[0]) + ' ' + h(r[1]) +
                ' | Time: ' + h(r[2]) + ' ' + h(r[3]) + ' ' + h(r[4]) +
                ' | Alm: ' + h(r[9]) + ' ' + h(r[0xA]);
        }
    }

    destroy() {}
}
