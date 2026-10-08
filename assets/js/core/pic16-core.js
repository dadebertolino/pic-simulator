/**
 * PIC16 CPU Simulator Core
 * Core generico per famiglia PIC16 mid-range (35 istruzioni, 14-bit)
 * 
 * Supporta periferiche pluggabili tramite PIC16PeripheralRegistry:
 * - Le periferiche si registrano con i loro indirizzi SFR
 * - readRAM/writeRAM delega alle periferiche per i loro indirizzi
 * - step() chiama tick() su tutte le periferiche ogni ciclo
 * 
 * Periferiche estratte: GPIO, TMR0, EEPROM
 * Restano nel core: Interrupt dispatcher, WDT (parziale)
 */

class PIC16Core {
    /**
     * @param {object} [config] - Configurazione opzionale
     * @param {number} [config.programSize=1024] - Dimensione flash (words)
     * @param {number} [config.ramSize=256] - Dimensione RAM (bytes)
     * @param {number} [config.eepromSize=64] - Dimensione EEPROM (bytes)
     * @param {number} [config.stackDepth=8] - Profondita' stack
     */
    constructor(config) {
        config = config || {};
        this.config = {
            programSize: config.programSize || 1024,
            ramSize: config.ramSize || 256,
            eepromSize: config.eepromSize || 64,
            stackDepth: config.stackDepth || 8,
            banks: config.banks || 2
        };

        // Memoria
        this.programMemory = new Uint16Array(this.config.programSize);
        this.ram = new Uint8Array(this.config.ramSize);
        this.eeprom = new Uint8Array(this.config.eepromSize);
        this.stack = new Uint16Array(this.config.stackDepth);
        this.breakpoints = new Set();

        // Peripheral registry
        this.peripherals = new PIC16PeripheralRegistry();

        // Callbacks UI
        this.onPortChange = null;
        this.onRegisterChange = null;
        this.onMemoryChange = null;
        this.onBreakpoint = null;
        this.onStep = null;
        this.onStackOverflow = null;  // callback(depth, type='overflow'|'underflow')

        this.reset();
    }

    // ================================================================
    //  RESET
    // ================================================================

    reset() {
        this.ram.fill(0);
        this.stack.fill(0);
        this.stackPointer = 0;
        this.stackUsed = 0;
        this.stackOverflow = false;
        this.stackUnderflow = false;
        this.W = 0;
        this.PC = 0;
        this.cycles = 0;
        this.running = false;
        this.sleeping = false;

        // Built-in peripherals state
        this.wdtCounter = 0;
        this.wdtEnabled = true;

        this.initRegisters();
        this.peripherals.resetAll();
    }

    initRegisters() {
        this.ram[0x03] = 0x18;  // STATUS: TO=1, PD=1
        // OPTION_REG: settato dalla periferica TMR0 nel suo reset()
        // TRISA/TRISB: settati dalle periferiche GPIO nel loro reset()
    }

    // ================================================================
    //  PERIPHERAL REGISTRATION
    // ================================================================

    addPeripheral(peripheral) {
        this.peripherals.register(peripheral);
    }

    getPeripheral(name) {
        return this.peripherals.get(name);
    }

    // ================================================================
    //  MEMORY ACCESS (con hook periferiche)
    // ================================================================

    /**
     * Calcola l'indirizzo RAM effettivo considerando il bank select.
     * 
     * PIC16 mid-range memory map:
     *   Bank 0: 0x000-0x07F   Bank 1: 0x080-0x0FF
     *   Bank 2: 0x100-0x17F   Bank 3: 0x180-0x1FF
     * 
     * Registri mirrored (accessibili da qualsiasi bank):
     *   0x00 INDF, 0x02 PCL, 0x03 STATUS, 0x04 FSR,
     *   0x0A PCLATH, 0x0B INTCON
     * 
     * GPR 0x70-0x7F mirrored in tutti i bank (per device 4-bank)
     * 
     * @param {number} addr - Indirizzo 7-bit dall'istruzione (0x00-0x7F)
     * @returns {number} Indirizzo effettivo nella RAM array
     */
    getEffectiveAddress(addr) {
        // Registri mirrored: stessi in tutti i bank
        if (addr === 0x00 || addr === 0x02 || addr === 0x03 ||
            addr === 0x04 || addr === 0x0A || addr === 0x0B) {
            return addr;
        }

        // Bank select: RP1:RP0 da STATUS (bits 6:5)
        var status = this.ram[0x03];
        var bank = (status >> 5) & 0x03; // 0-3

        // Per device 2-bank: ignora RP1 (backward compat)
        if (this.config.banks <= 2) {
            bank = bank & 0x01;
        }

        // GPR mirrored 0x70-0x7F (solo device 4-bank)
        if (this.config.banks >= 4 && addr >= 0x70 && addr <= 0x7F) {
            return addr; // Sempre bank 0
        }

        // Indirizzo effettivo = bank_offset + addr
        return (bank * 0x80) + addr;
    }

    readRAM(addr) {
        var effAddr = this.getEffectiveAddress(addr & 0x7F);

        // INDF: indirect addressing via FSR + IRP
        if (effAddr === 0x00) {
            var fsr = this.ram[0x04];
            var irp = (this.ram[0x03] >> 7) & 0x01;
            var indAddr = fsr | (irp << 8);
            if (indAddr >= this.ram.length) indAddr &= (this.ram.length - 1);
            return this.ram[indAddr];
        }

        // PCL
        if (effAddr === 0x02) {
            return this.PC & 0xFF;
        }

        // === HOOK PERIFERICHE PLUGGABILI ===
        var handler = this.peripherals.getHandler(effAddr);
        if (handler) {
            return handler.read(effAddr);
        }

        // Default: lettura diretta RAM
        return this.ram[effAddr];
    }

    writeRAM(addr, value) {
        var effAddr = this.getEffectiveAddress(addr & 0x7F);
        value &= 0xFF;

        // INDF: indirect addressing via FSR + IRP
        if (effAddr === 0x00) {
            var fsr = this.ram[0x04];
            var irp = (this.ram[0x03] >> 7) & 0x01;
            var indAddr = fsr | (irp << 8);
            if (indAddr >= this.ram.length) indAddr &= (this.ram.length - 1);
            this.ram[indAddr] = value;
            this.notifyMemoryChange(indAddr, value);
            return;
        }

        // PCL: mirrored, sempre addr 0x02
        if (effAddr === 0x02) {
            this.PC = (this.ram[0x0A] << 8) | value;
            this.ram[0x02] = value;
            this.notifyRegisterChange('PCL', value);
            return;
        }

        // STATUS: bit 3,4 (PD,TO) non scrivibili — mirrored, sempre addr 0x03
        if (effAddr === 0x03) {
            this.ram[0x03] = (this.ram[0x03] & 0x18) | (value & 0xE7);
            this.notifyRegisterChange('STATUS', this.ram[0x03]);
            return;
        }

        // === HOOK PERIFERICHE PLUGGABILI ===
        var handler = this.peripherals.getHandler(effAddr);
        if (handler) {
            handler.write(effAddr, value);
            return;
        }

        // Default
        this.ram[effAddr] = value;
        this.notifyMemoryChange(effAddr, value);
    }

    // ================================================================
    //  PORT I/O - Proxy verso periferiche GPIO registrate
    // ================================================================

    /**
     * Restituisce lo stato output di una porta.
     * Delega alla periferica GPIO_x se registrata, altrimenti fallback diretto RAM.
     * @param {string} port - 'A', 'B', 'C', 'D', 'E'
     * @returns {{ data: number, tris: number, raw: number }}
     */
    getPortOutput(port) {
        var gpio = this.peripherals.get('GPIO_' + port);
        if (gpio) return gpio.getOutput();
        var trisAddr = port === 'A' ? 0x85 : 0x86;
        var dataAddr = port === 'A' ? 0x05 : 0x06;
        return { data: this.ram[dataAddr] & ~this.ram[trisAddr], tris: this.ram[trisAddr], raw: this.ram[dataAddr] };
    }

    /**
     * Imposta un pin esterno. Proxy verso la periferica GPIO.
     * @param {string} port - 'A', 'B', etc.
     * @param {number} pin - Numero pin
     * @param {number} value - 0 o 1
     */
    setExternalInput(port, pin, value) {
        var gpio = this.peripherals.get('GPIO_' + port);
        if (gpio) gpio.setExternalPin(pin, value);
    }

    /**
     * Restituisce il valore esterno di una porta (per la UI).
     * @param {string} port - 'A', 'B', etc.
     * @returns {number}
     */
    getExternalValue(port) {
        var gpio = this.peripherals.get('GPIO_' + port);
        return gpio ? gpio.getExternalValue() : 0;
    }

    /**
     * Accesso EEPROM per UI/simulator. Proxy verso periferica EEPROM.
     * Mantiene backward compat con this.eeprom[addr].
     * @param {number} addr
     * @returns {number}
     */
    readEEPROM(addr) {
        var eep = this.peripherals.get('EEPROM');
        return eep ? eep.readByte(addr) : 0;
    }

    /**
     * Restituisce intero array EEPROM per UI.
     * @returns {number[]}
     */
    getEEPROMData() {
        var eep = this.peripherals.get('EEPROM');
        return eep ? eep.getData() : Array.from(this.eeprom);
    }

    /**
     * Dimensione EEPROM.
     * @returns {number}
     */
    getEEPROMSize() {
        var eep = this.peripherals.get('EEPROM');
        return eep ? eep.getSize() : this.config.eepromSize;
    }

    // ================================================================
    //  INTERRUPT HANDLING
    // ================================================================

    checkInterrupts() {
        var intcon = this.ram[0x0B];
        if (!(intcon & 0x80)) return false;
        if ((intcon & 0x04) && (intcon & 0x20)) return true;
        if ((intcon & 0x02) && (intcon & 0x10)) return true;
        if ((intcon & 0x01) && (intcon & 0x08)) return true;
        if ((this.ram[0x88] & 0x10) && (intcon & 0x40)) return true;
        return false;
    }

    handleInterrupt() {
        this.pushStack(this.PC);
        this.ram[0x0B] &= ~0x80;
        this.PC = 0x0004;
        this.sleeping = false;
    }

    // ================================================================
    //  STACK
    // ================================================================

    pushStack(value) {
        // Overflow detection: se lo stack è pieno, segnala
        if (this.stackUsed >= this.config.stackDepth) {
            this.stackOverflow = true;
            if (this.onStackOverflow) this.onStackOverflow(this.stackUsed, 'overflow');
        }
        this.stack[this.stackPointer] = value & 0x1FFF;
        this.stackPointer = (this.stackPointer + 1) % this.config.stackDepth;
        if (this.stackUsed < this.config.stackDepth) this.stackUsed++;
    }

    popStack() {
        // Underflow detection: se lo stack è vuoto, segnala
        if (this.stackUsed <= 0) {
            this.stackUnderflow = true;
            if (this.onStackOverflow) this.onStackOverflow(0, 'underflow');
        }
        this.stackPointer = (this.stackPointer - 1 + this.config.stackDepth) % this.config.stackDepth;
        if (this.stackUsed > 0) this.stackUsed--;
        return this.stack[this.stackPointer];
    }

    // ================================================================
    //  STATUS FLAGS
    // ================================================================

    setZ(value) {
        if (value === 0) this.ram[0x03] |= 0x04;
        else this.ram[0x03] &= ~0x04;
    }
    setC(value) {
        if (value) this.ram[0x03] |= 0x01;
        else this.ram[0x03] &= ~0x01;
    }
    setDC(value) {
        if (value) this.ram[0x03] |= 0x02;
        else this.ram[0x03] &= ~0x02;
    }
    getC() { return (this.ram[0x03] >> 0) & 0x01; }
    getZ() { return (this.ram[0x03] >> 2) & 0x01; }

    // ================================================================
    //  INSTRUCTION EXECUTION
    // ================================================================

    step() {
        if (this.sleeping) {
            this.cycles++;
            this.peripherals.tickAll(1);
            if (this.checkInterrupts()) this.handleInterrupt();
            return;
        }

        if (this.checkInterrupts()) {
            this.handleInterrupt();
            return;
        }

        var opcode = this.programMemory[this.PC & (this.config.programSize - 1)];
        this.PC = (this.PC + 1) & 0x1FFF;

        this.execute(opcode);
        this.peripherals.tickAll(1);
        this.cycles++;

        if (this.onStep) this.onStep(this.PC, opcode);
    }

    execute(opcode) {
        if (opcode === 0x0008) { this.RETURN(); return; }
        if (opcode === 0x0009) { this.RETFIE(); return; }
        if (opcode === 0x0064) { this.CLRWDT(); return; }
        if (opcode === 0x0063) { this.SLEEP(); return; }
        if ((opcode & 0x3FFF) === 0x0000) { this.NOP(); return; }

        // Bit-oriented: 01 bbbb fffffff
        if ((opcode >> 12) === 0x01) {
            var bit = (opcode >> 7) & 0x07, f = opcode & 0x7F;
            switch ((opcode >> 10) & 0x03) {
                case 0: this.BCF(f, bit); return;
                case 1: this.BSF(f, bit); return;
                case 2: this.BTFSC(f, bit); return;
                case 3: this.BTFSS(f, bit); return;
            }
        }

        if ((opcode >> 11) === 0x04) { this.CALL(opcode & 0x7FF); return; }
        if ((opcode >> 11) === 0x05) { this.GOTO(opcode & 0x7FF); return; }
        if ((opcode >> 10) === 0x30 >> 2) { this.MOVLW(opcode & 0xFF); return; }
        if ((opcode >> 10) === 0x34 >> 2) { this.RETLW(opcode & 0xFF); return; }

        // Literal ops: 111xxx kkkkkkkk
        if ((opcode >> 11) === 0x07) {
            var k = opcode & 0xFF;
            switch ((opcode >> 8) & 0x07) {
                case 0: this.IORLW(k); return;
                case 1: this.ANDLW(k); return;
                case 2: this.XORLW(k); return;
                case 4: case 5: this.SUBLW(k); return;
                case 6: case 7: this.ADDLW(k); return;
            }
        }

        // Byte-oriented: 00 xxxx dffffff
        if ((opcode >> 12) === 0x00) {
            var fb = opcode & 0x7F, d = (opcode >> 7) & 0x01;
            switch ((opcode >> 8) & 0x0F) {
                case 0x00: if (d) this.MOVWF(fb); else this.NOP(); return;
                case 0x01: if (d) this.CLRF(fb); else this.CLRW(); return;
                case 0x02: this.SUBWF(fb, d); return;
                case 0x03: this.DECF(fb, d); return;
                case 0x04: this.IORWF(fb, d); return;
                case 0x05: this.ANDWF(fb, d); return;
                case 0x06: this.XORWF(fb, d); return;
                case 0x07: this.ADDWF(fb, d); return;
                case 0x08: this.MOVF(fb, d); return;
                case 0x09: this.COMF(fb, d); return;
                case 0x0A: this.INCF(fb, d); return;
                case 0x0B: this.DECFSZ(fb, d); return;
                case 0x0C: this.RRF(fb, d); return;
                case 0x0D: this.RLF(fb, d); return;
                case 0x0E: this.SWAPF(fb, d); return;
                case 0x0F: this.INCFSZ(fb, d); return;
            }
        }

        this.NOP();
    }

    // ================================================================
    //  INSTRUCTION IMPLEMENTATIONS
    // ================================================================

    ADDWF(f, d) {
        var val = this.readRAM(f), result = this.W + val;
        this.setC(result > 255);
        this.setDC(((this.W & 0x0F) + (val & 0x0F)) > 0x0F);
        this.setZ((result & 0xFF) === 0);
        if (d) this.writeRAM(f, result & 0xFF); else this.W = result & 0xFF;
    }
    ANDWF(f, d) {
        var result = this.W & this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    CLRF(f) { this.writeRAM(f, 0); this.setZ(true); }
    CLRW() { this.W = 0; this.setZ(true); }
    COMF(f, d) {
        var result = (~this.readRAM(f)) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    DECF(f, d) {
        var result = (this.readRAM(f) - 1) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    DECFSZ(f, d) {
        var result = (this.readRAM(f) - 1) & 0xFF;
        if (d) this.writeRAM(f, result); else this.W = result;
        if (result === 0) { this.PC = (this.PC + 1) & 0x1FFF; this.cycles++; }
    }
    INCF(f, d) {
        var result = (this.readRAM(f) + 1) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    INCFSZ(f, d) {
        var result = (this.readRAM(f) + 1) & 0xFF;
        if (d) this.writeRAM(f, result); else this.W = result;
        if (result === 0) { this.PC = (this.PC + 1) & 0x1FFF; this.cycles++; }
    }
    IORWF(f, d) {
        var result = this.W | this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    MOVF(f, d) {
        var result = this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    MOVWF(f) { this.writeRAM(f, this.W); }
    NOP() {}
    RLF(f, d) {
        var val = this.readRAM(f), c = this.getC();
        var result = ((val << 1) | c) & 0xFF;
        this.setC((val >> 7) & 0x01);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    RRF(f, d) {
        var val = this.readRAM(f), c = this.getC();
        var result = ((val >> 1) | (c << 7)) & 0xFF;
        this.setC(val & 0x01);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    SUBWF(f, d) {
        var val = this.readRAM(f), result = val - this.W;
        this.setC(result >= 0);
        this.setDC((val & 0x0F) >= (this.W & 0x0F));
        this.setZ((result & 0xFF) === 0);
        if (d) this.writeRAM(f, result & 0xFF); else this.W = result & 0xFF;
    }
    SWAPF(f, d) {
        var val = this.readRAM(f);
        var result = ((val & 0x0F) << 4) | ((val >> 4) & 0x0F);
        if (d) this.writeRAM(f, result); else this.W = result;
    }
    XORWF(f, d) {
        var result = this.W ^ this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result); else this.W = result;
    }

    // Bit-oriented
    BCF(f, b) { this.writeRAM(f, this.readRAM(f) & ~(1 << b)); }
    BSF(f, b) { this.writeRAM(f, this.readRAM(f) | (1 << b)); }
    BTFSC(f, b) {
        if (!((this.readRAM(f) >> b) & 0x01)) { this.PC = (this.PC + 1) & 0x1FFF; this.cycles++; }
    }
    BTFSS(f, b) {
        if ((this.readRAM(f) >> b) & 0x01) { this.PC = (this.PC + 1) & 0x1FFF; this.cycles++; }
    }

    // Literal
    ADDLW(k) {
        var result = this.W + k;
        this.setC(result > 255);
        this.setDC(((this.W & 0x0F) + (k & 0x0F)) > 0x0F);
        this.setZ((result & 0xFF) === 0);
        this.W = result & 0xFF;
    }
    ANDLW(k) { this.W &= k; this.setZ(this.W === 0); }
    IORLW(k) { this.W |= k; this.setZ(this.W === 0); }
    MOVLW(k) { this.W = k & 0xFF; }
    SUBLW(k) {
        var result = k - this.W;
        this.setC(result >= 0);
        this.setDC((k & 0x0F) >= (this.W & 0x0F));
        this.setZ((result & 0xFF) === 0);
        this.W = result & 0xFF;
    }
    XORLW(k) { this.W ^= k; this.setZ(this.W === 0); }

    // Control
    CALL(k) { this.pushStack(this.PC); this.PC = ((this.ram[0x0A] & 0x18) << 8) | k; this.cycles++; }
    GOTO(k) { this.PC = ((this.ram[0x0A] & 0x18) << 8) | k; this.cycles++; }
    RETLW(k) { this.W = k; this.PC = this.popStack(); this.cycles++; }
    RETURN() { this.PC = this.popStack(); this.cycles++; }
    RETFIE() { this.PC = this.popStack(); this.ram[0x0B] |= 0x80; this.cycles++; }
    CLRWDT() {
        this.wdtCounter = 0;
        var tmr0 = this.peripherals.get('TMR0');
        if (tmr0) tmr0.prescalerCount = 0;
        this.ram[0x03] |= 0x18;
    }
    SLEEP() { this.sleeping = true; this.wdtCounter = 0; this.ram[0x03] &= ~0x08; this.ram[0x03] |= 0x10; }

    // ================================================================
    //  CALLBACKS
    // ================================================================

    notifyPortChange(port, value) { if (this.onPortChange) this.onPortChange(port, value); }
    notifyRegisterChange(name, value) { if (this.onRegisterChange) this.onRegisterChange(name, value); }
    notifyMemoryChange(addr, value) { if (this.onMemoryChange) this.onMemoryChange(addr, value); }

    // ================================================================
    //  PROGRAM LOADING & DEBUG
    // ================================================================

    loadProgram(words) {
        this.programMemory.fill(0);
        for (var i = 0; i < words.length && i < this.config.programSize; i++) {
            this.programMemory[i] = words[i] & 0x3FFF;
        }
    }

    getState() {
        return {
            W: this.W, PC: this.PC,
            STATUS: this.ram[0x03], FSR: this.ram[0x04],
            PCLATH: this.ram[0x0A], INTCON: this.ram[0x0B],
            TMR0: this.ram[0x01], PORTA: this.ram[0x05], PORTB: this.ram[0x06],
            TRISA: this.ram[0x85], TRISB: this.ram[0x86], OPTION: this.ram[0x81],
            EEDATA: this.ram[0x08], EEADR: this.ram[0x09], EECON1: this.ram[0x88],
            cycles: this.cycles,
            stack: Array.from(this.stack), stackPointer: this.stackPointer,
            stackUsed: this.stackUsed, stackOverflow: this.stackOverflow, stackUnderflow: this.stackUnderflow,
            sleeping: this.sleeping,
            peripherals: this.peripherals.list()
        };
    }

    setBreakpoint(addr) { this.breakpoints.add(addr); }
    clearBreakpoint(addr) { this.breakpoints.delete(addr); }
    toggleBreakpoint(addr) {
        if (this.breakpoints.has(addr)) this.breakpoints.delete(addr);
        else this.breakpoints.add(addr);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16Core;
}
