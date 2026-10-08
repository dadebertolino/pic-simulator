/**
 * VirtualKS0108 — 128x64 Graphic LCD (Parallel)
 * Classic GLCD controller (KS0108/KS0107 compatible)
 *
 * Pins: D0-D7 (data), RS (0=cmd, 1=data), RW, EN, CS1, CS2, RST
 * 128x64 display split in 2 halves: CS1=left 64 cols, CS2=right 64 cols
 * Each half: 8 pages x 64 columns, each byte = 8 vertical pixels
 *
 * Commands:
 *   0x3F = Display ON, 0x3E = Display OFF
 *   0x40-0x7F = Set Y address (column 0-63)
 *   0xB8-0xBF = Set X address (page 0-7)
 *   0xC0-0xFF = Set display start line (scroll)
 */
class VirtualKS0108 {
    constructor() {
        this.name = 'KS0108 GLCD';
        this.width = 128;
        this.height = 64;

        // Two chips, 64 columns each, 8 pages
        this.ram = [
            new Uint8Array(8 * 64),  // CS1: left half
            new Uint8Array(8 * 64)   // CS2: right half
        ];

        this.displayOn = [true, true];
        this.page = [0, 0];       // X address (page 0-7)
        this.column = [0, 0];     // Y address (column 0-63)
        this.startLine = [0, 0];

        // Pin state
        this._prevEN = 0;
        this.cmdLog = [];
    }

    /**
     * Tick: chiamato con lo stato dei pin di controllo.
     * @param {number} data - D0-D7 (8-bit)
     * @param {number} rs - Register Select (0=cmd, 1=data)
     * @param {number} en - Enable
     * @param {number} cs1 - Chip Select 1 (active high)
     * @param {number} cs2 - Chip Select 2 (active high)
     */
    tick(data, rs, en, cs1, cs2) {
        // Rising edge EN
        if (en && !this._prevEN) {
            var chips = [];
            if (cs1) chips.push(0);
            if (cs2) chips.push(1);

            for (var i = 0; i < chips.length; i++) {
                var c = chips[i];
                if (rs) {
                    // Data write
                    var addr = this.page[c] * 64 + this.column[c];
                    if (addr < this.ram[c].length) {
                        this.ram[c][addr] = data;
                    }
                    this.column[c] = (this.column[c] + 1) & 0x3F; // Auto-increment
                } else {
                    // Command
                    this._processCmd(c, data);
                }
            }
        }
        this._prevEN = en;
    }

    _processCmd(chip, cmd) {
        if (cmd === 0x3F) {
            this.displayOn[chip] = true;
            this._log('CS' + (chip + 1) + ' Display ON');
        } else if (cmd === 0x3E) {
            this.displayOn[chip] = false;
            this._log('CS' + (chip + 1) + ' Display OFF');
        } else if ((cmd & 0xC0) === 0x40) {
            this.column[chip] = cmd & 0x3F;
        } else if ((cmd & 0xF8) === 0xB8) {
            this.page[chip] = cmd & 0x07;
        } else if ((cmd & 0xC0) === 0xC0) {
            this.startLine[chip] = cmd & 0x3F;
        }
    }

    _log(msg) {
        this.cmdLog.push(msg);
        if (this.cmdLog.length > 20) this.cmdLog.shift();
    }

    /**
     * Get pixel (x,y) → 0 or 1.
     */
    getPixel(x, y) {
        if (x < 0 || x >= 128 || y < 0 || y >= 64) return 0;
        var chip = x < 64 ? 0 : 1;
        var col = x < 64 ? x : x - 64;
        var page = Math.floor(y / 8);
        var bit = y % 8;
        return (this.ram[chip][page * 64 + col] >> bit) & 1;
    }

    clearDisplay() {
        this.ram[0].fill(0);
        this.ram[1].fill(0);
    }

    getState() {
        return {
            displayOn: this.displayOn.slice(),
            page: this.page.slice(),
            column: this.column.slice()
        };
    }
}
