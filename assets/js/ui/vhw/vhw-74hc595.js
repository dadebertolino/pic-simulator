/**
 * VHW 74HC595 - 8-bit Shift Register (SPI)
 * Mostra 8 output come LED con valore shift register e latch.
 */
class VHW74HC595 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.csPin = parseInt(cfg.csPin) || 0;
        this.csPort = cfg.csPort || 'A';
        this.name = '74HC595 [CS=R' + this.csPort + this.csPin + ']';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-shift';
        var html = '<div class="pic-led-bar">';
        for (var i = 7; i >= 0; i--) {
            html += '<div class="pic-led-bar-led" id="' + this.id + '-q' + i + '">' +
                '<div class="pic-led-bar-light"></div><span class="pic-led-bar-label">Q' + i + '</span></div>';
        }
        html += '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">Shift: 0x00 | Latch: 0x00</div>';
        this.el.innerHTML = html;
        container.appendChild(this.el);
        this._attachToSPIBus();
    }

    _attachToSPIBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.spiBus) return;
        if (typeof Virtual74HC595 !== 'undefined') {
            this._device = new Virtual74HC595();
            var idx = mssp.spiBus.devices.length;
            mssp.spiBus.devices.push(this._device);
        }
    }

    update() {
        if (!this._device) return;
        var val = this._device.outputLatch || 0;
        for (var i = 0; i < 8; i++) {
            var el = document.getElementById(this.id + '-q' + i);
            if (el) el.classList.toggle('on', !!(val & (1 << i)));
        }
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            var hex = function(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); };
            statusEl.textContent = 'Shift: ' + hex(this._device.shiftRegister || 0) +
                ' | Latch: ' + hex(val);
        }
    }

    destroy() {}
}
