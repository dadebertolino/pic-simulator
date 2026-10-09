/**
 * PIC16 ADC Peripheral
 * Convertitore Analogico-Digitale 10-bit, multi-canale.
 * 
 * Registri gestiti:
 *   ADRESH  (default 0x1E) - Result high byte
 *   ADCON0  (default 0x1F) - Control register 0
 *     bit 0:   ADON    - ADC enable
 *     bit 2:   GO/DONE - Conversion status (1=in progress, 0=done)
 *     bit 3-5: CHS2:0  - Channel select (0-7)
 *     bit 6-7: ADCS1:0 - Clock select
 *   ADRESL  (default 0x9E) - Result low byte (bank 1)
 *   ADCON1  (default 0x9F) - Control register 1 (bank 1)
 *     bit 0-3: PCFG3:0 - Port config (analog/digital/Vref)
 *     bit 7:   ADFM    - Result format (1=right justified, 0=left justified)
 * 
 * Conversione:
 *   BSF ADCON0,GO → attende ~12 TAD → risultato in ADRESH:ADRESL → ADIF set
 * 
 * Interfaccia UI:
 *   - setChannelValue(ch, value) : imposta tensione canale (0-1023)
 *   - getChannelValue(ch) : legge tensione canale
 * 
 * Uso:
 *   var adc = new PIC16ADC(cpu, specFromJSON);
 *   cpu.addPeripheral(adc);
 *   adc.setChannelValue(0, 512);  // AN0 = 50% di Vref
 */

class PIC16ADC extends PIC16Peripheral {
    constructor(cpu, config) {
        super('ADC', cpu);
        config = config || {};

        // Registri
        this.adresh = parseInt(config.resultRegHigh, 16) || 0x1E;
        this.adcon0 = parseInt(config.controlReg0, 16) || 0x1F;
        this.adresl = parseInt(config.resultRegLow, 16) || 0x9E;
        this.adcon1 = parseInt(config.controlReg1, 16) || 0x9F;

        // Config
        this.resolution = config.resolution || 10;
        this.numChannels = config.channels || 8;

        // Interrupt
        var irqFlag = config.interruptFlag || {};
        var irqEn = config.interruptEnable || {};
        this.pirAddr = this._resolveReg((irqFlag).reg, 0x0C);
        this.pirBit = irqFlag.bit !== undefined ? irqFlag.bit : 6;

        // Valori analogici dei canali (0-1023, impostati dalla UI)
        this.channelValues = new Array(this.numChannels);
        for (var i = 0; i < this.numChannels; i++) {
            this.channelValues[i] = 0;
        }

        // Stato conversione
        this.converting = false;
        this.conversionCycles = 0;
        this.conversionTarget = 12; // ~12 TAD semplificato
    }

    getRegisters() {
        return [this.adresh, this.adcon0, this.adresl, this.adcon1];
    }

    reset() {
        this.cpu.ram[this.adresh] = 0x00;
        this.cpu.ram[this.adcon0] = 0x00;  // ADC off
        this.cpu.ram[this.adresl] = 0x00;
        this.cpu.ram[this.adcon1] = 0x00;
        this.converting = false;
        this.conversionCycles = 0;
        // Non resettare channelValues (sono input esterni)
    }

    // ================================================================
    //  READ / WRITE
    // ================================================================

    read(addr) {
        if (addr === this.adcon0) {
            // GO/DONE riflette stato conversione
            var val = this.cpu.ram[this.adcon0];
            if (this.converting) val |= 0x04;
            else val &= ~0x04;
            return val;
        }
        return this.cpu.ram[addr];
    }

    write(addr, value) {
        value &= 0xFF;

        if (addr === this.adcon0) {
            var old = this.cpu.ram[this.adcon0];
            this.cpu.ram[this.adcon0] = value;

            // GO/DONE bit (bit 2): avvia conversione se ADON (bit 0)
            if ((value & 0x04) && (value & 0x01) && !this.converting) {
                this.converting = true;
                this.conversionCycles = 0;
                // Calcola TAD basato su clock select
                var adcs = (value >> 6) & 0x03;
                // FOSC/2=6, FOSC/8=12, FOSC/32=32, FRC=6 cicli per TAD
                var tadCycles = [6, 12, 32, 6];
                this.conversionTarget = tadCycles[adcs] * 12;
            }

            this.notifyRegisterChange('ADCON0', value);
            return;
        }

        this.cpu.ram[addr] = value;
        if (addr === this.adcon1) {
            this.notifyRegisterChange('ADCON1', value);
        }
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        if (!this.converting) return;

        this.conversionCycles++;
        if (this.conversionCycles >= this.conversionTarget) {
            this._completeConversion();
        }
    }

    _completeConversion() {
        this.converting = false;

        // Leggi canale selezionato
        var adcon0 = this.cpu.ram[this.adcon0];
        var channel = (adcon0 >> 3) & 0x07;
        var rawValue = 0;

        if (channel < this.numChannels) {
            rawValue = this.channelValues[channel] & 0x3FF; // 10-bit max
        }

        // Formato risultato: ADFM (ADCON1 bit 7)
        var adcon1 = this.cpu.ram[this.adcon1];
        var rightJustified = (adcon1 >> 7) & 0x01;

        if (rightJustified) {
            // Right justified: ADRESL = low 8 bit, ADRESH = high 2 bit
            this.cpu.ram[this.adresl] = rawValue & 0xFF;
            this.cpu.ram[this.adresh] = (rawValue >> 8) & 0x03;
        } else {
            // Left justified: ADRESH = high 8 bit, ADRESL = low 2 bit << 6
            this.cpu.ram[this.adresh] = (rawValue >> 2) & 0xFF;
            this.cpu.ram[this.adresl] = (rawValue & 0x03) << 6;
        }

        // Clear GO/DONE
        this.cpu.ram[this.adcon0] &= ~0x04;

        // Set ADIF
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);

        this.notifyRegisterChange('ADRESH', this.cpu.ram[this.adresh]);
    }

    // ================================================================
    //  API PER UI (slider / potenziometri virtuali)
    // ================================================================

    /**
     * Imposta il valore analogico di un canale (dalla UI).
     * @param {number} channel - Numero canale (0-7)
     * @param {number} value - Valore 0-1023 (10-bit)
     */
    setChannelValue(channel, value) {
        if (channel >= 0 && channel < this.numChannels) {
            this.channelValues[channel] = Math.max(0, Math.min(1023, Math.round(value)));
        }
    }

    /**
     * Legge il valore analogico di un canale.
     * @param {number} channel
     * @returns {number} 0-1023
     */
    getChannelValue(channel) {
        if (channel >= 0 && channel < this.numChannels) {
            return this.channelValues[channel];
        }
        return 0;
    }

    /**
     * Restituisce il numero di canali.
     * @returns {number}
     */
    getNumChannels() {
        return this.numChannels;
    }

    /**
     * Restituisce l'ultimo risultato di conversione (10-bit).
     * @returns {number}
     */
    getResult() {
        var adcon1 = this.cpu.ram[this.adcon1];
        if ((adcon1 >> 7) & 0x01) {
            // Right justified
            return ((this.cpu.ram[this.adresh] & 0x03) << 8) | this.cpu.ram[this.adresl];
        }
        // Left justified
        return (this.cpu.ram[this.adresh] << 2) | ((this.cpu.ram[this.adresl] >> 6) & 0x03);
    }

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    getState() {
        var adcon0 = this.cpu.ram[this.adcon0];
        return {
            enabled: !!(adcon0 & 0x01),
            converting: this.converting,
            channel: (adcon0 >> 3) & 0x07,
            result: this.getResult(),
            channelValues: this.channelValues.slice(),
            rightJustified: !!((this.cpu.ram[this.adcon1] >> 7) & 0x01),
            adif: (this.cpu.ram[this.pirAddr] >> this.pirBit) & 0x01
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16ADC;
}
