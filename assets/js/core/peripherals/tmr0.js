/**
 * PIC16 TMR0 Peripheral
 * Timer0: 8-bit timer/counter con prescaler programmabile.
 * 
 * Registri gestiti:
 *   0x01 - TMR0 (Timer0 register, bank 0)
 *   0x81 - OPTION_REG (bank 1) - bit PS2:PS0, PSA, T0SE, T0CS
 * 
 * Funzionamento:
 *   - Sorgente clock interna (T0CS=0): un passo per ciclo istruzione
 *     (due per GOTO, CALL e skip); fermo durante SLEEP
 *   - Dopo una scrittura di TMR0 il conteggio resta fermo per 2 cicli
 *   - Sorgente clock esterna (T0CS=1): incrementa via T0CKI (gestito da GPIO)
 *   - Prescaler (PSA=0): divide il clock per 2/4/8/.../256
 *   - Overflow 0xFF->0x00: setta T0IF (INTCON bit 2)
 * 
 * Uso:
 *   var tmr0 = new PIC16TMR0(cpu);
 *   cpu.addPeripheral(tmr0);
 *   // Per clock esterno (T0CKI): tmr0.externalClock(value)
 */

class PIC16TMR0 extends PIC16Peripheral {
    constructor(cpu) {
        super('TMR0', cpu);
        this.prescalerCount = 0;
        this.inhibit = 0; // cicli in cui TMR0 resta fermo dopo una scrittura
    }

    getRegisters() {
        // TMR0 a 0x01 e OPTION_REG a 0x81
        return [0x01, 0x81];
    }

    reset() {
        this.prescalerCount = 0;
        this.inhibit = 0;
        this.cpu.ram[0x01] = 0x00;      // TMR0 = 0
        this.cpu.ram[0x81] = 0xFF;      // OPTION_REG default
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        // Lettura diretta dalla RAM per entrambi
        return this.cpu.ram[addr];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        if (addr === 0x01) {
            // Scrivere TMR0 azzera il prescaler e blocca il conteggio
            // per i due cicli successivi
            this.cpu.ram[0x01] = value & 0xFF;
            this.prescalerCount = 0;
            this.inhibit = 2;
            this.notifyRegisterChange('TMR0', value);
        } else if (addr === 0x81) {
            // OPTION_REG
            this.cpu.ram[0x81] = value & 0xFF;
            this.notifyRegisterChange('OPTION', value);
        }
    }

    // ================================================================
    //  TICK (chiamato ogni ciclo CPU)
    // ================================================================

    tick(cycles) {
        var option = this.cpu.ram[0x81];
        var t0cs = (option >> 5) & 0x01;
        
        // Solo sorgente interna (T0CS=0) incrementa nel tick
        // La sorgente esterna (T0CS=1) e' gestita via externalClock()
        if (t0cs !== 0) return;

        for (var i = 0; i < cycles; i++) {
            if (this.inhibit > 0) {
                this.inhibit--;
            } else {
                this._increment();
            }
        }
    }

    // ================================================================
    //  EXTERNAL CLOCK (chiamato da GPIO quando T0CKI cambia)
    // ================================================================

    /**
     * Clock esterno da pin T0CKI.
     * Chiamato dal GPIO di RA4 quando rileva un fronte.
     * Il GPIO verifica gia' T0CS e T0SE prima di chiamare.
     */
    externalClock() {
        this._increment();
    }

    // ================================================================
    //  CORE LOGIC
    // ================================================================

    _increment() {
        var option = this.cpu.ram[0x81];
        var psa = (option >> 3) & 0x01;
        
        if (psa === 0) {
            // Prescaler assegnato a TMR0
            var ps = option & 0x07;
            var ratio = 1 << (ps + 1); // 2, 4, 8, 16, 32, 64, 128, 256
            this.prescalerCount++;
            if (this.prescalerCount >= ratio) {
                this.prescalerCount = 0;
                this._doIncrement();
            }
        } else {
            // Prescaler assegnato a WDT, TMR0 incrementa 1:1
            this._doIncrement();
        }
    }

    _doIncrement() {
        // ram e' una Uint8Array: 0xFF + 1 avvolge gia' a 0x00, quindi
        // l'overflow si riconosce dal valore risultante, non da un > 255.
        this.cpu.ram[0x01] = (this.cpu.ram[0x01] + 1) & 0xFF;
        if (this.cpu.ram[0x01] === 0) {
            // Overflow FF -> 00: set T0IF (INTCON bit 2)
            this.cpu.ram[0x0B] |= 0x04;
        }
        this.notifyRegisterChange('TMR0', this.cpu.ram[0x01]);
    }

    // ================================================================
    //  DEBUG
    // ================================================================

    getState() {
        var option = this.cpu.ram[0x81];
        return {
            value: this.cpu.ram[0x01],
            prescalerCount: this.prescalerCount,
            prescalerRatio: ((option >> 3) & 0x01) === 0 ? (1 << ((option & 0x07) + 1)) : 1,
            source: ((option >> 5) & 0x01) === 0 ? 'internal' : 'external',
            t0if: (this.cpu.ram[0x0B] >> 2) & 0x01
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16TMR0;
}
