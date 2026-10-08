class VirtualBMP280 extends VirtualI2CDevice {
    /**
     * BMP280: temp + pressure sensor
     * Indirizzi: 0x76 (SDO=GND) o 0x77 (SDO=VCC)
     * Registri: 0xD0=chip_id(0x58), 0xF3=status, 0xF4=ctrl_meas, 0xF5=config
     *           0xF7-0xF9=press, 0xFA-0xFC=temp
     *           0x88-0x9F=calibration (26 bytes)
     */
    constructor(sdoHigh) {
        super('BMP280 P/T', sdoHigh ? 0x77 : 0x76);
        this.registers = new Uint8Array(256);
        this.regPointer = 0;
        this.pointerSet = false;

        // Chip ID
        this.registers[0xD0] = 0x58;

        // Default config: sleep mode
        this.registers[0xF4] = 0x00; // ctrl_meas: osrs_t=0, osrs_p=0, mode=sleep
        this.registers[0xF5] = 0x00; // config: t_sb=0, filter=off, spi3w=0

        // Calibration data (realistic values from a real BMP280)
        this._writeCalib16(0x88, 27504);   // dig_T1 (unsigned)
        this._writeCalib16s(0x8A, 26435);  // dig_T2 (signed)
        this._writeCalib16s(0x8C, -1000);  // dig_T3 (signed)
        this._writeCalib16(0x8E, 36477);   // dig_P1 (unsigned)
        this._writeCalib16s(0x90, -10685); // dig_P2
        this._writeCalib16s(0x92, 3024);   // dig_P3
        this._writeCalib16s(0x94, 2855);   // dig_P4
        this._writeCalib16s(0x96, 140);    // dig_P5
        this._writeCalib16s(0x98, -7);     // dig_P6
        this._writeCalib16s(0x9A, 15500);  // dig_P7
        this._writeCalib16s(0x9C, -14600); // dig_P8
        this._writeCalib16s(0x9E, 6000);   // dig_P9

        // Valori simulati
        this._temperature = 25.0;  // °C
        this._pressure = 1013.25;  // hPa
        this._updateRawValues();
    }

    _writeCalib16(addr, val) {
        this.registers[addr] = val & 0xFF;
        this.registers[addr + 1] = (val >> 8) & 0xFF;
    }

    _writeCalib16s(addr, val) {
        if (val < 0) val = 0x10000 + val;
        this._writeCalib16(addr, val);
    }

    /**
     * Imposta temperatura simulata.
     * @param {number} tempC - Temperatura in °C (-40 to 85)
     */
    setTemperature(tempC) {
        this._temperature = Math.max(-40, Math.min(85, tempC));
        this._updateRawValues();
    }

    /**
     * Imposta pressione simulata.
     * @param {number} pressHpa - Pressione in hPa (300 to 1100)
     */
    setPressure(pressHpa) {
        this._pressure = Math.max(300, Math.min(1100, pressHpa));
        this._updateRawValues();
    }

    /**
     * Calcola i valori raw ADC a partire da temperatura e pressione impostate.
     * Usa le formule inverse semplificate del BMP280.
     */
    _updateRawValues() {
        // Leggi calibrazione
        var dig_T1 = this.registers[0x88] | (this.registers[0x89] << 8);
        var dig_T2 = this._readSigned16(0x8A);
        var dig_T3 = this._readSigned16(0x8C);

        // Calcolo inverso approssimato per temperatura → raw ADC
        // t_fine approssimato
        var t_fine = Math.round(this._temperature * 5120);
        // raw_temp approssimato (inversione semplificata)
        var raw_temp = Math.round(((this._temperature + 40) / 85 + 0.5) * 524288);
        raw_temp = Math.max(0, Math.min(0xFFFFF, raw_temp));

        // Pressione → raw ADC approssimato
        var raw_press = Math.round(((this._pressure - 300) / 800) * 524288 + 100000);
        raw_press = Math.max(0, Math.min(0xFFFFF, raw_press));

        // Scrivi nei registri (20-bit, MSB first)
        this.registers[0xFA] = (raw_temp >> 12) & 0xFF;  // temp_msb
        this.registers[0xFB] = (raw_temp >> 4) & 0xFF;   // temp_lsb
        this.registers[0xFC] = (raw_temp << 4) & 0xF0;   // temp_xlsb

        this.registers[0xF7] = (raw_press >> 12) & 0xFF;  // press_msb
        this.registers[0xF8] = (raw_press >> 4) & 0xFF;   // press_lsb
        this.registers[0xF9] = (raw_press << 4) & 0xF0;   // press_xlsb

        // Status: not measuring, data ready
        this.registers[0xF3] = 0x00;
    }

    _readSigned16(addr) {
        var val = this.registers[addr] | (this.registers[addr + 1] << 8);
        return val > 32767 ? val - 65536 : val;
    }

    busStart() { this.pointerSet = false; }

    busWrite(value) {
        if (!this.pointerSet) {
            this.regPointer = value & 0xFF;
            this.pointerSet = true;
        } else {
            this.registers[this.regPointer] = value;
            // Se si scrive ctrl_meas con mode=forced, "misura" subito
            if (this.regPointer === 0xF4) {
                var mode = value & 0x03;
                if (mode === 1 || mode === 2) {
                    this.registers[0xF3] = 0x08; // measuring
                    this._updateRawValues();
                    this.registers[0xF3] = 0x00; // done
                    // In forced mode, torna a sleep
                    if (mode === 1 || mode === 2) this.registers[0xF4] = value & 0xFC;
                }
            }
            this.regPointer = (this.regPointer + 1) & 0xFF;
        }
        return true;
    }

    busRead() {
        var val = this.registers[this.regPointer];
        this.regPointer = (this.regPointer + 1) & 0xFF;
        return val;
    }

    getTemperature() { return this._temperature; }
    getPressure() { return this._pressure; }

    getState() {
        return {
            name: this.name, address: this.address,
            temperature: this._temperature.toFixed(1) + ' °C',
            pressure: this._pressure.toFixed(1) + ' hPa',
            chipId: '0x' + this.registers[0xD0].toString(16).toUpperCase(),
            mode: ['Sleep', 'Forced', 'Forced', 'Normal'][this.registers[0xF4] & 0x03]
        };
    }
}
