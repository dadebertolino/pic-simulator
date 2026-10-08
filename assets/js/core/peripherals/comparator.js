/**
 * PIC16 Comparator Peripheral
 * Doppio comparatore analogico con riferimento interno.
 * 
 * Registri gestiti:
 *   CMCON  (default 0x1F) - Comparator control
 *     bit 0-2: CM2:CM0 - Comparator mode (8 configurazioni)
 *     bit 3:   CIS     - Comparator input switch
 *     bit 4:   C1INV   - Comparator 1 output inversion
 *     bit 5:   C2INV   - Comparator 2 output inversion
 *     bit 6:   C1OUT   - Comparator 1 output (read-only)
 *     bit 7:   C2OUT   - Comparator 2 output (read-only)
 *   VRCON  (default 0x9D) - Voltage reference control
 *     bit 0-3: VR3:VR0 - Reference value (0-15)
 *     bit 5:   VRR     - Range select (0=high, 1=low)
 *     bit 6:   VROE    - Output enable on RA2
 *     bit 7:   VREN    - Reference enable
 * 
 * Modi (CM2:CM0):
 *   000: Comparators reset (off)
 *   001: Three inputs multiplexed to two comparators
 *   010: Four inputs multiplexed to two comparators
 *   011: Two common reference comparators
 *   100: Two independent comparators
 *   101: One independent comparator
 *   110: Two common reference comparators with outputs
 *   111: Comparators off, pins digital I/O
 * 
 * Uso:
 *   var comp = new PIC16Comparator(cpu, specFromJSON);
 *   cpu.addPeripheral(comp);
 *   comp.setInputVoltage(0, 2.5); // AN0 = 2.5V
 */

class PIC16Comparator extends PIC16Peripheral {
    constructor(cpu, config) {
        super('COMPARATOR', cpu);
        config = config || {};

        this.controlReg = parseInt(config.controlReg, 16) || 0x1F;
        this.vrefReg = parseInt(config.vrefReg, 16) || 0x9D;
        this.numModules = config.modules || 2;

        // Tensioni input analogici (0.0 - 5.0V, impostate dalla UI)
        // AN0=RA0, AN1=RA1, AN2=RA2, AN3=RA3
        this.inputVoltages = [0, 0, 0, 0];

        // Vdd di riferimento
        this.vdd = 5.0;

        // Output precedente per detect cambio (interrupt CMIF)
        this.prevOutput = 0;
    }

    getRegisters() {
        return [this.controlReg, this.vrefReg];
    }

    reset() {
        this.cpu.ram[this.controlReg] = 0x07; // CM=111, comparators off
        this.cpu.ram[this.vrefReg] = 0x00;
        this.prevOutput = 0;
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        if (addr === this.controlReg) {
            // C1OUT e C2OUT sono read-only, calcolati al volo
            var val = this.cpu.ram[this.controlReg] & 0x3F; // bits 0-5 writable
            var outputs = this._evaluate();
            val |= (outputs.c1out ? 0x40 : 0) | (outputs.c2out ? 0x80 : 0);
            return val;
        }
        return this.cpu.ram[addr];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        value &= 0xFF;

        if (addr === this.controlReg) {
            // Solo bits 0-5 scrivibili, 6-7 read-only
            this.cpu.ram[this.controlReg] = (this.cpu.ram[this.controlReg] & 0xC0) | (value & 0x3F);
            this.notifyRegisterChange('CMCON', this.cpu.ram[this.controlReg]);
        } else {
            this.cpu.ram[addr] = value;
            if (addr === this.vrefReg) {
                this.notifyRegisterChange('VRCON', value);
            }
        }
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        var cmcon = this.cpu.ram[this.controlReg];
        var mode = cmcon & 0x07;
        if (mode === 0x07 || mode === 0x00) return; // Off

        var outputs = this._evaluate();
        var currentOutput = (outputs.c1out ? 1 : 0) | (outputs.c2out ? 2 : 0);

        // Aggiorna bits output in CMCON
        this.cpu.ram[this.controlReg] = (cmcon & 0x3F) |
            (outputs.c1out ? 0x40 : 0) | (outputs.c2out ? 0x80 : 0);

        // Detect cambio output → CMIF (PIR1 bit 6 sul 628A = stessa posizione)
        if (currentOutput !== this.prevOutput) {
            // CMIF - per 628A e' in PIR1 ma il bit varia
            // Semplificato: set generico per ora
            this.prevOutput = currentOutput;
        }
    }

    // ================================================================
    //  EVALUATION
    // ================================================================

    _evaluate() {
        var cmcon = this.cpu.ram[this.controlReg];
        var mode = cmcon & 0x07;
        var cis = (cmcon >> 3) & 0x01;
        var c1inv = (cmcon >> 4) & 0x01;
        var c2inv = (cmcon >> 5) & 0x01;

        var vref = this._getVref();
        var v = this.inputVoltages; // [AN0, AN1, AN2, AN3]

        var c1out = false;
        var c2out = false;

        switch (mode) {
            case 0x01: // Three inputs muxed
                // C1: VIN- = RA0, VIN+ = RA3
                // C2: VIN- = RA1 (CIS=0) o RA2 (CIS=1), VIN+ = RA3
                c1out = v[0] < v[3];
                c2out = cis ? (v[2] < v[3]) : (v[1] < v[3]);
                break;

            case 0x02: // Four inputs muxed
                // C1: VIN- = RA0, VIN+ = Vref
                // C2: VIN- = RA1 (CIS=0) o RA2 (CIS=1), VIN+ = Vref
                c1out = v[0] < vref;
                c2out = cis ? (v[2] < vref) : (v[1] < vref);
                break;

            case 0x03: // Two common ref
                // C1: VIN- = RA0, VIN+ = Vref
                // C2: VIN- = RA1, VIN+ = Vref
                c1out = v[0] < vref;
                c2out = v[1] < vref;
                break;

            case 0x04: // Two independent
                // C1: VIN- = RA0, VIN+ = RA3
                // C2: VIN- = RA1, VIN+ = RA2
                c1out = v[0] < v[3];
                c2out = v[1] < v[2];
                break;

            case 0x05: // One independent
                // C1: off
                // C2: VIN- = RA1, VIN+ = RA2
                c2out = v[1] < v[2];
                break;

            case 0x06: // Two common ref with outputs
                // C1: VIN- = RA0, VIN+ = Vref, output on RA3
                // C2: VIN- = RA1, VIN+ = Vref, output on RA4
                c1out = v[0] < vref;
                c2out = v[1] < vref;
                break;
        }

        // Apply inversion
        if (c1inv) c1out = !c1out;
        if (c2inv) c2out = !c2out;

        return { c1out: c1out, c2out: c2out };
    }

    _getVref() {
        var vrcon = this.cpu.ram[this.vrefReg];
        var vren = (vrcon >> 7) & 0x01;
        if (!vren) return 0;

        var vr = vrcon & 0x0F;
        var vrr = (vrcon >> 5) & 0x01;

        if (vrr) {
            // Low range: Vref = VR/24 * Vdd
            return (vr / 24) * this.vdd;
        } else {
            // High range: Vref = Vdd/4 + VR/32 * Vdd
            return (this.vdd / 4) + (vr / 32) * this.vdd;
        }
    }

    // ================================================================
    //  API PER UI
    // ================================================================

    /**
     * Imposta la tensione di un input analogico.
     * @param {number} channel - 0-3 (AN0-AN3)
     * @param {number} voltage - 0.0 - 5.0 V
     */
    setInputVoltage(channel, voltage) {
        if (channel >= 0 && channel < 4) {
            this.inputVoltages[channel] = Math.max(0, Math.min(this.vdd, voltage));
        }
    }

    /**
     * @param {number} channel
     * @returns {number}
     */
    getInputVoltage(channel) {
        return (channel >= 0 && channel < 4) ? this.inputVoltages[channel] : 0;
    }

    /**
     * Imposta Vdd (per calcolo Vref).
     * @param {number} vdd
     */
    setVdd(vdd) {
        this.vdd = vdd;
    }

    getState() {
        var cmcon = this.cpu.ram[this.controlReg];
        var outputs = this._evaluate();
        return {
            mode: cmcon & 0x07,
            c1out: outputs.c1out,
            c2out: outputs.c2out,
            c1inv: (cmcon >> 4) & 0x01,
            c2inv: (cmcon >> 5) & 0x01,
            vref: this._getVref(),
            vrefEnabled: !!((this.cpu.ram[this.vrefReg] >> 7) & 0x01),
            inputs: this.inputVoltages.slice()
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16Comparator;
}
