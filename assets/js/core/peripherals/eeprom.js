/**
 * PIC16 EEPROM Data Peripheral
 * EEPROM non-volatile con dimensione e indirizzi dei registri per device.
 *
 * Registri gestiti (indirizzi da DeviceLoader.memoryLayout):
 *   EEDATA, EEADR, EECON1, EECON2 (write-only, sequenza di sicurezza)
 *     16F84A: 0x08/0x09/0x88/0x89   16F628A: 0x9A/0x9B/0x9C/0x9D
 *     16F877A: 0x10C/0x10D/0x18C/0x18D
 *
 * Funzionamento:
 *   Lettura: WR EEADR, BSF EECON1,RD → dato in EEDATA
 *   Scrittura: WR EEADR, WR EEDATA, BSF EECON1,WREN,
 *              WR EECON2=0x55, WR EECON2=0xAA, BSF EECON1,WR
 *              → EEIF al completamento (EECON1.4 sul 16F84A, PIR1.7 sul
 *              628A, PIR2.4 sull'877A); l'interrupt lo decide il core.
 *
 * Uso:
 *   var eep = new PIC16EEPROM(cpu, { size: 64 });  // PIC16F84A
 *   var eep = new PIC16EEPROM(cpu, { size: 256, regs: layout.eeprom }); // PIC16F877A
 *   cpu.addPeripheral(eep);
 */

class PIC16EEPROM extends PIC16Peripheral {
    /**
     * @param {PIC16Core} cpu
     * @param {object} [config]
     * @param {number} [config.size=64] - Dimensione EEPROM in bytes
     * @param {object} [config.regs] - {data, addr, con1, con2, flag: {addr, bit}, enable: {addr, bit}}; default 16F84A
     * @param {number} [config.con1Mask=0x1F] - Bit implementati di EECON1
     */
    constructor(cpu, config) {
        super('EEPROM', cpu);
        config = config || {};
        this.size = config.size || 64;
        this.regs = config.regs || { data: 0x08, addr: 0x09, con1: 0x88, con2: 0x89, flag: { addr: 0x88, bit: 4 }, enable: { addr: 0x0B, bit: 6 } };
        this.con1Mask = config.con1Mask || 0x1F;

        // Data array (persistente tra reset, come hardware reale); un chip
        // appena programmato ha la EEPROM cancellata
        this.data = new Uint8Array(this.size);
        this.erase();

        // Sequenza scrittura sicurezza (EECON2)
        this.writeSequence = [];
    }

    getRegisters() {
        var r = this.regs;
        return [r.data, r.addr, r.con1, r.con2];
    }

    reset() {
        // EEPROM data NON viene azzerata al reset (non-volatile)
        this.writeSequence = [];
        this.cpu.ram[this.regs.data] = 0x00;
        this.cpu.ram[this.regs.addr] = 0x00;
        this.cpu.ram[this.regs.con1] = 0x00;
        // EECON2 non ha valore leggibile
    }

    /** EEPROM cancellata, come dopo la programmazione: ogni byte vale 0xFF. */
    erase() {
        this.data.fill(0xFF);
    }

    // ================================================================
    //  READ
    // ================================================================

    read(addr) {
        // EECON2 non e' un registro fisico: serve solo alla sequenza di sblocco
        if (addr === this.regs.con2) return 0x00;
        return this.cpu.ram[addr];
    }

    // ================================================================
    //  WRITE
    // ================================================================

    write(addr, value) {
        value &= 0xFF;

        if (addr === this.regs.con2) {
            this.writeSequence.push(value);
            if (this.writeSequence.length > 2) {
                this.writeSequence.shift();
            }
        } else if (addr === this.regs.con1) {
            this._writeControl(value);
        } else {
            // EEDATA, EEADR
            this.cpu.ram[addr] = value;
        }
    }

    _writeControl(value) {
        var r = this.regs;
        var oldVal = this.cpu.ram[r.con1];
        // RD e WR si possono solo accendere: li spegne l'hardware
        this.cpu.ram[r.con1] = (value & this.con1Mask) | (oldVal & 0x03);

        // RD bit (bit 0): avvia lettura EEPROM
        if ((value & 0x01) && !(oldVal & 0x01)) {
            var addr = this.cpu.ram[r.addr];
            if (addr < this.size) {
                this.cpu.ram[r.data] = this.data[addr];
            }
            // RD si auto-resetta
            this.cpu.ram[r.con1] &= ~0x01;
        }

        // WR bit (bit 1): avvia scrittura EEPROM
        if ((value & 0x02) && !(oldVal & 0x02)) {
            // Verifica: WREN (bit 2) set + sequenza 0x55, 0xAA
            if ((value & 0x04) &&
                this.writeSequence.length >= 2 &&
                this.writeSequence[0] === 0x55 &&
                this.writeSequence[1] === 0xAA) {

                var addr2 = this.cpu.ram[r.addr];
                if (addr2 < this.size) {
                    this.data[addr2] = this.cpu.ram[r.data];
                }

                // Scrittura completata (semplificato: istantaneo): EEIF.
                // Non si tocca INTCON: il bit 4 e' INTE, e se generare
                // l'interrupt lo decide PIC16Core.checkInterrupts().
                this.cpu.ram[r.flag.addr] |= (1 << r.flag.bit);
            }
            this.cpu.ram[r.con1] &= ~0x02;  // Clear WR
            this.writeSequence = [];
        }

        this.notifyRegisterChange('EECON1', this.cpu.ram[r.con1]);
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
            eedata: this.cpu.ram[this.regs.data],
            eeadr: this.cpu.ram[this.regs.addr],
            eecon1: this.cpu.ram[this.regs.con1],
            writeSequenceLen: this.writeSequence.length
        };
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16EEPROM;
}
