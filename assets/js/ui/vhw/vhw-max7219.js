/**
 * VHW MAX7219 - LED Driver 8-digit (SPI)
 * Mostra 8 digit 7-segmenti pilotati dal MAX7219.
 */
class VHWMAX7219 {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.name = 'MAX7219 8-Digit';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-max7219';
        var html = '<div class="pic-7seg-multi">';
        for (var i = 0; i < 8; i++) {
            html += '<div class="pic-7seg" id="' + this.id + '-d' + i + '"></div>';
        }
        html += '</div>' +
            '<div class="pic-sensor-status" id="' + this.id + '-status">Intensity: 0 | Scan: 0 | Shutdown</div>';
        this.el.innerHTML = html;
        container.appendChild(this.el);
        this._attachToSPIBus();
    }

    _attachToSPIBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.spiBus) return;
        if (typeof VirtualMAX7219 !== 'undefined') {
            this._device = new VirtualMAX7219();
            mssp.spiBus.devices.push(this._device);
        }
    }

    update() {
        if (!this._device) return;
        var regs = this._device.registers;
        for (var i = 0; i < 8; i++) {
            var el = document.getElementById(this.id + '-d' + i);
            if (el) el.innerHTML = this._svg(regs[i + 1] || 0); // Digits 1-8
        }
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            var shutdown = !(regs[0x0C] & 0x01);
            statusEl.textContent = 'Intensity: ' + ((regs[0x0A] || 0) & 0x0F) +
                ' | Scan: ' + ((regs[0x0B] || 0) & 0x07) +
                (shutdown ? ' | SHUTDOWN' : ' | ON') +
                (regs[0x0F] ? ' | TEST' : '');
        }
    }

    _svg(val) {
        // MAX7219 segment mapping: DP-A-B-C-D-E-F-G (bit7=DP, bit6=A, ... bit0=G)
        // Remap to our standard: bit0=a, bit1=b, etc.
        var remap = 0;
        if (val & 0x40) remap |= 0x01; // A → a
        if (val & 0x20) remap |= 0x02; // B → b
        if (val & 0x10) remap |= 0x04; // C → c
        if (val & 0x08) remap |= 0x08; // D → d
        if (val & 0x04) remap |= 0x10; // E → e
        if (val & 0x02) remap |= 0x20; // F → f
        if (val & 0x01) remap |= 0x40; // G → g
        if (val & 0x80) remap |= 0x80; // DP
        return VHW7Seg1.prototype._svg(remap);
    }

    destroy() {}
}
