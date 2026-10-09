/**
 * VirtualSSD1306 — 128x64 OLED Display (I²C)
 * Address: 0x3C (SA0=0) or 0x3D (SA0=1)
 *
 * I²C protocol: control byte + data
 * Control byte: 0x00 = command stream, 0x40 = data stream
 * 0x80 = single command, 0xC0 = single data
 *
 * Memory: 128x64 pixels = 1024 bytes (8 pages x 128 columns)
 * Page addressing: each byte = 8 vertical pixels in a column
 */
class VirtualSSD1306 extends VirtualI2CDevice {
    constructor(sa0) {
        super('SSD1306 OLED', sa0 ? 0x3D : 0x3C);
        this.width = 128;
        this.height = 64;
        this.pages = 8;
        // GDDRAM: 8 pages x 128 columns
        this.gddram = new Uint8Array(this.pages * this.width);

        // State
        this.displayOn = false;
        this.contrast = 0x7F;
        this.invertDisplay = false;
        this.startLine = 0;
        this.pageAddr = 0;
        this.colAddr = 0;
        this.colStart = 0;
        this.colEnd = 127;
        this.pageStart = 0;
        this.pageEnd = 7;
        this.addressMode = 0x02; // Page addressing (default)

        // I²C state
        this._controlByte = -1;
        this._isData = false;
        this._cmdBuffer = [];
        this._expectingArgs = 0;
        this._currentCmd = 0;

        // Command log
        this.cmdLog = [];
    }

    busStart() {
        this._controlByte = -1;
        this._isData = false;
    }

    busWrite(value) {
        if (this._controlByte === -1) {
            // First byte after address = control byte
            this._controlByte = value;
            this._isData = !!(value & 0x40);
            return true;
        }

        if (this._isData) {
            this._writeData(value);
        } else {
            this._processCommand(value);
        }
        return true;
    }

    busRead() { return 0x00; }

    _writeData(value) {
        var addr = this.pageAddr * this.width + this.colAddr;
        if (addr < this.gddram.length) {
            this.gddram[addr] = value;
        }
        // Advance address
        this.colAddr++;
        if (this.colAddr > this.colEnd) {
            this.colAddr = this.colStart;
            if (this.addressMode !== 0x02) {
                this.pageAddr++;
                if (this.pageAddr > this.pageEnd) {
                    this.pageAddr = this.pageStart;
                }
            }
        }
    }

    _processCommand(cmd) {
        if (this._expectingArgs > 0) {
            this._cmdBuffer.push(cmd);
            this._expectingArgs--;
            if (this._expectingArgs === 0) {
                this._executeCommand(this._currentCmd, this._cmdBuffer);
                this._cmdBuffer = [];
            }
            return;
        }

        // Single-byte commands
        if (cmd >= 0x00 && cmd <= 0x0F) { this.colAddr = (this.colAddr & 0xF0) | cmd; return; }
        if (cmd >= 0x10 && cmd <= 0x1F) { this.colAddr = (this.colAddr & 0x0F) | ((cmd & 0x0F) << 4); return; }
        if (cmd >= 0xB0 && cmd <= 0xB7) { this.pageAddr = cmd & 0x07; return; }
        if (cmd >= 0x40 && cmd <= 0x7F) { this.startLine = cmd & 0x3F; return; }

        switch (cmd) {
            case 0xAE: this.displayOn = false; this._log('Display OFF'); break;
            case 0xAF: this.displayOn = true; this._log('Display ON'); break;
            case 0xA4: this._log('Display from RAM'); break;
            case 0xA5: this._log('Display all ON'); break;
            case 0xA6: this.invertDisplay = false; this._log('Normal display'); break;
            case 0xA7: this.invertDisplay = true; this._log('Inverted display'); break;
            case 0xE3: break; // NOP

            // Multi-byte commands
            case 0x81: this._expectArgs(cmd, 1); break; // Set contrast
            case 0x20: this._expectArgs(cmd, 1); break; // Set addressing mode
            case 0x21: this._expectArgs(cmd, 2); break; // Set column address
            case 0x22: this._expectArgs(cmd, 2); break; // Set page address
            case 0xD5: this._expectArgs(cmd, 1); break; // Set clock
            case 0xD9: this._expectArgs(cmd, 1); break; // Set precharge
            case 0xDA: this._expectArgs(cmd, 1); break; // Set COM pins
            case 0xDB: this._expectArgs(cmd, 1); break; // Set VCOMH
            case 0x8D: this._expectArgs(cmd, 1); break; // Charge pump
            case 0xA8: this._expectArgs(cmd, 1); break; // Set multiplex
            case 0xD3: this._expectArgs(cmd, 1); break; // Set display offset
            default:
                this._log('Cmd 0x' + cmd.toString(16).toUpperCase());
        }
    }

    _expectArgs(cmd, count) {
        this._currentCmd = cmd;
        this._expectingArgs = count;
        this._cmdBuffer = [];
    }

    _executeCommand(cmd, args) {
        switch (cmd) {
            case 0x81: this.contrast = args[0]; this._log('Contrast: ' + args[0]); break;
            case 0x20:
                this.addressMode = args[0] & 0x03;
                this._log('Addr mode: ' + ['Horizontal', 'Vertical', 'Page'][this.addressMode]);
                break;
            case 0x21:
                this.colStart = args[0] & 0x7F;
                this.colEnd = args[1] & 0x7F;
                this.colAddr = this.colStart;
                break;
            case 0x22:
                this.pageStart = args[0] & 0x07;
                this.pageEnd = args[1] & 0x07;
                this.pageAddr = this.pageStart;
                break;
            case 0x8D: this._log('Charge pump: ' + (args[0] === 0x14 ? 'ON' : 'OFF')); break;
            default: this._log('Cmd 0x' + cmd.toString(16).toUpperCase() + ' [' + args.join(',') + ']');
        }
    }

    _log(msg) {
        this.cmdLog.push(msg);
        if (this.cmdLog.length > 20) this.cmdLog.shift();
    }

    clearDisplay() {
        this.gddram.fill(0);
    }

    /**
     * Ritorna pixel (x,y) come 0 o 1.
     */
    getPixel(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
        var page = Math.floor(y / 8);
        var bit = y % 8;
        var val = this.gddram[page * this.width + x];
        return (val >> bit) & 1;
    }

    getState() {
        return {
            name: this.name, address: this.address,
            displayOn: this.displayOn, contrast: this.contrast,
            inverted: this.invertDisplay, addressMode: this.addressMode
        };
    }
}
