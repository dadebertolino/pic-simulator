/**
 * PIC16 GPIO Peripheral
 * Modulo I/O parametrico per porte A-E.
 * 
 * Gestisce: PORTx (data register), TRISx (direction register),
 * lettura input/output basata su TRIS, interrupt (RB0/INT, RB4-7 change),
 * segnale T0CKI su RA4.
 * 
 * Uso:
 *   var gpioA = new PIC16GPIO('A', cpu, { width: 5, dataAddr: 0x05, trisAddr: 0x85, bitmask: 0x1F });
 *   var gpioB = new PIC16GPIO('B', cpu, { width: 8, dataAddr: 0x06, trisAddr: 0x86, bitmask: 0xFF,
 *       intPin: 0, iocPins: [4,5,6,7] });
 *   cpu.addPeripheral(gpioA);
 *   cpu.addPeripheral(gpioB);
 */

class PIC16GPIO extends PIC16Peripheral {
    /**
     * @param {string} portLetter - Lettera porta: 'A', 'B', 'C', 'D', 'E'
     * @param {PIC16Core} cpu - Riferimento al core
     * @param {object} config
     * @param {number} config.width - Numero pin (3-8)
     * @param {number} config.dataAddr - Indirizzo PORTx (es. 0x05)
     * @param {number} config.trisAddr - Indirizzo TRISx (es. 0x85)
     * @param {number} config.bitmask - Maschera bit validi (es. 0x1F per 5-bit)
     * @param {number} [config.intPin] - Pin per interrupt esterno (es. 0 per RB0/INT)
     * @param {number[]} [config.iocPins] - Pin con interrupt-on-change (es. [4,5,6,7])
     * @param {boolean} [config.hasT0CKI] - true se un pin e' sorgente T0CKI (RA4)
     * @param {number} [config.t0ckiPin] - Numero pin T0CKI (default 4)
     */
    constructor(portLetter, cpu, config) {
        super('GPIO_' + portLetter, cpu);
        
        this.portLetter = portLetter;
        this.width = config.width;
        this.dataAddr = config.dataAddr;
        this.trisAddr = config.trisAddr;
        this.bitmask = config.bitmask;
        
        // Interrupt config
        this.intPin = config.intPin !== undefined ? config.intPin : -1;
        this.iocPins = config.iocPins || [];
        this.hasT0CKI = config.hasT0CKI || false;
        this.t0ckiPin = config.t0ckiPin !== undefined ? config.t0ckiPin : 4;
        
        // Stato esterno pin (simulazione input)
        this.externalValue = 0;
        this.prevExternalValue = 0;
        
        // T0CKI state
        this.t0ckiPrev = 0;
    }

    getRegisters() {
        return [this.dataAddr, this.trisAddr];
    }

    reset() {
        // TRIS = all inputs
        this.cpu.ram[this.trisAddr] = this.bitmask;
        // PORT = 0
        this.cpu.ram[this.dataAddr] = 0;
        // Preserva external (come hardware reale, i pin esterni non cambiano al reset)
        this.prevExternalValue = this.externalValue;
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        if (addr === this.dataAddr) {
            return this._readPort();
        }
        // TRISx: lettura diretta
        return this.cpu.ram[addr];
    }

    _readPort() {
        var tris = this.cpu.ram[this.trisAddr];
        var latch = this.cpu.ram[this.dataAddr];
        var result = 0;
        
        for (var i = 0; i < this.width; i++) {
            if (tris & (1 << i)) {
                // Input: leggi valore esterno
                result |= (this.externalValue & (1 << i));
            } else {
                // Output: leggi latch
                result |= (latch & (1 << i));
            }
        }
        return result & this.bitmask;
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        if (addr === this.dataAddr) {
            this.cpu.ram[this.dataAddr] = value & this.bitmask;
        } else if (addr === this.trisAddr) {
            this.cpu.ram[this.trisAddr] = value & this.bitmask;
        }
        
        this.notifyPortChange(this.portLetter, this.getOutput());
    }

    // ================================================================
    //  EXTERNAL INPUT (dalla UI: switch, pulsanti)
    // ================================================================

    /**
     * Imposta il valore di un pin esterno.
     * Chiamato dalla UI quando l'utente togla uno switch.
     * @param {number} pin - Numero pin (0-based)
     * @param {number} value - 0 o 1
     */
    setExternalPin(pin, value) {
        this.prevExternalValue = this.externalValue;
        
        if (value) {
            this.externalValue |= (1 << pin);
        } else {
            this.externalValue &= ~(1 << pin);
        }
        
        // T0CKI: clock esterno per TMR0
        if (this.hasT0CKI && pin === this.t0ckiPin) {
            this._handleT0CKI(value);
        }
        
        // RB0/INT: interrupt esterno
        if (pin === this.intPin) {
            this._handleINT(value);
        }
        
        // Interrupt-on-change (RB4-RB7)
        if (this.iocPins.length > 0) {
            this._handleIOC();
        }
    }

    /**
     * Restituisce lo stato output della porta per la UI.
     * @returns {{ data: number, tris: number, raw: number }}
     */
    getOutput() {
        var tris = this.cpu.ram[this.trisAddr];
        var data = this.cpu.ram[this.dataAddr];
        return { data: data & ~tris, tris: tris, raw: data };
    }

    /**
     * Restituisce il valore esterno corrente (per la UI).
     * @returns {number}
     */
    getExternalValue() {
        return this.externalValue;
    }

    // ================================================================
    //  INTERRUPT HANDLING
    // ================================================================

    _handleT0CKI(value) {
        var option = this.cpu.ram[0x81];
        var t0cs = (option >> 5) & 0x01;
        
        if (t0cs === 1) { // External clock mode
            var t0se = (option >> 4) & 0x01;
            var edge = t0se ? 
                (this.t0ckiPrev && !value) :  // falling edge
                (!this.t0ckiPrev && value);    // rising edge
            
            if (edge) {
                // Chiama TMR0 peripheral per clock esterno
                var tmr0 = this.cpu.getPeripheral('TMR0');
                if (tmr0) {
                    tmr0.externalClock();
                } else if (this.cpu.incrementTMR0) {
                    // Fallback built-in (backward compat)
                    this.cpu.incrementTMR0();
                }
            }
        }
        this.t0ckiPrev = value;
    }

    _handleINT(value) {
        var option = this.cpu.ram[0x81];
        var intedg = (option >> 6) & 0x01;
        var prevBit = (this.prevExternalValue >> this.intPin) & 0x01;
        var triggered = intedg ? 
            (!prevBit && value) :   // rising edge
            (prevBit && !value);    // falling edge
        
        if (triggered && (this.cpu.ram[0x0B] & 0x10)) { // INTE enabled
            this.cpu.ram[0x0B] |= 0x02; // Set INTF
        }
    }

    _handleIOC() {
        var oldIOC = 0, newIOC = 0;
        for (var i = 0; i < this.iocPins.length; i++) {
            var pin = this.iocPins[i];
            oldIOC |= ((this.prevExternalValue >> pin) & 0x01) << pin;
            newIOC |= ((this.externalValue >> pin) & 0x01) << pin;
        }
        
        if (oldIOC !== newIOC) {
            if (this.cpu.ram[0x0B] & 0x08) { // RBIE enabled
                this.cpu.ram[0x0B] |= 0x01; // Set RBIF
            }
        }
    }

    // ================================================================
    //  DEBUG
    // ================================================================

    getState() {
        return {
            port: this.portLetter,
            width: this.width,
            data: this.cpu.ram[this.dataAddr],
            tris: this.cpu.ram[this.trisAddr],
            external: this.externalValue,
            output: this.getOutput()
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16GPIO;
}
