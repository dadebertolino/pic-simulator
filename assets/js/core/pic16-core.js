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
     * @param {number} [config.banks=2] - Banchi di RAM (2 o 4)
     * @param {object} [config.gprMirror] - GPR del banco 1 specchio del banco 0 ({start, end}, 16F84A)
     * @param {boolean} [config.common] - Area comune 0x70-0x7F in tutti i banchi
     * @param {Array} [config.pir] - Coppie {flag, enable} dei registri PIR/PIE
     * @param {object} [config.eeInterrupt] - Senza PIR: {flag, enable} di EEIF/EEIE ({addr, bit})
     */
    constructor(config) {
        config = config || {};
        this.config = {
            programSize: config.programSize || 1024,
            ramSize: config.ramSize || 256,
            eepromSize: config.eepromSize || 64,
            stackDepth: config.stackDepth || 8,
            banks: config.banks || 2,
            gprMirror: config.gprMirror || null,
            common: !!config.common,
            pir: config.pir || [],
            eeInterrupt: config.eeInterrupt || null
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

        this.buildAddressMap();
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
        this.skipIrqOnce = false; // dopo il risveglio esegue un'istruzione prima del vettore

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
     * Costruisce la tabella indirizzo fisico -> registro che lo implementa.
     *
     * PIC16 mid-range: banco 0 = 0x000-0x07F, 1 = 0x080-0x0FF,
     * 2 = 0x100-0x17F, 3 = 0x180-0x1FF. Alcune celle esistono una volta
     * sola e compaiono in piu' banchi:
     *   - INDF, PCL, STATUS, FSR, PCLATH, INTCON in tutti i banchi;
     *   - 16F84A: GPR del banco 1 (0x8C-0xCF) = banco 0 (0x0C-0x4F);
     *   - device a 4 banchi: area comune 0x70-0x7F; TMR0 e PORTB ripetuti
     *     nel banco 2 (0x101, 0x106), OPTION_REG e TRISB nel 3 (0x181, 0x186).
     * -1 = locazione non implementata: si legge 0 e le scritture si perdono.
     * Vale sia per l'indirizzamento diretto sia per quello tramite FSR.
     */
    buildAddressMap() {
        var size = this.config.banks * 0x80;
        var mirror = this.config.gprMirror;
        var map = new Int16Array(size);

        for (var full = 0; full < size; full++) {
            var low = full & 0x7F;
            var bank = full >> 7;
            var reg = full;

            if (low === 0x00 || low === 0x02 || low === 0x03 ||
                low === 0x04 || low === 0x0A || low === 0x0B) {
                reg = low;
            } else if (mirror && low >= mirror.start) {
                reg = low <= mirror.end ? low : -1;
            } else if (mirror && low === 0x07) {
                reg = -1;
            } else if (this.config.common && low >= 0x70) {
                reg = low;
            } else if (bank >= 2 && (low === 0x01 || low === 0x06)) {
                reg = (bank === 3 ? 0x80 : 0) | low;
            }
            map[full] = reg < this.ram.length ? reg : -1;
        }
        this.addressMap = map;
    }

    /** Indirizzo fisico di un operando a 7 bit: RP1:RP0 scelgono il banco. */
    directAddress(addr) {
        var bank = (this.ram[0x03] >> 5) & 0x03;
        if (this.config.banks <= 2) bank &= 0x01;
        return (bank << 7) | (addr & 0x7F);
    }

    /** Registro che implementa un indirizzo fisico (-1 se non implementato). */
    mapAddress(full) {
        return this.addressMap[full & (this.addressMap.length - 1)];
    }

    /**
     * Indirizzo effettivo per un operando a 7 bit con i banchi correnti.
     * @param {number} addr - Indirizzo 7-bit dall'istruzione (0x00-0x7F)
     * @returns {number} Indice nella RAM (-1 se non implementato)
     */
    getEffectiveAddress(addr) {
        return this.mapAddress(this.directAddress(addr));
    }

    /** Indirizzo fisico puntato da INDF: IRP:FSR. */
    indirectAddress() {
        return ((this.ram[0x03] & 0x80) << 1) | this.ram[0x04];
    }

    readRAM(addr) {
        return this.readFile(this.directAddress(addr));
    }

    writeRAM(addr, value) {
        this.writeFile(this.directAddress(addr), value);
    }

    /** Lettura di un indirizzo fisico, con la logica delle SFR e delle periferiche. */
    readFile(full) {
        var reg = this.mapAddress(full);

        if (reg < 0) return 0;

        // INDF: la cella puntata da FSR, che passa dalla stessa logica
        // (PORTB letto via FSR restituisce i pin). FSR che punta a INDF legge 0.
        if (reg === 0x00) {
            var target = this.indirectAddress();
            return this.mapAddress(target) === 0x00 ? 0 : this.readFile(target);
        }

        if (reg === 0x02) {
            return this.PC & 0xFF;
        }

        // === HOOK PERIFERICHE PLUGGABILI ===
        var handler = this.peripherals.getHandler(reg);
        if (handler) {
            return handler.read(reg);
        }

        return this.ram[reg];
    }

    /** Scrittura di un indirizzo fisico, con la logica delle SFR e delle periferiche. */
    writeFile(full, value) {
        var reg = this.mapAddress(full);
        value &= 0xFF;

        if (reg < 0) return;

        // INDF: scrive nella cella puntata da FSR, periferiche comprese
        if (reg === 0x00) {
            var target = this.indirectAddress();
            if (this.mapAddress(target) !== 0x00) this.writeFile(target, value);
            return;
        }

        // PCL: il PC prende PCLATH<4:0> come parte alta
        if (reg === 0x02) {
            this.PC = ((this.ram[0x0A] & 0x1F) << 8) | value;
            this.ram[0x02] = value;
            this.notifyRegisterChange('PCL', value);
            return;
        }

        // STATUS: bit 3,4 (PD,TO) non scrivibili
        if (reg === 0x03) {
            this.ram[0x03] = (this.ram[0x03] & 0x18) | (value & 0xE7);
            this.notifyRegisterChange('STATUS', this.ram[0x03]);
            return;
        }

        // === HOOK PERIFERICHE PLUGGABILI ===
        var handler = this.peripherals.getHandler(reg);
        if (handler) {
            handler.write(reg, value);
            return;
        }

        this.ram[reg] = value;
        this.notifyMemoryChange(reg, value);
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
    /** EEPROM cancellata, come dopo la programmazione: ogni byte vale 0xFF. */
    eraseEeprom() {
        var eep = this.peripherals.get('EEPROM');
        if (eep) eep.erase();
    }

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

    /**
     * Sorgenti con flag e abilitazione accesi, senza guardare GIE. Le
     * periferiche (PIR & PIE) contano solo con PEIE; sul 16F84A, che non ha
     * PIR, INTCON.6 e' EEIE e abilita direttamente EEIF (in EECON1).
     * @param {boolean} [withTimer0=true] - false per il risveglio da SLEEP
     */
    pendingInterrupt(withTimer0) {
        var intcon = this.ram[0x0B];
        if (withTimer0 !== false && (intcon & 0x04) && (intcon & 0x20)) return true;
        if ((intcon & 0x02) && (intcon & 0x10)) return true;
        if ((intcon & 0x01) && (intcon & 0x08)) return true;

        var pir = this.config.pir;
        if (pir.length) {
            if (!(intcon & 0x40)) return false;
            for (var i = 0; i < pir.length; i++) {
                if (this.ram[pir[i].flag] & this.ram[pir[i].enable]) return true;
            }
            return false;
        }

        var ee = this.config.eeInterrupt;
        return !!ee && ((this.ram[ee.flag.addr] >> ee.flag.bit) & 1) === 1 &&
            ((this.ram[ee.enable.addr] >> ee.enable.bit) & 1) === 1;
    }

    checkInterrupts() {
        return (this.ram[0x0B] & 0x80) !== 0 && this.pendingInterrupt();
    }

    /**
     * Sorgenti che risvegliano da SLEEP: ciascuna col proprio bit di
     * abilitazione (e PEIE per le periferiche), a prescindere da GIE.
     * Timer0 no: con l'oscillatore fermo non conta.
     */
    wakeUpPending() {
        return this.pendingInterrupt(false);
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

    // Riceve l'esito del confronto (setZ(result === 0)), come setC e setDC:
    // un tempo confrontava l'argomento con 0, quindi true lo azzerava e Z
    // non veniva mai impostato.
    setZ(isZero) {
        if (isZero) this.ram[0x03] |= 0x04;
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
            // Oscillatore fermo: il tempo passa ma i timer non contano.
            this.cycles++;
            this.peripherals.tickSleeping(1);
            if (this.wakeUpPending()) {
                this.sleeping = false;
                // Con GIE = 1 il micro esegue l'istruzione dopo SLEEP e solo
                // dopo salta al vettore; con GIE = 0 prosegue e basta.
                this.skipIrqOnce = true;
            }
            return;
        }

        // Il salto al vettore costa 2 cicli, come una CALL.
        if (!this.skipIrqOnce && this.checkInterrupts()) {
            this.handleInterrupt();
            this.cycles += 2;
            this.tickPeripherals(2);
            return;
        }
        this.skipIrqOnce = false;

        var startCycles = this.cycles;
        var opcode = this.programMemory[this.PC & (this.config.programSize - 1)];
        this.PC = (this.PC + 1) & 0x1FFF;

        // Le istruzioni da 2 cicli aggiungono il secondo in execute().
        this.execute(opcode);
        this.cycles++;
        this.tickPeripherals(this.cycles - startCycles);

        if (this.onStep) this.onStep(this.PC, opcode);
    }

    /** Avanza le periferiche di un ciclo istruzione alla volta. */
    tickPeripherals(cycles) {
        for (var i = 0; i < cycles; i++) {
            this.peripherals.tickAll(1);
        }
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
        // Azzera il prescaler solo se e' assegnato al watchdog (PSA = 1).
        var tmr0 = this.peripherals.get('TMR0');
        if (tmr0 && (this.ram[0x81] & 0x08)) tmr0.prescalerCount = 0;
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
        var eep = this.peripherals.get('EEPROM');
        var ee = eep ? eep.regs : { data: 0x08, addr: 0x09, con1: 0x88 };
        return {
            W: this.W, PC: this.PC,
            STATUS: this.ram[0x03], FSR: this.ram[0x04],
            PCLATH: this.ram[0x0A], INTCON: this.ram[0x0B],
            TMR0: this.ram[0x01], PORTA: this.ram[0x05], PORTB: this.ram[0x06],
            TRISA: this.ram[0x85], TRISB: this.ram[0x86], OPTION: this.ram[0x81],
            EEDATA: this.ram[ee.data], EEADR: this.ram[ee.addr], EECON1: this.ram[ee.con1],
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
