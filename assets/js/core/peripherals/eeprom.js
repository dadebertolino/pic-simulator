/**
 * PIC16 EEPROM Data Peripheral
 * EEPROM non-volatile con dimensione parametrica.
 * 
 * Registri gestiti:
 *   0x08 - EEDATA (data register)
 *   0x09 - EEADR  (address register)
 *   0x88 - EECON1 (control register 1)
 *   0x89 - EECON2 (control register 2 - write-only, sequenza sicurezza)
 * 
 * Funzionamento:
 *   Lettura: WR EEADR, BSF EECON1,RD → dato in EEDATA
 *   Scrittura: WR EEADR, WR EEDATA, BSF EECON1,WREN,
 *              WR EECON2=0x55, WR EECON2=0xAA, BSF EECON1,WR
 *              → EEIF al completamento, genera interrupt se EEIE=1
 * 
 * Uso:
 *   var eep = new PIC16EEPROM(cpu, { size: 64 });  // PIC16F84A
 *   var eep = new PIC16EEPROM(cpu, { size: 128 }); // PIC16F628A
 *   var eep = new PIC16EEPROM(cpu, { size: 256 }); // PIC16F877A
 *   cpu.addPeripheral(eep);
 */

class PIC16EEPROM extends PIC16Peripheral {
    /**
     * @param {PIC16Core} cpu
     * @param {object} [config]
     * @param {number} [config.size=64] - Dimensione EEPROM in bytes
     */
    constructor(cpu, config) {
        super('EEPROM', cpu);
        config = config || {};
        this.size = config.size || 64;
        
        // Data array (persistente tra reset, come hardware reale)
        this.data = new Uint8Array(this.size);
        
        // Sequenza scrittura sicurezza (EECON2)
        this.writeSequence = [];
    }

    getRegisters() {
        return [0x08, 0x09, 0x88, 0x89];
    }

    reset() {
        // EEPROM data NON viene azzerata al reset (non-volatile)
        this.writeSequence = [];
        this.cpu.ram[0x08] = 0x00;  // EEDATA
        this.cpu.ram[0x09] = 0x00;  // EEADR
        this.cpu.ram[0x88] = 0x00;  // EECON1
        // EECON2 non ha valore leggibile
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        // Tutti i registri si leggono direttamente dalla RAM
        // (EECON2 a 0x89 non e' leggibile, ritorna 0)
        if (addr === 0x89) return 0x00;
        return this.cpu.ram[addr];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        value &= 0xFF;

        switch (addr) {
            case 0x08: // EEDATA
                this.cpu.ram[0x08] = value;
                break;

            case 0x09: // EEADR
                this.cpu.ram[0x09] = value;
                break;

            case 0x89: // EECON2 (sequenza sicurezza)
                this.writeSequence.push(value);
                if (this.writeSequence.length > 2) {
                    this.writeSequence.shift();
                }
                break;

            case 0x88: // EECON1 (control)
                this._writeControl(value);
                break;
        }
    }

    _writeControl(value) {
        var oldVal = this.cpu.ram[0x88];
        this.cpu.ram[0x88] = value & 0x1F;

        // RD bit (bit 0): avvia lettura EEPROM
        if ((value & 0x01) && !(oldVal & 0x01)) {
            var addr = this.cpu.ram[0x09];
            if (addr < this.size) {
                this.cpu.ram[0x08] = this.data[addr];
            }
            // RD si auto-resetta
            this.cpu.ram[0x88] &= ~0x01;
        }

        // WR bit (bit 1): avvia scrittura EEPROM
        if ((value & 0x02) && !(oldVal & 0x02)) {
            // Verifica: WREN (bit 2) set + sequenza 0x55, 0xAA
            if ((value & 0x04) &&
                this.writeSequence.length >= 2 &&
                this.writeSequence[0] === 0x55 &&
                this.writeSequence[1] === 0xAA) {

                var addr2 = this.cpu.ram[0x09];
                if (addr2 < this.size) {
                    this.data[addr2] = this.cpu.ram[0x08];
                }

                // Scrittura completata (semplificato: istantaneo)
                this.cpu.ram[0x88] |= 0x10;   // Set EEIF (bit 4)
                this.cpu.ram[0x88] &= ~0x02;  // Clear WR

                // Trigger interrupt se EEIE abilitato (INTCON bit 6)
                if (this.cpu.ram[0x0B] & 0x40) {
                    this.cpu.ram[0x0B] |= 0x10; // Set interrupt flag
                }
            }
            this.writeSequence = [];
        }

        this.notifyRegisterChange('EECON1', this.cpu.ram[0x88]);
    }

    // ================================================================
    //  ACCESSO DIRETTO (per UI, simulator, debug)
    // ================================================================

    /**
     * Legge un byte dalla EEPROM.
     * @param {number} addr
     * @returns {number}
     */
    readByte(addr) {
        if (addr < this.size) return this.data[addr];
        return 0;
    }

    /**
     * Scrive un byte nella EEPROM (bypass sicurezza, per debug/init).
     * @param {number} addr
     * @param {number} value
     */
    writeByte(addr, value) {
        if (addr < this.size) {
            this.data[addr] = value & 0xFF;
        }
    }

    /**
     * Restituisce l'intero contenuto EEPROM come array.
     * @returns {number[]}
     */
    getData() {
        return Array.from(this.data);
    }

    /**
     * Restituisce la dimensione EEPROM.
     * @returns {number}
     */
    getSize() {
        return this.size;
    }

    // ================================================================
    //  DEBUG
    // ================================================================

    getState() {
        return {
            size: this.size,
            eedata: this.cpu.ram[0x08],
            eeadr: this.cpu.ram[0x09],
            eecon1: this.cpu.ram[0x88],
            writeSequenceLen: this.writeSequence.length
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16EEPROM;
}
