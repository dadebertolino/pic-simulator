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

        this.reset();
    }

    reset() {
        // Program memory: 1K x 14-bit
        this.programMemory = new Uint16Array(1024);
        
        // RAM: 256 bytes (include SFR e GPR)
        this.ram = new Uint8Array(256);
        
        // EEPROM: 64 bytes
        this.eeprom = new Uint8Array(64);
        
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
        
        // WDT
        this.wdtCounter = 0;
        this.wdtEnabled = true;
        
        // EEPROM write state machine
        this.eeWriteState = 0;
        this.eeWriteSequence = [];
        
        // External inputs
        this.externalPortA = 0;
        this.externalPortB = 0;
        this.t0ckiPrev = 0;
        
        // Inizializza registri a valori di reset
        this.initRegisters();
    }

    initRegisters() {
        // Bank 0 SFR reset values
        this.ram[0x03] = 0x18;  // STATUS: TO=1, PD=1
        this.ram[0x81] = 0xFF;  // OPTION_REG
        this.ram[0x85] = 0x1F;  // TRISA (all inputs)
        this.ram[0x86] = 0xFF;  // TRISB (all inputs)
    }

    // === MEMORY ACCESS ===
    
    getEffectiveAddress(addr) {
        // Bank selection via RP0
        const bank = (this.ram[0x03] >> 5) & 0x01;
        
        // Indirizzi mappati in entrambi i bank
        if (addr === 0x00 || addr === 0x02 || addr === 0x03 || 
            addr === 0x04 || addr === 0x0A || addr === 0x0B) {
            return addr;
        }
        
        // GPR 0x0C-0x4F mappati in entrambi i bank
        if (addr >= 0x0C && addr <= 0x4F) {
            return addr;
        }
        
        // Bank 1 offset
        if (bank === 1 && addr < 0x0C) {
            return addr + 0x80;
        }
        
        return addr;
    }

    readRAM(addr) {
        const effAddr = this.getEffectiveAddress(addr & 0x7F);
        
        // INDF: indirect addressing
        if (effAddr === 0x00 || effAddr === 0x80) {
            const fsr = this.ram[0x04];
            const irp = (this.ram[0x03] >> 7) & 0x01;
            const indirectAddr = fsr | (irp << 8);
            return this.ram[indirectAddr & 0xFF];
        }
        
        // TMR0: read actual value
        if (effAddr === 0x01) {
            return this.ram[0x01];
        }
        
        // PCL: return low byte of PC
        if (effAddr === 0x02 || effAddr === 0x82) {
            return this.PC & 0xFF;
        }
        
        // PORTA / PORTB: read pins based on TRIS
        if (effAddr === 0x05) return this.readPortPins('A');
        if (effAddr === 0x06) return this.readPortPins('B');
        
        return this.ram[effAddr];
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

    writeRAM(addr, value) {
        const effAddr = this.getEffectiveAddress(addr & 0x7F);
        value &= 0xFF;
        
        // INDF: indirect addressing
        if (effAddr === 0x00 || effAddr === 0x80) {
            const fsr = this.ram[0x04];
            const irp = (this.ram[0x03] >> 7) & 0x01;
            const indirectAddr = fsr | (irp << 8);
            this.ram[indirectAddr & 0xFF] = value;
            this.notifyMemoryChange(indirectAddr & 0xFF, value);
            return;
        }
        
        // TMR0: write clears prescaler
        if (effAddr === 0x01) {
            this.ram[0x01] = value;
            this.prescalerCount = 0;
            // Inibisce incremento per 2 cicli (semplificato)
            this.notifyRegisterChange('TMR0', value);
            return;
        }
        
        // PCL: write modifica PC
        if (effAddr === 0x02 || effAddr === 0x82) {
            this.PC = (this.ram[0x0A] << 8) | value;
            this.ram[0x02] = value;
            this.notifyRegisterChange('PCL', value);
            return;
        }
        
        // STATUS: solo alcuni bit scrivibili
        if (effAddr === 0x03 || effAddr === 0x83) {
            const mask = 0xE7; // bit 3,4 (PD,TO) non scrivibili
            this.ram[0x03] = (this.ram[0x03] & ~mask) | (value & mask);
            this.notifyRegisterChange('STATUS', this.ram[0x03]);
            return;
        }
        
        // PORTA
        if (effAddr === 0x05) {
            this.ram[0x05] = value & 0x1F;
            this.notifyPortChange('A', this.getPortOutput('A'));
            return;
        }
        
        // PORTB
        if (effAddr === 0x06) {
            const oldValue = this.ram[0x06];
            this.ram[0x06] = value;
            this.notifyPortChange('B', this.getPortOutput('B'));
            return;
        }
        
        // EECON2: parte della sequenza di scrittura EEPROM
        if (effAddr === 0x89) {
            this.eeWriteSequence.push(value);
            if (this.eeWriteSequence.length > 2) {
                this.eeWriteSequence.shift();
            }
            return;
        }
        
        // EECON1: controlla lettura/scrittura EEPROM
        if (effAddr === 0x88) {
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
                    // Set EEIF dopo completamento (semplificato: istantaneo)
                    this.ram[0x88] |= 0x10; // EEIF
                    this.ram[0x88] &= ~0x02; // Clear WR
                    
                    // Trigger interrupt se abilitato
                    if (this.ram[0x0B] & 0x40) { // EEIE
                        this.ram[0x0B] |= 0x10; // Set interrupt flag in INTCON
                    }
                }
                this.eeWriteSequence = [];
            }
            
            this.notifyRegisterChange('EECON1', this.ram[0x88]);
            return;
        }
        
        // TRISA
        if (effAddr === 0x85) {
            this.ram[0x85] = value & 0x1F;
            this.notifyPortChange('A', this.getPortOutput('A'));
            return;
        }
        
        // TRISB
        if (effAddr === 0x86) {
            this.ram[0x86] = value;
            this.notifyPortChange('B', this.getPortOutput('B'));
            return;
        }
        
        // Default write
        this.ram[effAddr] = value;
        this.notifyMemoryChange(effAddr, value);
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
            
            // RB4-RB7 change interrupt
            const rb47Old = (oldPortB >> 4) & 0x0F;
            const rb47New = (this.externalPortB >> 4) & 0x0F;
            if (rb47Old !== rb47New) {
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
        const intcon = this.ram[0x0B];
        
        // Check edge based on INTEDG
        // INTEDG = 1: rising edge (0->1)
        // INTEDG = 0: falling edge (1->0)
        const triggered = intedg 
            ? (prevValue === 0 && newValue === 1)   // Rising edge
            : (prevValue === 1 && newValue === 0);  // Falling edge
        
        if (triggered && (intcon & 0x10)) { // INTE enabled
            this.ram[0x0B] |= 0x02; // Set INTF
        }
    }

    handleRBChange() {
        const intcon = this.ram[0x0B];
        if (intcon & 0x08) { // RBIE enabled
            this.ram[0x0B] |= 0x01; // Set RBIF
        }
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

    updateTMR0() {
        const option = this.ram[0x81];
        const t0cs = (option >> 5) & 0x01;
        
        // Internal clock
        if (t0cs === 0) {
            this.incrementTMR0();
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
    
    setZ(value) {
        if (value === 0) {
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
            this.cycles++;
            this.updateTMR0();
            if (this.checkInterrupts()) {
                this.handleInterrupt();
            }
            return;
        }
        
        // Check interrupts before fetch
        if (this.checkInterrupts()) {
            this.handleInterrupt();
            return;
        }
        
        // Fetch instruction
        const opcode = this.programMemory[this.PC & 0x3FF];
        this.PC = (this.PC + 1) & 0x1FFF;
        
        // Decode and execute
        this.execute(opcode);
        
        // Update peripherals
        this.updateTMR0();
        this.cycles++;
        
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
        this.prescalerCount = 0;
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
