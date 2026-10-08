class VHWRTC {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.tickRate = parseInt(cfg.tickRate) || 1000000;
        this.name = 'RTC DS1307 [0x68]';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-rtc';
        this.el.innerHTML =
            '<div class="pic-rtc-display" id="' + this.id + '-time">00:00:00</div>' +
            '<div class="pic-rtc-date" id="' + this.id + '-date">01/01/2025</div>' +
            '<div class="pic-rtc-status" id="' + this.id + '-status">Stopped</div>' +
            '<div class="pic-rtc-regs" id="' + this.id + '-regs"></div>' +
            '<div class="pic-rtc-controls">' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-sync">Sync Now</button>' +
            '<button class="pic-btn pic-btn-sm" id="' + this.id + '-toggle">Start/Stop</button>' +
            '</div>';
        container.appendChild(this.el);

        var legend = document.createElement('div');
        legend.className = 'pic-vhw-legend';
        legend.textContent = 'DS1307 @ 0x68 | Reg: 0=sec 1=min 2=hr 3=dow 4=date 5=mon 6=yr 7=ctrl | BCD format';
        container.appendChild(legend);

        this._attachToI2CBus();

        var self = this;
        document.getElementById(this.id + '-sync')?.addEventListener('click', function() {
            if (self._device) { self._device._setCurrentTime(); self._renderTime(); }
        });
        document.getElementById(this.id + '-toggle')?.addEventListener('click', function() {
            if (self._device) {
                self._device.running = !self._device.running;
                if (self._device.running) self._device.registers[0] &= 0x7F;
                else self._device.registers[0] |= 0x80;
            }
        });

        this._renderTime();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(0x68);
        if (existing) {
            this._device = existing;
        } else if (typeof VirtualDS1307 !== 'undefined') {
            this._device = new VirtualDS1307();
            this._device._tickRate = this.tickRate;
            mssp.i2cBus.attach(0x68, this._device);
        }
    }

    update() {
        if (!this._device) return;
        this._renderTime();
    }

    _renderTime() {
        if (!this._device) return;
        var t = this._device.getTime();
        var timeEl = document.getElementById(this.id + '-time');
        if (timeEl) timeEl.textContent = t.hours.toString().padStart(2, '0') + ':' + t.minutes.toString().padStart(2, '0') + ':' + t.seconds.toString().padStart(2, '0');
        var dateEl = document.getElementById(this.id + '-date');
        if (dateEl) dateEl.textContent = t.date.toString().padStart(2, '0') + '/' + t.month.toString().padStart(2, '0') + '/' + t.year;
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            statusEl.textContent = t.running ? 'Running' : 'Stopped (CH=1)';
            statusEl.className = 'pic-rtc-status' + (t.running ? ' pic-rtc-running' : '');
        }
        var regsEl = document.getElementById(this.id + '-regs');
        if (regsEl) {
            var hex = function(v) { return v.toString(16).toUpperCase().padStart(2, '0'); };
            regsEl.textContent = 'Regs: ' + hex(this._device.registers[0]) + ' ' + hex(this._device.registers[1]) + ' ' +
                hex(this._device.registers[2]) + ' ' + hex(this._device.registers[3]) + ' ' +
                hex(this._device.registers[4]) + ' ' + hex(this._device.registers[5]) + ' ' +
                hex(this._device.registers[6]) + ' ' + hex(this._device.registers[7]);
        }
    }

    destroy() {}
}
