/**
 * PIC16 TMR1 Peripheral
 * Timer1: 16-bit timer/counter con prescaler, oscillatore esterno e gate.
 * 
 * Registri gestiti:
 *   TMR1L  (default 0x0E) - Low byte
 *   TMR1H  (default 0x0F) - High byte
 *   T1CON  (default 0x10) - Control register
 *     bit 0: TMR1ON  - Timer1 enable
 *     bit 1: TMR1CS  - Clock source (0=internal Fosc/4, 1=external T1CKI)
 *     bit 2: T1SYNC  - External clock sync (0=sync, 1=no sync)
 *     bit 3: T1OSCEN - Oscillator enable
 *     bit 4-5: T1CKPS1:T1CKPS0 - Prescaler (1:1, 1:2, 1:4, 1:8)
 * 
 * Interrupt: overflow 0xFFFF->0x0000 setta TMR1IF in PIR1 (bit 0)
 * 
 * Uso:
 *   var tmr1 = new PIC16TMR1(cpu, specFromJSON);
 *   cpu.addPeripheral(tmr1);
 */

class PIC16TMR1 extends PIC16Peripheral {
    /**
     * @param {PIC16Core} cpu
     * @param {object} [config] - Spec dal JSON device (peripherals.TMR1)
     */
    constructor(cpu, config) {
        super('TMR1', cpu);
        config = config || {};
        
        // Indirizzi registri (default PIC16F877A/628A)
        this.regLow = parseInt(config.regLow, 16) || 0x0E;
        this.regHigh = parseInt(config.regHigh, 16) || 0x0F;
        this.controlReg = parseInt(config.controlReg, 16) || 0x10;
        
        // Indirizzi interrupt
        var irqFlag = config.interruptFlag || {};
        var irqEn = config.interruptEnable || {};
        this.pirAddr = this._resolveReg(irqFlag.reg, 0x0C);  // PIR1
        this.pirBit = irqFlag.bit !== undefined ? irqFlag.bit : 0;
        this.pieAddr = this._resolveReg(irqEn.reg, 0x8C);   // PIE1
        this.pieBit = irqEn.bit !== undefined ? irqEn.bit : 0;
        
        // Stato prescaler
        this.prescalerCount = 0;
    }

    getRegisters() {
        return [this.regLow, this.regHigh, this.controlReg];
    }

    reset() {
        this.cpu.ram[this.regLow] = 0x00;
        this.cpu.ram[this.regHigh] = 0x00;
        this.cpu.ram[this.controlReg] = 0x00;  // TMR1 off
        this.prescalerCount = 0;
    }

    // ================================================================
    //  READ / WRITE
    // ================================================================

    read(addr) {
        return this.cpu.ram[addr];
    }

    write(addr, value) {
        value &= 0xFF;
        
        if (addr === this.controlReg) {
            var oldVal = this.cpu.ram[this.controlReg];
            this.cpu.ram[this.controlReg] = value;
            
            // Se prescaler cambia, resetta contatore
            if ((oldVal & 0x30) !== (value & 0x30)) {
                this.prescalerCount = 0;
            }
            this.notifyRegisterChange('T1CON', value);
        } else {
            this.cpu.ram[addr] = value;
            var regName = (addr === this.regLow) ? 'TMR1L' : 'TMR1H';
            this.notifyRegisterChange(regName, value);
        }
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        var t1con = this.cpu.ram[this.controlReg];
        
        // TMR1ON must be set
        if (!(t1con & 0x01)) return;
        
        // Clock source
        var tmr1cs = (t1con >> 1) & 0x01;
        
        if (tmr1cs === 0) {
            // Internal clock (Fosc/4) - incrementa ogni ciclo CPU
            this._increment();
        }
        // External clock (T1CKI) gestito via externalClock()
    }

    /**
     * Clock esterno da pin T1CKI.
     */
    externalClock() {
        var t1con = this.cpu.ram[this.controlReg];
        if (!(t1con & 0x01)) return;  // TMR1ON
        if (!((t1con >> 1) & 0x01)) return; // TMR1CS must be 1
        this._increment();
    }

    // ================================================================
    //  CORE LOGIC
    // ================================================================

    _increment() {
        var t1con = this.cpu.ram[this.controlReg];
        var ps = (t1con >> 4) & 0x03;
        var ratio = 1 << ps; // 1, 2, 4, 8
        
        this.prescalerCount++;
        if (this.prescalerCount >= ratio) {
            this.prescalerCount = 0;
            this._doIncrement();
        }
    }

    _doIncrement() {
        // Incrementa contatore 16-bit
        var low = this.cpu.ram[this.regLow];
        var high = this.cpu.ram[this.regHigh];
        var value = (high << 8) | low;
        
        value++;
        
        if (value > 0xFFFF) {
            value = 0;
            // Set TMR1IF
            this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
        }
        
        this.cpu.ram[this.regLow] = value & 0xFF;
        this.cpu.ram[this.regHigh] = (value >> 8) & 0xFF;
    }

    // ================================================================
    //  UTILITY
    // ================================================================

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D, 'INTCON': 0x0B };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    /**
     * Legge il valore 16-bit corrente del timer.
     * @returns {number}
     */
    getValue16() {
        return (this.cpu.ram[this.regHigh] << 8) | this.cpu.ram[this.regLow];
    }

    getState() {
        var t1con = this.cpu.ram[this.controlReg];
        return {
            value: this.getValue16(),
            enabled: !!(t1con & 0x01),
            source: (t1con >> 1) & 0x01 ? 'external' : 'internal',
            prescaler: 1 << ((t1con >> 4) & 0x03),
            prescalerCount: this.prescalerCount,
            tmr1if: (this.cpu.ram[this.pirAddr] >> this.pirBit) & 0x01
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16TMR1;
}
