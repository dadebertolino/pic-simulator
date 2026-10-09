/**
 * VirtualDS18B20 — 1-Wire Digital Temperature Sensor
 * Family code: 0x28
 *
 * Commands:
 *   0x44 - Convert T (start temperature conversion)
 *   0xBE - Read Scratchpad (9 bytes)
 *   0x4E - Write Scratchpad (3 bytes: TH, TL, Config)
 *   0x48 - Copy Scratchpad → EEPROM
 *   0xB8 - Recall EEPROM → Scratchpad
 *   0xB4 - Read Power Supply (0=parasite, 1=external)
 *
 * Scratchpad (9 bytes):
 *   [0] Temp LSB
 *   [1] Temp MSB
 *   [2] TH register (alarm high)
 *   [3] TL register (alarm low)
 *   [4] Config register (resolution)
 *   [5] Reserved 0xFF
 *   [6] Reserved
 *   [7] Reserved 0x10
 *   [8] CRC
 *
 * Config register bits 6:5 = resolution:
 *   00 = 9-bit  (0.5°C,    93.75ms)
 *   01 = 10-bit (0.25°C,   187.5ms)
 *   10 = 11-bit (0.125°C,  375ms)
 *   11 = 12-bit (0.0625°C, 750ms)  ← default
 */
class VirtualDS18B20 extends VirtualOneWireDevice {
    constructor(serialHex) {
        super('DS18B20', 0x28, serialHex || '000000000001');

        this._temperature = 25.0;
        this._converting = false;
        this._convertCycles = 0;

        // Scratchpad
        this.scratchpad = new Uint8Array(9);
        this.scratchpad[2] = 0x4B;  // TH = 75°C default
        this.scratchpad[3] = 0x00;  // TL = 0°C default
        this.scratchpad[4] = 0x7F;  // Config: 12-bit resolution
        this.scratchpad[5] = 0xFF;  // Reserved
        this.scratchpad[6] = 0x00;  // Reserved
        this.scratchpad[7] = 0x10;  // Reserved (DS18B20 identifier)

        // EEPROM backup
        this._eepromTH = this.scratchpad[2];
        this._eepromTL = this.scratchpad[3];
        this._eepromConfig = this.scratchpad[4];

        // State for multi-byte write
        this._writeCmd = 0;
        this._writeBuffer = [];

        this._updateTempRegisters();
    }

    /**
     * Imposta temperatura simulata.
     * @param {number} celsius - Da -55 a +125
     */
    setTemperature(celsius) {
        this._temperature = Math.max(-55, Math.min(125, celsius));
        if (!this._converting) this._updateTempRegisters();
    }

    getTemperature() { return this._temperature; }

    /**
     * Calcola i registri temperatura dal valore °C.
     * Formato: 16-bit signed, risoluzione dipende da config.
     * Bit 15-11 = sign extension, bit 10-4 = integer, bit 3-0 = fraction
     */
    _updateTempRegisters() {
        var resolution = (this.scratchpad[4] >> 5) & 0x03;
        var step;
        switch (resolution) {
            case 0: step = 0.5;    break;  // 9-bit
            case 1: step = 0.25;   break;  // 10-bit
            case 2: step = 0.125;  break;  // 11-bit
            default: step = 0.0625; break; // 12-bit
        }

        var raw = Math.round(this._temperature / step) * step;
        var rawInt = Math.round(raw / 0.0625);

        // 16-bit two's complement
        if (rawInt < 0) rawInt = 0x10000 + rawInt;
        rawInt &= 0xFFFF;

        // Mask unused bits based on resolution
        switch (resolution) {
            case 0: rawInt &= 0xFFF8; break; // 9-bit: bits 2-0 undefined
            case 1: rawInt &= 0xFFFC; break; // 10-bit: bits 1-0 undefined
            case 2: rawInt &= 0xFFFE; break; // 11-bit: bit 0 undefined
        }

        this.scratchpad[0] = rawInt & 0xFF;        // LSB
        this.scratchpad[1] = (rawInt >> 8) & 0xFF;  // MSB
        this._updateCRC();
    }

    /**
     * Calcola CRC-8 Dallas dello scratchpad (byte 0-7 → byte 8).
     */
    _updateCRC() {
        this.scratchpad[8] = this._crc8(Array.from(this.scratchpad.subarray(0, 8)));
    }

    onReset() {
        this._writeCmd = 0;
        this._writeBuffer = [];
    }

    /**
     * Comando device ricevuto.
     * @param {number} cmd
     * @returns {number[]|null} Byte di risposta
     */
    onCommand(cmd) {
        switch (cmd) {
            case 0x44: // CONVERT T
                this._converting = true;
                this._convertCycles = 0;
                // Conversione "istantanea" nel simulatore
                this._updateTempRegisters();
                this._converting = false;
                return null;

            case 0xBE: // READ SCRATCHPAD
                return Array.from(this.scratchpad);

            case 0x4E: // WRITE SCRATCHPAD (expects 3 bytes: TH, TL, Config)
                this._writeCmd = 0x4E;
                this._writeBuffer = [];
                return null;

            case 0x48: // COPY SCRATCHPAD → EEPROM
                this._eepromTH = this.scratchpad[2];
                this._eepromTL = this.scratchpad[3];
                this._eepromConfig = this.scratchpad[4];
                return null;

            case 0xB8: // RECALL EEPROM → SCRATCHPAD
                this.scratchpad[2] = this._eepromTH;
                this.scratchpad[3] = this._eepromTL;
                this.scratchpad[4] = this._eepromConfig;
                this._updateCRC();
                return null;

            case 0xB4: // READ POWER SUPPLY
                return [0x01]; // External power (not parasite)

            default:
                // Potrebbe essere un byte dati per WRITE SCRATCHPAD
                if (this._writeCmd === 0x4E) {
                    this._writeBuffer.push(cmd);
                    if (this._writeBuffer.length >= 3) {
                        this.scratchpad[2] = this._writeBuffer[0]; // TH
                        this.scratchpad[3] = this._writeBuffer[1]; // TL
                        this.scratchpad[4] = this._writeBuffer[2]; // Config
                        this._updateCRC();
                        this._writeCmd = 0;
                    }
                }
                return null;
        }
    }

    /**
     * Ritorna risoluzione attuale come stringa.
     */
    getResolution() {
        var r = (this.scratchpad[4] >> 5) & 0x03;
        return [9, 10, 11, 12][r];
    }

    getState() {
        return {
            name: this.name,
            rom: this.romCode,
            temperature: this._temperature,
            resolution: this.getResolution(),
            scratchpad: Array.from(this.scratchpad),
            th: this.scratchpad[2],
            tl: this.scratchpad[3],
            converting: this._converting
        };
    }
}
