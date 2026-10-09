class VHWLCD {
    constructor(hw, mode, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.mode = mode;
        this.cols = Math.min(40, Math.max(8, parseInt(cfg.cols) || 16));
        this.rows = Math.min(4, Math.max(1, parseInt(cfg.rows) || 2));

        if (mode === 8) {
            this.dataPort = cfg.dataPort || 'B';
            this.ctrlPort = cfg.ctrlPort || 'D';
            this.rsPin = parseInt(cfg.rsPin) || 0;
            this.enPin = parseInt(cfg.enPin) || 2;
            this.name = 'LCD ' + this.cols + 'x' + this.rows + ' 8-bit [D=PORT' + this.dataPort + ' C=PORT' + this.ctrlPort + ']';
        } else {
            this.dataPort = cfg.port || 'B';
            this.ctrlPort = cfg.port || 'B';
            this.dataBitsStart = parseInt(cfg.dataBits) || 4;
            this.rsPin = parseInt(cfg.rsPin) || 0;
            this.enPin = parseInt(cfg.enPin) || 2;
            this.name = 'LCD ' + this.cols + 'x' + this.rows + ' 4-bit [PORT' + this.dataPort + ']';
        }

        // HD44780 state
        this.ddram = new Uint8Array(80);
        this.ddram.fill(0x20);
        this.cursor = 0;
        this.displayOn = true;
        this.cursorOn = false;
        this.blinkOn = false;
        this.entryIncrement = true;
        this.nibbleHigh = true;
        this._highNibble = 0;
        this.prevEN = 0;
        this.cmdLog = [];
        this.el = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-lcd';

        // Screen
        var screen = document.createElement('div');
        screen.className = 'pic-lcd-screen';
        screen.id = this.id + '-screen';
        for (var r = 0; r < this.rows; r++) {
            var row = document.createElement('div');
            row.className = 'pic-lcd-row';
            row.id = this.id + '-row' + r;
            screen.appendChild(row);
        }
        this.el.appendChild(screen);

        // Debug panel (collapsible)
        var debug = document.createElement('details');
        debug.className = 'pic-lcd-debug';
        debug.innerHTML = '<summary>HD44780 Status</summary>' +
            '<div class="pic-lcd-debug-body" id="' + this.id + '-debug"></div>';
        this.el.appendChild(debug);

        container.appendChild(this.el);
        this._renderScreen();
        this._renderDebug();

        // I pin si campionano a ogni ciclo: a ogni aggiornamento dello
        // schermo si perdevano quasi tutti gli impulsi di EN.
        var self = this;
        this._unhook = this.hw.onEveryCycle(function() { self._sample(); });
    }

    update() {
        if (!this.el || !this._dirty) return;
        this._dirty = false;
        this._renderScreen();
        this._renderDebug();
    }

    destroy() {
        if (this._unhook) this._unhook();
    }

    _sample() {
        var en, rs, data;
        if (this.mode === 8) {
            var ctrl = this.hw.getPortByte(this.ctrlPort);
            rs = (ctrl >> this.rsPin) & 1;
            en = (ctrl >> this.enPin) & 1;
            data = this.hw.getPortByte(this.dataPort);
        } else {
            var portVal = this.hw.getPortByte(this.dataPort);
            rs = (portVal >> this.rsPin) & 1;
            en = (portVal >> this.enPin) & 1;
            data = (portVal >> this.dataBitsStart) & 0x0F;
        }

        // L'HD44780 legge il bus sul fronte di discesa di EN
        if (!en && this.prevEN) {
            if (this.mode === 4) this._nibble(rs, data & 0x0F);
            else this._process(rs, data);
            this._dirty = true;
        }
        this.prevEN = en;
    }

    /**
     * Interfaccia a 4 bit. Dopo l'accensione il controller e' a 8 bit: i
     * nibble di inizializzazione (0x3, 0x3, 0x3, 0x2) sono comandi interi;
     * dal "function set" con DL = 0 i byte arrivano in due nibble.
     */
    _nibble(rs, nibble) {
        if (!this.fourBit) {
            this._process(rs, nibble << 4);
            if (!rs && nibble === 0x2) { this.fourBit = true; this.nibbleHigh = true; }
            return;
        }
        if (this.nibbleHigh) { this._highNibble = nibble << 4; this.nibbleHigh = false; }
        else { this._process(rs, this._highNibble | nibble); this.nibbleHigh = true; }
    }

    _process(rs, data) {
        if (rs) {
            this.cmdLog.push({ type: 'DATA', val: data, ch: String.fromCharCode(data >= 0x20 && data < 0x7F ? data : 0x20) });
            this.ddram[this.cursor] = data;
            this.cursor = this.entryIncrement ? (this.cursor + 1) % 80 : (this.cursor - 1 + 80) % 80;
        } else {
            var desc = this._decodeCmd(data);
            this.cmdLog.push({ type: 'CMD', val: data, desc: desc });
            if (data === 0x01) { this.ddram.fill(0x20); this.cursor = 0; }
            else if (data <= 0x03) { this.cursor = 0; }
            else if ((data & 0xFC) === 0x04) { this.entryIncrement = !!(data & 0x02); }
            else if ((data & 0xF8) === 0x08) { this.displayOn = !!(data & 0x04); this.cursorOn = !!(data & 0x02); this.blinkOn = !!(data & 0x01); }
            else if ((data & 0x80) === 0x80) { this.cursor = data & 0x7F; }
            else if ((data & 0xE0) === 0x20) { /* function set */ }
        }
        if (this.cmdLog.length > 50) this.cmdLog.shift();
    }

    _decodeCmd(data) {
        if (data === 0x01) return 'Clear Display';
        if (data <= 0x03) return 'Return Home';
        if ((data & 0xFC) === 0x04) return 'Entry Mode: ' + (data & 2 ? 'Inc' : 'Dec') + (data & 1 ? '+Shift' : '');
        if ((data & 0xF8) === 0x08) return 'Display ' + (data & 4 ? 'ON' : 'OFF') + ' Cursor ' + (data & 2 ? 'ON' : 'OFF') + ' Blink ' + (data & 1 ? 'ON' : 'OFF');
        if ((data & 0xE0) === 0x20) return 'Function Set: ' + (data & 0x10 ? '8-bit' : '4-bit') + ' ' + (data & 0x08 ? '2-line' : '1-line') + ' ' + (data & 0x04 ? '5x10' : '5x8');
        if ((data & 0xC0) === 0x40) return 'Set CGRAM addr: 0x' + (data & 0x3F).toString(16);
        if ((data & 0x80) === 0x80) return 'Set DDRAM addr: 0x' + (data & 0x7F).toString(16) + (data & 0x40 ? ' (row2)' : ' (row1)');
        return 'Cmd: 0x' + data.toString(16).toUpperCase();
    }

    _renderScreen() {
        var rowAddrs = [0x00, 0x40, 0x14, 0x54]; // Standard HD44780 row addresses
        for (var r = 0; r < this.rows; r++) {
            var el = document.getElementById(this.id + '-row' + r);
            if (!el) continue;
            var offset = rowAddrs[r] || 0;
            var html = '';
            for (var col = 0; col < this.cols; col++) {
                var addr = offset + col;
                var ch = this.ddram[addr];
                var cls = 'pic-lcd-char';
                if (this.cursorOn && addr === this.cursor) cls += ' pic-lcd-cursor';
                var char = (ch >= 0x20 && ch < 0x7F) ? String.fromCharCode(ch) : ' ';
                if (char === '<') char = '&lt;';
                else if (char === '>') char = '&gt;';
                else if (char === '&') char = '&amp;';
                html += '<span class="' + cls + '">' + char + '</span>';
            }
            el.innerHTML = html;
        }
    }

    _renderDebug() {
        var el = document.getElementById(this.id + '-debug');
        if (!el) return;
        var hex = function(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); };
        var html = '<div class="pic-lcd-dbg-state">' +
            'Display: ' + (this.displayOn ? '<span class="on">ON</span>' : '<span class="off">OFF</span>') +
            ' | Cursor: ' + hex(this.cursor) +
            ' | Dir: ' + (this.entryIncrement ? 'Inc' : 'Dec') +
            ' | Mode: ' + this.cols + 'x' + this.rows +
            '</div>';
        // Last 10 commands
        html += '<div class="pic-lcd-dbg-log">';
        var start = Math.max(0, this.cmdLog.length - 10);
        for (var i = start; i < this.cmdLog.length; i++) {
            var e = this.cmdLog[i];
            if (e.type === 'CMD') {
                html += '<div class="dbg-cmd">' + hex(e.val) + ' ' + e.desc + '</div>';
            } else {
                html += '<div class="dbg-data">' + hex(e.val) + " '" + e.ch + "'</div>";
            }
        }
        html += '</div>';
        el.innerHTML = html;
    }
}

// ================================================================
//  LCD I2C (PCF8574) — modulo Amazon
// ================================================================

class VHWLCDI2C {
    constructor(hw, cfg, id) {
        this.hw = hw;
        this.id = id;
        this.i2cAddr = parseInt(cfg.addr) || 0x27;
        this.cols = Math.min(40, Math.max(8, parseInt(cfg.cols) || 16));
        this.rows = Math.min(4, Math.max(1, parseInt(cfg.rows) || 2));
        this.name = 'LCD I\u00B2C ' + this.cols + 'x' + this.rows + ' [0x' + this.i2cAddr.toString(16).toUpperCase() + ']';

        this.ddram = new Uint8Array(80);
        this.ddram.fill(0x20);
        this.cursor = 0;
        this.displayOn = true;
        this.cursorOn = false;
        this.blinkOn = false;
        this.entryIncrement = true;
        this.backlight = true;
        this.nibbleHigh = true;
        this._highNibble = 0;
        this.prevEN = 0;
        this.cmdLog = [];
        this.el = null;
        this._pcfDevice = null;
    }

    render(container) {
        this.el = document.createElement('div');
        this.el.className = 'pic-lcd';
        var screen = document.createElement('div');
        screen.className = 'pic-lcd-screen pic-lcd-i2c';
        screen.id = this.id + '-screen';
        for (var r = 0; r < this.rows; r++) {
            var row = document.createElement('div');
            row.className = 'pic-lcd-row';
            row.id = this.id + '-row' + r;
            screen.appendChild(row);
        }
        this.el.appendChild(screen);

        // Status
        var status = document.createElement('div');
        status.className = 'pic-lcd-status';
        status.id = this.id + '-status';
        this.el.appendChild(status);

        // Debug
        var debug = document.createElement('details');
        debug.className = 'pic-lcd-debug';
        debug.innerHTML = '<summary>HD44780 Status</summary><div class="pic-lcd-debug-body" id="' + this.id + '-debug"></div>';
        this.el.appendChild(debug);

        container.appendChild(this.el);
        this._attachToI2CBus();
        this._renderScreen();
    }

    _attachToI2CBus() {
        var mssp = this.hw.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return;
        var addr = this.i2cAddr;
        // Cerca device esistente nel bus (Map)
        var existing = mssp.i2cBus.devices.get(addr);
        if (existing) {
            this._pcfDevice = existing;
        } else if (typeof VirtualPCF8574 !== 'undefined') {
            // Crea PCF8574: per 0x27 → PCF8574 (non A), a2a1a0 = addr & 0x07
            var isTypeA = (addr >= 0x38);
            var a2a1a0 = addr & 0x07;
            this._pcfDevice = new VirtualPCF8574(a2a1a0, isTypeA);
            mssp.i2cBus.attach(addr, this._pcfDevice);
        }
        // Ogni scrittura sul PCF8574 e' un campione dei pin dell'LCD: a ogni
        // aggiornamento dello schermo se ne perdevano quasi tutti.
        if (this._pcfDevice) {
            var self = this;
            this._pcfDevice.onOutputChange = function(value) { self._sample(value); };
        }
    }

    _sample(data) {
        var rs = data & 0x01;
        var en = (data >> 2) & 0x01;
        this.backlight = !!((data >> 3) & 0x01);
        if (!en && this.prevEN) {
            this._nibble(rs, (data >> 4) & 0x0F);
            this._dirty = true;
        }
        this.prevEN = en;
    }

    update() {
        if (!this.el) return;
        var data = this._pcfDevice ? (this._pcfDevice.outputLatch || 0) : 0;
        if (this._dirty) {
            this._dirty = false;
            this._renderScreen();
            this._renderDebug();
        }

        var statusEl = document.getElementById(this.id + '-status');
        if (statusEl) statusEl.textContent = 'I\u00B2C: 0x' + this.i2cAddr.toString(16).toUpperCase() + ' | BL: ' + (this.backlight ? 'ON' : 'OFF') + ' | PCF8574: 0x' + data.toString(16).toUpperCase().padStart(2, '0');
    }

    // Stessa logica HD44780 dell'LCD parallelo. Si usano i metodi di VHWLCD
    // su questo oggetto: chiamati con .call(this) cercavano this._process e
    // this._decodeCmd, che qui non esistevano, e si fermavano al primo comando.
    _renderScreen() { VHWLCD.prototype._renderScreen.call(this); }
    _renderDebug() { VHWLCD.prototype._renderDebug.call(this); }
    _process(rs, data) { VHWLCD.prototype._process.call(this, rs, data); }
    _decodeCmd(data) { return VHWLCD.prototype._decodeCmd.call(this, data); }
    _nibble(rs, nibble) { VHWLCD.prototype._nibble.call(this, rs, nibble); }

    destroy() {
        if (this._pcfDevice) this._pcfDevice.onOutputChange = null;
    }
}
