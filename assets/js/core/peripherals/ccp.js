/**
 * PIC16 CCP Peripheral (Capture/Compare/PWM)
 * 
 * Registri gestiti:
 *   CCPRxL (low byte), CCPRxH (high byte), CCPxCON (control)
 * 
 * CCPxCON bits 0-3 (CCPxM):
 *   0000: Off
 *   0100: Capture every falling edge
 *   0101: Capture every rising edge
 *   0110: Capture every 4th rising edge
 *   0111: Capture every 16th rising edge
 *   1000: Compare, set output on match
 *   1001: Compare, clear output on match
 *   1010: Compare, generate interrupt only
 *   1011: Compare, trigger special event (reset TMR1)
 *   11xx: PWM mode (duty cycle in CCPRxL:CCPxCON<5:4>)
 * 
 * Uso:
 *   var ccp1 = new PIC16CCP('CCP1', cpu, specFromJSON);
 *   cpu.addPeripheral(ccp1);
 */

class PIC16CCP extends PIC16Peripheral {
    /**
     * @param {string} name - 'CCP1' o 'CCP2'
     * @param {PIC16Core} cpu
     * @param {object} [config] - Spec dal JSON device
     */
    constructor(name, cpu, config) {
        super(name, cpu);
        config = config || {};
        
        this.regLow = parseInt(config.regLow, 16) || 0x15;
        this.regHigh = parseInt(config.regHigh, 16) || 0x16;
        this.controlReg = parseInt(config.controlReg, 16) || 0x17;
        
        var irqFlag = config.interruptFlag || {};
        var irqEn = config.interruptEnable || {};
        this.pirAddr = this._resolveReg(irqFlag.reg, 0x0C);
        this.pirBit = irqFlag.bit !== undefined ? irqFlag.bit : 2;
        this.pieAddr = this._resolveReg(irqEn.reg, 0x8C);
        this.pieBit = irqEn.bit !== undefined ? irqEn.bit : 2;
        
        // Capture counter per 4th/16th rising edge
        this.captureCount = 0;
        
        // Pin state per capture edge detection
        this.prevPinState = 0;
        
        // PWM duty cycle cache
        this.pwmDuty = 0;
    }

    getRegisters() {
        return [this.regLow, this.regHigh, this.controlReg];
    }

    reset() {
        this.cpu.ram[this.regLow] = 0x00;
        this.cpu.ram[this.regHigh] = 0x00;
        this.cpu.ram[this.controlReg] = 0x00; // CCP off
        this.captureCount = 0;
        this.prevPinState = 0;
        this.pwmDuty = 0;
    }

    read(addr) {
        return this.cpu.ram[addr];
    }

    write(addr, value) {
        value &= 0xFF;
        this.cpu.ram[addr] = value;
        
        if (addr === this.controlReg) {
            // Calcola duty cycle PWM quando si scrive CCPxCON
            this._updatePWMDuty();
            this.notifyRegisterChange(this.name + 'CON', value);
        }
    }

    // ================================================================
    //  TICK (chiamato ogni ciclo CPU)
    // ================================================================

    tick(cycles) {
        var mode = this.cpu.ram[this.controlReg] & 0x0F;
        
        if (mode === 0) return; // Off

        // Compare mode (1000-1011): confronta con TMR1
        if (mode >= 0x08 && mode <= 0x0B) {
            this._tickCompare(mode);
        }
        
        // PWM mode (11xx): output basato su TMR2
        // Il duty cycle e' gia' calcolato, l'output e' continuo
        // (la UI potra' leggere getPWMDuty per visualizzare)
    }

    // ================================================================
    //  CAPTURE (chiamato esternamente quando il pin CCP cambia)
    // ================================================================

    /**
     * Segnala un cambio del pin di input per capture mode.
     * @param {number} value - 0 o 1
     */
    captureEdge(value) {
        var mode = this.cpu.ram[this.controlReg] & 0x0F;
        if (mode < 0x04 || mode > 0x07) return; // Non in capture mode
        
        var falling = this.prevPinState && !value;
        var rising = !this.prevPinState && value;
        this.prevPinState = value;
        
        var triggered = false;
        
        switch (mode) {
            case 0x04: // Every falling edge
                triggered = falling;
                break;
            case 0x05: // Every rising edge
                triggered = rising;
                break;
            case 0x06: // Every 4th rising edge
                if (rising) {
                    this.captureCount++;
                    if (this.captureCount >= 4) {
                        this.captureCount = 0;
                        triggered = true;
                    }
                }
                break;
            case 0x07: // Every 16th rising edge
                if (rising) {
                    this.captureCount++;
                    if (this.captureCount >= 16) {
                        this.captureCount = 0;
                        triggered = true;
                    }
                }
                break;
        }
        
        if (triggered) {
            // Cattura TMR1 value
            var tmr1 = this.cpu.getPeripheral('TMR1');
            if (tmr1) {
                var val16 = tmr1.getValue16();
                this.cpu.ram[this.regLow] = val16 & 0xFF;
                this.cpu.ram[this.regHigh] = (val16 >> 8) & 0xFF;
            }
            // Set interrupt flag
            this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
        }
    }

    // ================================================================
    //  COMPARE
    // ================================================================

    _tickCompare(mode) {
        var tmr1 = this.cpu.getPeripheral('TMR1');
        if (!tmr1) return;
        
        var tmr1Val = tmr1.getValue16();
        var ccpVal = (this.cpu.ram[this.regHigh] << 8) | this.cpu.ram[this.regLow];
        
        if (tmr1Val !== ccpVal) return;
        
        // Match!
        this.cpu.ram[this.pirAddr] |= (1 << this.pirBit); // Set CCPxIF
        
        switch (mode) {
            case 0x08: // Set output pin high
                // (pin output gestito dalla UI)
                break;
            case 0x09: // Clear output pin low
                break;
            case 0x0A: // Interrupt only (flag gia' settato)
                break;
            case 0x0B: // Special event trigger: reset TMR1
                this.cpu.ram[tmr1.regLow] = 0;
                this.cpu.ram[tmr1.regHigh] = 0;
                break;
        }
    }

    // ================================================================
    //  PWM
    // ================================================================

    _updatePWMDuty() {
        var con = this.cpu.ram[this.controlReg];
        var mode = con & 0x0F;
        
        if (mode >= 0x0C) { // PWM mode
            // 10-bit duty: CCPRxL (8 high bits) + CCPxCON<5:4> (2 low bits)
            var highBits = this.cpu.ram[this.regLow];
            var lowBits = (con >> 4) & 0x03;
            this.pwmDuty = (highBits << 2) | lowBits;
        }
    }

    /**
     * Restituisce il duty cycle PWM corrente (0-1023, 10-bit).
     * @returns {number}
     */
    getPWMDuty() {
        return this.pwmDuty;
    }

    /**
     * Restituisce il duty cycle come percentuale (0-100).
     * @returns {number}
     */
    getPWMPercent() {
        // PR2 determina il periodo
        var tmr2 = this.cpu.getPeripheral('TMR2');
        if (!tmr2) return 0;
        var pr2 = this.cpu.ram[tmr2.periodReg];
        var period = (pr2 + 1) * 4; // 10-bit period
        if (period === 0) return 0;
        return Math.min(100, Math.round(this.pwmDuty / period * 100));
    }

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    getState() {
        var mode = this.cpu.ram[this.controlReg] & 0x0F;
        var modeStr = 'off';
        if (mode >= 0x04 && mode <= 0x07) modeStr = 'capture';
        else if (mode >= 0x08 && mode <= 0x0B) modeStr = 'compare';
        else if (mode >= 0x0C) modeStr = 'pwm';
        
        return {
            mode: modeStr,
            modeRaw: mode,
            ccprValue: (this.cpu.ram[this.regHigh] << 8) | this.cpu.ram[this.regLow],
            pwmDuty: this.pwmDuty,
            pwmPercent: this.getPWMPercent(),
            captureCount: this.captureCount
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16CCP;
}
