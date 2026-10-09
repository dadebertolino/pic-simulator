class VHWEepromViewer {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.a2a1a0 = parseInt(cfg.addr) || 0;
        this.i2cAddr = 0x50 | this.a2a1a0;
        this.name = 'EEPROM 24C02 [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';
        this.el = null;
        this._device = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-vhw-eeprom';
        this.el.innerHTML =
            '<div class="pic-eeprom-status" id="' + this.id + '-status">256 bytes</div>' +
            '<div class="pic-eeprom-grid" id="' + this.id + '-grid"></div>';
        container.appendChild(this.el);

        var legend = document.createElement('div');
        legend.className = 'pic-vhw-legend';
        legend.textContent = '24C02 @ 0x' + this.i2cAddr.toString(16).toUpperCase() + ' | 256 bytes | Write: addr+data, Read: addr then read';
        container.appendChild(legend);

        this._attachToI2CBus();
        this._renderGrid();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var existing = mssp.i2cBus.devices.get(this.i2cAddr);
        if (existing) {
            this._device = existing;
        } else if (typeof Virtual24C02 !== 'undefined') {
            this._device = new Virtual24C02(this.a2a1a0);
            mssp.i2cBus.attach(this.i2cAddr, this._device);
        }
    }

    update() { this._renderGrid(); }

    _renderGrid() {
        if (!this._device) return;
        var el = document.getElementById(this.id + '-grid');
        if (!el) return;
        var mem = this._device.memory;
        var html = '<table class="pic-eeprom-table"><thead><tr><th></th>';
        for (var i = 0; i < 16; i++) html += '<th>' + i.toString(16).toUpperCase() + '</th>';
        html += '</tr></thead><tbody>';
        for (var row = 0; row < 16; row++) {
            html += '<tr><td class="pic-eeprom-addr">' + (row * 16).toString(16).toUpperCase().padStart(2, '0') + '</td>';
            for (var col = 0; col < 16; col++) {
                var addr = row * 16 + col;
                var val = mem[addr];
                var cls = val !== 0 ? ' class="pic-eeprom-used"' : '';
                html += '<td' + cls + '>' + val.toString(16).toUpperCase().padStart(2, '0') + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        el.innerHTML = html;
        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) {
            var used = 0;
            for (var j = 0; j < 256; j++) { if (mem[j] !== 0) used++; }
            statusEl.textContent = used + '/256 bytes used | ptr: 0x' + this._device.wordAddr.toString(16).toUpperCase().padStart(2, '0');
        }
    }

    destroy() {}
}
