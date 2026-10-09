/**
 * VirtualKeypad — 4x4 Matrix Keypad
 * Rows = output (PIC drives), Columns = input (PIC reads)
 * When row is LOW and key pressed, column reads LOW.
 */
class VirtualKeypad {
    constructor() {
        this.name = 'Keypad 4x4';
        this.keys = [
            ['1','2','3','A'],
            ['4','5','6','B'],
            ['7','8','9','C'],
            ['*','0','#','D']
        ];
        this.pressed = new Array(16).fill(false); // flat index r*4+c
        this.lastKey = '';
    }

    /**
     * Dato lo stato delle righe (output dal PIC), ritorna lo stato colonne.
     * @param {number} rows - 4-bit, active low (riga attiva = 0)
     * @returns {number} cols - 4-bit, active low (colonna premuta = 0)
     */
    scan(rows) {
        var cols = 0x0F; // All high (no press)
        for (var r = 0; r < 4; r++) {
            if (!(rows & (1 << r))) { // Row active (low)
                for (var c = 0; c < 4; c++) {
                    if (this.pressed[r * 4 + c]) {
                        cols &= ~(1 << c); // Pull column low
                    }
                }
            }
        }
        return cols;
    }

    pressKey(row, col) {
        this.pressed[row * 4 + col] = true;
        this.lastKey = this.keys[row][col];
    }

    releaseKey(row, col) {
        this.pressed[row * 4 + col] = false;
    }

    releaseAll() {
        this.pressed.fill(false);
        this.lastKey = '';
    }

    getState() {
        var active = [];
        for (var i = 0; i < 16; i++) {
            if (this.pressed[i]) active.push(this.keys[Math.floor(i/4)][i%4]);
        }
        return { pressed: active, lastKey: this.lastKey };
    }
}
