/**
 * VHW Keypad — 4x4 Matrix Keypad UI
 * Rows on one port (output), columns on another (input).
 */
class VHWKeypad {
    constructor(hw, cfg, id) {
        this.hw = hw; this.id = id;
        this.rowPort = cfg.rowPort || 'B';
        this.rowStart = parseInt(cfg.rowStart) || 0;
        this.colPort = cfg.colPort || 'B';
        this.colStart = parseInt(cfg.colStart) || 4;
        this.name = 'Keypad [R=PORT' + this.rowPort + ' C=PORT' + this.colPort + ']';
        this._keypad = null;
    }

    render(container) {
        if (typeof VirtualKeypad === 'undefined') return;
        this._keypad = new VirtualKeypad();
        var keys = this._keypad.keys;
        var html = '<div class="pic-keypad">';
        for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
                html += '<button class="pic-keypad-btn" id="' + this.id + '-k' + r + c + '" ' +
                    'data-r="' + r + '" data-c="' + c + '">' + keys[r][c] + '</button>';
            }
        }
        html += '</div>' +
            '<div class="pic-keypad-last" id="' + this.id + '-last">Last: --</div>' +
            '<div class="pic-sensor-status">Rows=R' + this.rowPort + this.rowStart + '-' + (this.rowStart + 3) +
            ' Cols=R' + this.colPort + this.colStart + '-' + (this.colStart + 3) + '</div>';
        container.innerHTML = html;

        var self = this;
        container.querySelectorAll('.pic-keypad-btn').forEach(function(btn) {
            var r = parseInt(btn.dataset.r), c = parseInt(btn.dataset.c);
            btn.addEventListener('mousedown', function() { self._keypad.pressKey(r, c); btn.classList.add('pressed'); });
            btn.addEventListener('mouseup', function() { self._keypad.releaseKey(r, c); btn.classList.remove('pressed'); });
            btn.addEventListener('mouseleave', function() { self._keypad.releaseKey(r, c); btn.classList.remove('pressed'); });
            btn.addEventListener('touchstart', function(e) { e.preventDefault(); self._keypad.pressKey(r, c); btn.classList.add('pressed'); });
            btn.addEventListener('touchend', function(e) { e.preventDefault(); self._keypad.releaseKey(r, c); btn.classList.remove('pressed'); });
        });
    }

    update() {
        if (!this._keypad) return;
        // Read row outputs from PIC, write column inputs back
        var rowGpio = this.hw.cpu.getPeripheral('GPIO_' + this.rowPort);
        var colGpio = this.hw.cpu.getPeripheral('GPIO_' + this.colPort);
        if (!rowGpio || !colGpio) return;

        var rowData = this.hw.cpu.ram[rowGpio.dataAddr];
        var rows = (rowData >> this.rowStart) & 0x0F;
        var cols = this._keypad.scan(rows);

        // Write columns to external pins
        for (var c = 0; c < 4; c++) {
            colGpio.setExternalPin(this.colStart + c, (cols >> c) & 1);
        }

        var lastEl = document.getElementById(this.id + '-last');
        if (lastEl) lastEl.textContent = 'Last: ' + (this._keypad.lastKey || '--');
    }

    destroy() {}
}
