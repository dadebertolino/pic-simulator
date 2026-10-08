/**
 * PIC16F84A CPU Simulator Core
 * Simula CPU, memoria, periferiche e interrupts
 */

class PIC16F84A {
    constructor() {
        // Breakpoints e callbacks sopravvivono al reset: appartengono al
        // debugger/UI, non allo stato del microcontrollore.
        this.breakpoints = new Set();
        this.onPortChange = null;
        this.onRegisterChange = null;
        this.onMemoryChange = null;
        this.onBreakpoint = null;
        this.onStep = null;

        // Memoria programma ed EEPROM sono non volatili: le scrive il
        // programmatore (loadProgram, eraseEeprom) e il Reset non le tocca.
        this.programMemory = new Uint16Array(1024);
        this.eeprom = new Uint8Array(64);
        this.eraseEeprom();
        
        // Livelli imposti sui pin dal circuito esterno (pulsanti): non
        // dipendono dal reset del micro.
        this.externalPortA = 0;
        this.externalPortB = 0;
        this.t0ckiPrev = 0;

        this.reset();
    }

    /**
     * Reset del micro (power-on o MCLR): registri, RAM, stack e PC tornano
     * ai valori iniziali. Memoria programma ed EEPROM restano: e' cio' che
     * permette all'esempio 07 di ritrovare il contatore dopo un Reset.
     */
    reset() {
        // RAM: 256 bytes (include SFR e GPR)
        this.ram = new Uint8Array(256);
        
        // Stack: 8 livelli, 13-bit
        this.stack = new Uint16Array(8);
        this.stackPointer = 0;
        
        // Registri CPU
        this.W = 0;           // Working register
        this.PC = 0;          // Program Counter (13-bit)
        
        // Stato simulazione
        this.cycles = 0;
        this.running = false;
        this.sleeping = false;
        
        // Prescaler
        this.prescaler = 0;
        this.prescalerCount = 0;
        this.tmr0Inhibit = 0;   // cicli in cui TMR0 resta fermo dopo una scrittura
        this.skipIrqOnce = false; // dopo il risveglio esegue un'istruzione prima del vettore
        
        // WDT
        this.wdtCounter = 0;
        this.wdtEnabled = true;
        
        // EEPROM write state machine
        this.eeWriteState = 0;
        this.eeWriteSequence = [];
        
        // Inizializza registri a valori di reset
        this.initRegisters();
    }

    /** EEPROM cancellata, come dopo la programmazione: ogni byte vale 0xFF. */
    eraseEeprom() {
        this.eeprom.fill(0xFF);
    }

    initRegisters() {
        // Bank 0 SFR reset values
        this.ram[0x03] = 0x18;  // STATUS: TO=1, PD=1
        this.ram[0x81] = 0xFF;  // OPTION_REG
        this.ram[0x85] = 0x1F;  // TRISA (all inputs)
        this.ram[0x86] = 0xFF;  // TRISB (all inputs)
    }

    // === MEMORY ACCESS ===

    /**
     * Indirizzo fisico (0x00-0xFF) di un operando a 7 bit: RP0 sceglie
     * il banco.
     */
    directAddress(addr) {
        const bank = (this.ram[0x03] >> 5) & 0x01;
        return (bank << 7) | (addr & 0x7F);
    }

    /**
     * Riduce un indirizzo fisico al registro che lo implementa. Le SFR
     * comuni ai due banchi e i GPR 0x0C-0x4F esistono una volta sola, sia
     * per l'indirizzamento diretto sia per quello tramite FSR (0x8C e 0x0C
     * sono la stessa cella). -1 = locazione non implementata: si legge 0
     * e le scritture si perdono.
     */
    mapAddress(full) {
        const low = full & 0x7F;
        if (low >= 0x0C) return low <= 0x4F ? low : -1;
        if (low === 0x07) return -1;
        if (low === 0x00 || low === 0x02 || low === 0x03 || low === 0x04 || low === 0x0A || low === 0x0B) {
            return low;
        }
        // Banco 1: OPTION_REG, TRISA, TRISB, EECON1, EECON2
        return (full & 0x80) ? 0x80 | low : low;
    }

    readRAM(addr) {
        return this.readFile(this.directAddress(addr));
    }

    writeRAM(addr, value) {
        this.writeFile(this.directAddress(addr), value);
    }

    /** Lettura di un indirizzo fisico, con la logica delle SFR. */
    readFile(full) {
        const reg = this.mapAddress(full);
        
        switch (reg) {
            case -1:
                return 0;
            case 0x00:
                // INDF: la cella puntata da FSR. FSR che punta a INDF legge 0.
                return this.mapAddress(this.ram[0x04]) === 0x00 ? 0 : this.readFile(this.ram[0x04]);
            case 0x02:
                return this.PC & 0xFF;
            case 0x05:
                return this.readPortPins('A');
            case 0x06:
                return this.readPortPins('B');
            case 0x89:
                // EECON2 non e' un registro fisico: serve solo alla sequenza di sblocco.
                return 0;
            default:
                return this.ram[reg];
        }
    }

    /**
     * Valore letto sui pin di una porta: per ogni bit il latch se e' output,
     * il livello esterno se e' input. Indipendente dal bank corrente, quindi
     * utilizzabile anche dalla UI (readRAM invece segue RP0 e in bank 1
     * restituirebbe TRISA/TRISB).
     */
    readPortPins(port) {
        const isA = (port === 'A');
        const tris = isA ? this.ram[0x85] : this.ram[0x86];
        const latch = isA ? this.ram[0x05] : this.ram[0x06];
        const external = isA ? this.externalPortA : this.externalPortB;
        const width = isA ? 5 : 8;
        
        let result = 0;
        for (let i = 0; i < width; i++) {
            const mask = 1 << i;
            // Input: livello esterno. Output: latch.
            result |= ((tris & mask) ? external : latch) & mask;
        }
        return result;
    }

    /** Scrittura di un indirizzo fisico, con la logica delle SFR. */
    writeFile(full, value) {
        const reg = this.mapAddress(full);
        value &= 0xFF;
        
        switch (reg) {
            case -1:
                return;
            
            case 0x00: {
                // INDF: scrive nella cella puntata da FSR, passando dalla
                // stessa logica: una scrittura su PORTB via FSR aggiorna i pin.
                const target = this.ram[0x04];
                if (this.mapAddress(target) !== 0x00) this.writeFile(target, value);
                return;
            }
            
            case 0x01:
                // TMR0: la scrittura azzera il prescaler e blocca il conteggio
                // per i due cicli successivi.
                this.ram[0x01] = value;
                this.prescalerCount = 0;
                this.tmr0Inhibit = 2;
                this.notifyRegisterChange('TMR0', value);
                return;
            
            case 0x02:
                // PCL: il PC prende PCLATH<4:0> come parte alta.
                this.PC = ((this.ram[0x0A] & 0x1F) << 8) | value;
                this.ram[0x02] = value;
                this.notifyRegisterChange('PCL', value);
                return;
            
            case 0x03: {
                const mask = 0xE7; // bit 3,4 (PD,TO) non scrivibili
                this.ram[0x03] = (this.ram[0x03] & ~mask) | (value & mask);
                this.notifyRegisterChange('STATUS', this.ram[0x03]);
                return;
            }
            
            case 0x05:
                this.ram[0x05] = value & 0x1F;
                this.notifyPortChange('A', this.getPortOutput('A'));
                return;
            
            case 0x06:
                this.ram[0x06] = value;
                this.notifyPortChange('B', this.getPortOutput('B'));
                return;
            
            case 0x89:
                // EECON2: parte della sequenza di scrittura EEPROM
                this.eeWriteSequence.push(value);
                if (this.eeWriteSequence.length > 2) {
                    this.eeWriteSequence.shift();
                }
                return;
            
            case 0x88: {
                // EECON1: controlla lettura/scrittura EEPROM
                const oldVal = this.ram[0x88];
                this.ram[0x88] = value & 0x1F;
                
                // RD bit: inizio lettura EEPROM
                if ((value & 0x01) && !(oldVal & 0x01)) {
                    const addr = this.ram[0x09];
                    if (addr < 64) {
                        this.ram[0x08] = this.eeprom[addr];
                    }
                    this.ram[0x88] &= ~0x01; // Clear RD
                }
                
                // WR bit: inizio scrittura EEPROM
                if ((value & 0x02) && !(oldVal & 0x02)) {
                    // Verifica sequenza 0x55, 0xAA e WREN
                    if ((value & 0x04) && // WREN set
                        this.eeWriteSequence.length >= 2 &&
                        this.eeWriteSequence[0] === 0x55 &&
                        this.eeWriteSequence[1] === 0xAA) {
                        
                        const addr = this.ram[0x09];
                        if (addr < 64) {
                            this.eeprom[addr] = this.ram[0x08];
                        }
                        // Set EEIF dopo completamento (semplificato: istantaneo).
                        // EEIF vive in EECON1, non in INTCON: checkInterrupts()
                        // lo combina con EEIE. Il bit 4 di INTCON e' INTE.
                        this.ram[0x88] |= 0x10; // EEIF
                        this.ram[0x88] &= ~0x02; // Clear WR
                    }
                    this.eeWriteSequence = [];
                }
                
                this.notifyRegisterChange('EECON1', this.ram[0x88]);
                return;
            }
            
            case 0x85:
                this.ram[0x85] = value & 0x1F;
                this.notifyPortChange('A', this.getPortOutput('A'));
                return;
            
            case 0x86:
                this.ram[0x86] = value;
                this.notifyPortChange('B', this.getPortOutput('B'));
                return;
            
            default:
                this.ram[reg] = value;
                this.notifyMemoryChange(reg, value);
        }
    }

    // === PORT I/O ===
    
    getPortOutput(port) {
        if (port === 'A') {
            const tris = this.ram[0x85];
            const data = this.ram[0x05];
            return { data: data & ~tris, tris: tris, raw: data };
        } else {
            const tris = this.ram[0x86];
            const data = this.ram[0x06];
            return { data: data & ~tris, tris: tris, raw: data };
        }
    }

    setExternalInput(port, pin, value) {
        const oldPortB = this.externalPortB;
        
        if (port === 'A') {
            if (value) {
                this.externalPortA |= (1 << pin);
            } else {
                this.externalPortA &= ~(1 << pin);
            }
            
            // RA4/T0CKI: clock per TMR0
            if (pin === 4) {
                this.handleT0CKI(value);
            }
        } else {
            if (value) {
                this.externalPortB |= (1 << pin);
            } else {
                this.externalPortB &= ~(1 << pin);
            }
            
            // RB0/INT: external interrupt - passa valore precedente
            if (pin === 0) {
                const prevValue = (oldPortB >> 0) & 0x01;
                this.handleINT(prevValue, value);
            }
            
            // RB4-RB7 change interrupt: contano solo i pin configurati
            // come ingresso, le uscite non generano RBIF.
            const inputs = (this.ram[0x86] >> 4) & 0x0F;
            if ((((oldPortB ^ this.externalPortB) >> 4) & inputs) !== 0) {
                this.handleRBChange();
            }
        }
    }

    handleT0CKI(value) {
        const option = this.ram[0x81];
        const t0cs = (option >> 5) & 0x01;  // Timer0 Clock Source
        const t0se = (option >> 4) & 0x01;  // Timer0 Source Edge
        
        if (t0cs === 1) { // External clock
            const edge = t0se ? (this.t0ckiPrev && !value) : (!this.t0ckiPrev && value);
            if (edge) {
                this.incrementTMR0();
            }
        }
        this.t0ckiPrev = value;
    }

    handleINT(prevValue, newValue) {
        const option = this.ram[0x81];
        const intedg = (option >> 6) & 0x01;  // Bit 6: INTEDG
        
        // Check edge based on INTEDG
        // INTEDG = 1: rising edge (0->1)
        // INTEDG = 0: falling edge (1->0)
        const triggered = intedg 
            ? (prevValue === 0 && newValue === 1)   // Rising edge
            : (prevValue === 1 && newValue === 0);  // Falling edge
        
        // Come sul chip, il flag si alza anche con INTE spento: INTE decide
        // solo se il flag genera l'interrupt (checkInterrupts).
        if (triggered) {
            this.ram[0x0B] |= 0x02; // Set INTF
        }
    }

    handleRBChange() {
        // Anche RBIF si alza indipendentemente da RBIE.
        this.ram[0x0B] |= 0x01;
    }

    // === TIMER0 ===
    
    incrementTMR0() {
        const option = this.ram[0x81];
        const psa = (option >> 3) & 0x01;
        const ps = option & 0x07;
        
        if (psa === 0) { // Prescaler assigned to TMR0
            const prescalerRatio = 1 << (ps + 1); // 2, 4, 8, 16, 32, 64, 128, 256
            this.prescalerCount++;
            if (this.prescalerCount >= prescalerRatio) {
                this.prescalerCount = 0;
                this.doTMR0Increment();
            }
        } else {
            this.doTMR0Increment();
        }
    }

    doTMR0Increment() {
        // ram e' una Uint8Array: 0xFF + 1 avvolge gia' a 0x00, quindi
        // l'overflow si riconosce dal valore risultante, non da un > 255.
        this.ram[0x01] = (this.ram[0x01] + 1) & 0xFF;
        if (this.ram[0x01] === 0) {
            // Overflow FF -> 00: set T0IF
            this.ram[0x0B] |= 0x04;
        }
        this.notifyRegisterChange('TMR0', this.ram[0x01]);
    }

    /**
     * Clock interno: un passo (di TMR0 o del prescaler) per ciclo
     * istruzione, quindi due per GOTO, CALL e gli skip. Dopo una scrittura
     * di TMR0 il conteggio resta fermo per due cicli.
     */
    updateTMR0(cycles = 1) {
        const t0cs = (this.ram[0x81] >> 5) & 0x01;
        if (t0cs !== 0) return; // clock esterno su RA4/T0CKI
        
        for (let i = 0; i < cycles; i++) {
            if (this.tmr0Inhibit > 0) {
                this.tmr0Inhibit--;
            } else {
                this.incrementTMR0();
            }
        }
    }

    // === INTERRUPT HANDLING ===
    
    checkInterrupts() {
        const intcon = this.ram[0x0B];
        
        // GIE must be set
        if (!(intcon & 0x80)) return false;
        
        // T0IF & T0IE
        if ((intcon & 0x04) && (intcon & 0x20)) return true;
        
        // INTF & INTE
        if ((intcon & 0x02) && (intcon & 0x10)) return true;
        
        // RBIF & RBIE
        if ((intcon & 0x01) && (intcon & 0x08)) return true;
        
        // EEIF & EEIE
        if ((this.ram[0x88] & 0x10) && (intcon & 0x40)) return true;
        
        return false;
    }

    /**
     * Sorgenti che risvegliano da SLEEP: INT, cambio su RB4-RB7, fine
     * scrittura EEPROM, ciascuna col proprio bit di abilitazione e a
     * prescindere da GIE. Timer0 no: con l'oscillatore fermo non conta.
     */
    wakeUpPending() {
        const intcon = this.ram[0x0B];
        return ((intcon & 0x02) && (intcon & 0x10))
            || ((intcon & 0x01) && (intcon & 0x08))
            || ((this.ram[0x88] & 0x10) && (intcon & 0x40));
    }

    handleInterrupt() {
        // Push PC to stack
        this.pushStack(this.PC);
        
        // Clear GIE
        this.ram[0x0B] &= ~0x80;
        
        // Jump to interrupt vector
        this.PC = 0x0004;
        
        // Wake from sleep
        this.sleeping = false;
    }

    // === STACK ===
    
    pushStack(value) {
        this.stack[this.stackPointer] = value & 0x1FFF;
        this.stackPointer = (this.stackPointer + 1) & 0x07;
    }

    popStack() {
        this.stackPointer = (this.stackPointer - 1) & 0x07;
        return this.stack[this.stackPointer];
    }

    // === STATUS FLAGS ===
    
    // Riceve l'esito del confronto (setZ(result === 0)), come setC e setDC:
    // un tempo confrontava l'argomento con 0, quindi true lo azzerava e Z
    // non veniva mai impostato.
    setZ(isZero) {
        if (isZero) {
            this.ram[0x03] |= 0x04;
        } else {
            this.ram[0x03] &= ~0x04;
        }
    }

    setC(value) {
        if (value) {
            this.ram[0x03] |= 0x01;
        } else {
            this.ram[0x03] &= ~0x01;
        }
    }

    setDC(value) {
        if (value) {
            this.ram[0x03] |= 0x02;
        } else {
            this.ram[0x03] &= ~0x02;
        }
    }

    getC() {
        return (this.ram[0x03] >> 0) & 0x01;
    }

    getZ() {
        return (this.ram[0x03] >> 2) & 0x01;
    }

    // === INSTRUCTION EXECUTION ===
    
    step() {
        if (this.sleeping) {
            // Oscillatore fermo: il tempo passa ma Timer0 non conta.
            this.cycles++;
            if (this.wakeUpPending()) {
                this.sleeping = false;
                // Con GIE = 1 il micro esegue l'istruzione dopo SLEEP e solo
                // dopo salta al vettore; con GIE = 0 prosegue e basta.
                this.skipIrqOnce = true;
            }
            return;
        }
        
        // Check interrupts before fetch: il salto al vettore costa 2 cicli,
        // come una CALL.
        if (!this.skipIrqOnce && this.checkInterrupts()) {
            this.handleInterrupt();
            this.cycles += 2;
            this.updateTMR0(2);
            return;
        }
        this.skipIrqOnce = false;
        
        const startCycles = this.cycles;
        
        // Fetch instruction
        const opcode = this.programMemory[this.PC & 0x3FF];
        this.PC = (this.PC + 1) & 0x1FFF;
        
        // Decode and execute (le istruzioni da 2 cicli aggiungono il secondo)
        this.execute(opcode);
        this.cycles++;
        
        // Update peripherals
        this.updateTMR0(this.cycles - startCycles);
        
        // Notify
        if (this.onStep) {
            this.onStep(this.PC, opcode);
        }
    }

    execute(opcode) {
        // Decode opcode (14-bit PIC16 instruction set)
        
        // Control instructions (full 14-bit match)
        if (opcode === 0x0008) { this.RETURN(); return; }
        if (opcode === 0x0009) { this.RETFIE(); return; }
        if (opcode === 0x0064) { this.CLRWDT(); return; }
        if (opcode === 0x0063) { this.SLEEP(); return; }
        if ((opcode & 0x3FFF) === 0x0000) { this.NOP(); return; }
        
        // Bit-oriented instructions: 01 bbbb fffffff
        if ((opcode >> 12) === 0x01) {
            const bit = (opcode >> 7) & 0x07;
            const f = opcode & 0x7F;
            const op = (opcode >> 10) & 0x03;
            
            switch(op) {
                case 0: this.BCF(f, bit); return;
                case 1: this.BSF(f, bit); return;
                case 2: this.BTFSC(f, bit); return;
                case 3: this.BTFSS(f, bit); return;
            }
        }
        
        // CALL: 100 kkkkkkkkkkk
        if ((opcode >> 11) === 0x04) {
            const k = opcode & 0x7FF;
            this.CALL(k);
            return;
        }
        
        // GOTO: 101 kkkkkkkkkkk
        if ((opcode >> 11) === 0x05) {
            const k = opcode & 0x7FF;
            this.GOTO(k);
            return;
        }
        
        // MOVLW: 1100xx kkkkkkkk
        if ((opcode >> 10) === 0x30 >> 2) {
            const k = opcode & 0xFF;
            this.MOVLW(k);
            return;
        }
        
        // RETLW: 1101xx kkkkkkkk
        if ((opcode >> 10) === 0x34 >> 2) {
            const k = opcode & 0xFF;
            this.RETLW(k);
            return;
        }
        
        // Literal ops: 111xxx kkkkkkkk
        if ((opcode >> 11) === 0x07) {
            const k = opcode & 0xFF;
            const op = (opcode >> 8) & 0x07;
            
            switch(op) {
                case 0: this.IORLW(k); return;  // 111000
                case 1: this.ANDLW(k); return;  // 111001
                case 2: this.XORLW(k); return;  // 111010
                case 4: this.SUBLW(k); return;  // 111100
                case 5: this.SUBLW(k); return;  // 111101
                case 6: this.ADDLW(k); return;  // 111110
                case 7: this.ADDLW(k); return;  // 111111
            }
        }
        
        // Byte-oriented instructions: 00 xxxx dffffff
        if ((opcode >> 12) === 0x00) {
            const f = opcode & 0x7F;
            const d = (opcode >> 7) & 0x01;
            const op = (opcode >> 8) & 0x0F;
            
            switch(op) {
                case 0x00: 
                    if (d) this.MOVWF(f);
                    else if (f === 0) this.NOP();
                    else this.NOP(); // CLRW se f=0 e d=0 handled differently
                    return;
                case 0x01:
                    if (d) this.CLRF(f);
                    else this.CLRW();
                    return;
                case 0x02: this.SUBWF(f, d); return;
                case 0x03: this.DECF(f, d); return;
                case 0x04: this.IORWF(f, d); return;
                case 0x05: this.ANDWF(f, d); return;
                case 0x06: this.XORWF(f, d); return;
                case 0x07: this.ADDWF(f, d); return;
                case 0x08: this.MOVF(f, d); return;
                case 0x09: this.COMF(f, d); return;
                case 0x0A: this.INCF(f, d); return;
                case 0x0B: this.DECFSZ(f, d); return;
                case 0x0C: this.RRF(f, d); return;
                case 0x0D: this.RLF(f, d); return;
                case 0x0E: this.SWAPF(f, d); return;
                case 0x0F: this.INCFSZ(f, d); return;
            }
        }
        
        // Unknown opcode - treat as NOP
        this.NOP();
    }

    // === INSTRUCTION IMPLEMENTATIONS ===
    
    // Byte-oriented
    ADDWF(f, d) {
        const val = this.readRAM(f);
        const result = this.W + val;
        this.setC(result > 255);
        this.setDC(((this.W & 0x0F) + (val & 0x0F)) > 0x0F);
        this.setZ((result & 0xFF) === 0);
        if (d) this.writeRAM(f, result & 0xFF);
        else this.W = result & 0xFF;
    }

    ANDWF(f, d) {
        const result = this.W & this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    CLRF(f) {
        this.writeRAM(f, 0);
        this.setZ(true);
    }

    CLRW() {
        this.W = 0;
        this.setZ(true);
    }

    COMF(f, d) {
        const result = (~this.readRAM(f)) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    DECF(f, d) {
        const result = (this.readRAM(f) - 1) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    DECFSZ(f, d) {
        const result = (this.readRAM(f) - 1) & 0xFF;
        if (d) this.writeRAM(f, result);
        else this.W = result;
        if (result === 0) {
            this.PC = (this.PC + 1) & 0x1FFF; // Skip next
            this.cycles++;
        }
    }

    INCF(f, d) {
        const result = (this.readRAM(f) + 1) & 0xFF;
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    INCFSZ(f, d) {
        const result = (this.readRAM(f) + 1) & 0xFF;
        if (d) this.writeRAM(f, result);
        else this.W = result;
        if (result === 0) {
            this.PC = (this.PC + 1) & 0x1FFF;
            this.cycles++;
        }
    }

    IORWF(f, d) {
        const result = this.W | this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    MOVF(f, d) {
        const result = this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    MOVWF(f) {
        this.writeRAM(f, this.W);
    }

    NOP() {
        // No operation
    }

    RLF(f, d) {
        const val = this.readRAM(f);
        const c = this.getC();
        const result = ((val << 1) | c) & 0xFF;
        this.setC((val >> 7) & 0x01);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    RRF(f, d) {
        const val = this.readRAM(f);
        const c = this.getC();
        const result = ((val >> 1) | (c << 7)) & 0xFF;
        this.setC(val & 0x01);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    SUBWF(f, d) {
        const val = this.readRAM(f);
        const result = val - this.W;
        this.setC(result >= 0);
        this.setDC((val & 0x0F) >= (this.W & 0x0F));
        this.setZ((result & 0xFF) === 0);
        if (d) this.writeRAM(f, result & 0xFF);
        else this.W = result & 0xFF;
    }

    SWAPF(f, d) {
        const val = this.readRAM(f);
        const result = ((val & 0x0F) << 4) | ((val >> 4) & 0x0F);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    XORWF(f, d) {
        const result = this.W ^ this.readRAM(f);
        this.setZ(result === 0);
        if (d) this.writeRAM(f, result);
        else this.W = result;
    }

    // Bit-oriented
    BCF(f, b) {
        const val = this.readRAM(f) & ~(1 << b);
        this.writeRAM(f, val);
    }

    BSF(f, b) {
        const val = this.readRAM(f) | (1 << b);
        this.writeRAM(f, val);
    }

    BTFSC(f, b) {
        if (!((this.readRAM(f) >> b) & 0x01)) {
            this.PC = (this.PC + 1) & 0x1FFF;
            this.cycles++;
        }
    }

    BTFSS(f, b) {
        if ((this.readRAM(f) >> b) & 0x01) {
            this.PC = (this.PC + 1) & 0x1FFF;
            this.cycles++;
        }
    }

    // Literal
    ADDLW(k) {
        const result = this.W + k;
        this.setC(result > 255);
        this.setDC(((this.W & 0x0F) + (k & 0x0F)) > 0x0F);
        this.setZ((result & 0xFF) === 0);
        this.W = result & 0xFF;
    }

    ANDLW(k) {
        this.W &= k;
        this.setZ(this.W === 0);
    }

    IORLW(k) {
        this.W |= k;
        this.setZ(this.W === 0);
    }

    MOVLW(k) {
        this.W = k & 0xFF;
    }

    SUBLW(k) {
        const result = k - this.W;
        this.setC(result >= 0);
        this.setDC((k & 0x0F) >= (this.W & 0x0F));
        this.setZ((result & 0xFF) === 0);
        this.W = result & 0xFF;
    }

    XORLW(k) {
        this.W ^= k;
        this.setZ(this.W === 0);
    }

    // Control
    CALL(k) {
        this.pushStack(this.PC);
        this.PC = ((this.ram[0x0A] & 0x18) << 8) | k;
        this.cycles++;
    }

    GOTO(k) {
        this.PC = ((this.ram[0x0A] & 0x18) << 8) | k;
        this.cycles++;
    }

    RETLW(k) {
        this.W = k;
        this.PC = this.popStack();
        this.cycles++;
    }

    RETURN() {
        this.PC = this.popStack();
        this.cycles++;
    }

    RETFIE() {
        this.PC = this.popStack();
        this.ram[0x0B] |= 0x80; // Set GIE
        this.cycles++;
    }

    CLRWDT() {
        this.wdtCounter = 0;
        // Azzera il prescaler solo se e' assegnato al watchdog (PSA = 1).
        if (this.ram[0x81] & 0x08) this.prescalerCount = 0;
        this.ram[0x03] |= 0x18; // Set TO and PD
    }

    SLEEP() {
        this.sleeping = true;
        this.wdtCounter = 0;
        this.ram[0x03] &= ~0x08; // Clear PD
        this.ram[0x03] |= 0x10;  // Set TO
    }

    // === CALLBACKS ===
    
    notifyPortChange(port, value) {
        if (this.onPortChange) {
            this.onPortChange(port, value);
        }
    }

    notifyRegisterChange(name, value) {
        if (this.onRegisterChange) {
            this.onRegisterChange(name, value);
        }
    }

    notifyMemoryChange(addr, value) {
        if (this.onMemoryChange) {
            this.onMemoryChange(addr, value);
        }
    }

    // === PROGRAM LOADING ===
    
    loadProgram(words) {
        this.programMemory.fill(0);
        for (let i = 0; i < words.length && i < 1024; i++) {
            this.programMemory[i] = words[i] & 0x3FFF;
        }
    }

    // === DEBUG ===
    
    getState() {
        return {
            W: this.W,
            PC: this.PC,
            STATUS: this.ram[0x03],
            FSR: this.ram[0x04],
            PCLATH: this.ram[0x0A],
            INTCON: this.ram[0x0B],
            TMR0: this.ram[0x01],
            PORTA: this.ram[0x05],
            PORTB: this.ram[0x06],
            TRISA: this.ram[0x85],
            TRISB: this.ram[0x86],
            OPTION: this.ram[0x81],
            EEDATA: this.ram[0x08],
            EEADR: this.ram[0x09],
            EECON1: this.ram[0x88],
            cycles: this.cycles,
            stack: Array.from(this.stack),
            stackPointer: this.stackPointer,
            sleeping: this.sleeping
        };
    }

    setBreakpoint(addr) {
        this.breakpoints.add(addr);
    }

    clearBreakpoint(addr) {
        this.breakpoints.delete(addr);
    }

    toggleBreakpoint(addr) {
        if (this.breakpoints.has(addr)) {
            this.breakpoints.delete(addr);
        } else {
            this.breakpoints.add(addr);
        }
    }
}

// Export per uso modulare
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16F84A;
}
