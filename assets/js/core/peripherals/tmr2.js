/**
 * PIC16 TMR2 Peripheral
 * Timer2: 8-bit timer con prescaler, period register (PR2) e postscaler.
 * 
 * Registri gestiti:
 *   TMR2   (default 0x11) - Timer register
 *   T2CON  (default 0x12) - Control register
 *     bit 0-1: T2CKPS - Prescaler (1:1, 1:4, 1:16)
 *     bit 2:   TMR2ON - Timer2 enable
 *     bit 3-6: TOUTPS - Postscaler (1:1 ... 1:16)
 *   PR2    (default 0x92) - Period register (bank 1)
 * 
 * Funzionamento:
 *   TMR2 incrementa con prescaler da Fosc/4.
 *   Quando TMR2 == PR2: resetta TMR2 a 0, incrementa postscaler.
 *   Quando postscaler raggiunge il valore: setta TMR2IF in PIR1.
 *   Usato come time base per CCP/PWM.
 * 
 * Uso:
 *   var tmr2 = new PIC16TMR2(cpu, specFromJSON);
 *   cpu.addPeripheral(tmr2);
 */

class PIC16TMR2 extends PIC16Peripheral {
    constructor(cpu, config) {
        super('TMR2', cpu);
        config = config || {};
        
        this.reg = parseInt(config.reg, 16) || 0x11;
        this.controlReg = parseInt(config.controlReg, 16) || 0x12;
        this.periodReg = parseInt(config.periodReg, 16) || 0x92;
        
        var irqFlag = config.interruptFlag || {};
        var irqEn = config.interruptEnable || {};
        this.pirAddr = this._resolveReg(irqFlag.reg, 0x0C);
        this.pirBit = irqFlag.bit !== undefined ? irqFlag.bit : 1;
        this.pieAddr = this._resolveReg(irqEn.reg, 0x8C);
        this.pieBit = irqEn.bit !== undefined ? irqEn.bit : 1;
        
        this.prescalerCount = 0;
        this.postscalerCount = 0;
    }

    getRegisters() {
        return [this.reg, this.controlReg, this.periodReg];
    }

    reset() {
        this.cpu.ram[this.reg] = 0x00;
        this.cpu.ram[this.controlReg] = 0x00;  // TMR2 off
        this.cpu.ram[this.periodReg] = 0xFF;    // PR2 default
        this.prescalerCount = 0;
        this.postscalerCount = 0;
    }

    read(addr) {
        return this.cpu.ram[addr];
    }

    write(addr, value) {
        value &= 0xFF;
        this.cpu.ram[addr] = value;
        
        if (addr === this.controlReg) {
            this.notifyRegisterChange('T2CON', value);
        } else if (addr === this.reg) {
            this.notifyRegisterChange('TMR2', value);
        }
    }

    // ================================================================
    //  TICK
    // ================================================================

    tick(cycles) {
        var t2con = this.cpu.ram[this.controlReg];
        
        // TMR2ON (bit 2) must be set
        if (!(t2con & 0x04)) return;
        
        // Prescaler: bits 0-1 → 1:1, 1:4, 1:16
        var psVal = t2con & 0x03;
        var prescaleRatio;
        if (psVal === 0) prescaleRatio = 1;
        else if (psVal === 1) prescaleRatio = 4;
        else prescaleRatio = 16;
        
        this.prescalerCount++;
        if (this.prescalerCount < prescaleRatio) return;
        this.prescalerCount = 0;
        
        // Incrementa TMR2
        this.cpu.ram[this.reg]++;
        
        // Confronta con PR2
        if (this.cpu.ram[this.reg] >= this.cpu.ram[this.periodReg]) {
            this.cpu.ram[this.reg] = 0;
            
            // Postscaler: bits 3-6 → 1:1 ... 1:16
            var postVal = (t2con >> 3) & 0x0F;
            var postRatio = postVal + 1;
            
            this.postscalerCount++;
            if (this.postscalerCount >= postRatio) {
                this.postscalerCount = 0;
                // Set TMR2IF
                this.cpu.ram[this.pirAddr] |= (1 << this.pirBit);
            }
        }
    }

    _resolveReg(name, defaultAddr) {
        var map = { 'PIR1': 0x0C, 'PIR2': 0x0D, 'PIE1': 0x8C, 'PIE2': 0x8D };
        return (name && map[name] !== undefined) ? map[name] : defaultAddr;
    }

    getState() {
        var t2con = this.cpu.ram[this.controlReg];
        var psVal = t2con & 0x03;
        return {
            value: this.cpu.ram[this.reg],
            period: this.cpu.ram[this.periodReg],
            enabled: !!(t2con & 0x04),
            prescaler: psVal === 0 ? 1 : (psVal === 1 ? 4 : 16),
            postscaler: ((t2con >> 3) & 0x0F) + 1,
            prescalerCount: this.prescalerCount,
            postscalerCount: this.postscalerCount,
            tmr2if: (this.cpu.ram[this.pirAddr] >> this.pirBit) & 0x01
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16TMR2;
}
