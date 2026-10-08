/**
 * PIC16 Assembler
 * Assembla codice sorgente ASM in codice macchina 14-bit
 */

class PIC16Assembler {
    constructor() {
        this.reset();
        this.initInstructions();
        this.initRegisters();
    }

    reset() {
        this.programMemory = [];
        this.labels = {};
        this.constants = {};
        this.variables = {};
        this.currentAddress = 0;
        this.errors = [];
        this.warnings = [];
        this.sourceMap = {}; // address -> line number
        this.listing = [];
        this.configWord = null;  // Configuration word (14-bit, indirizzo 0x2007)
        this.configAddr = 0x2007; // Standard per PIC16 mid-range
    }

    initRegisters() {
        // Registri base comuni a TUTTI i PIC16 mid-range
        this.registers = {
            // Core SFR (mirrored in tutti i bank)
            'INDF':    0x00, 'TMR0':    0x01, 'PCL':     0x02, 'STATUS':  0x03,
            'FSR':     0x04, 'PCLATH':  0x0A, 'INTCON':  0x0B,
            // Bank 0 default
            'PORTA':   0x05, 'PORTB':   0x06,
            'EEDATA':  0x08, 'EEADR':   0x09,
            // Bank 1 default
            'OPTION_REG': 0x81, 'TRISA': 0x85, 'TRISB':  0x86,
            'EECON1':  0x88, 'EECON2':  0x89,
            // STATUS bit names
            'C': 0, 'DC': 1, 'Z': 2, 'PD': 3, 'TO': 4, 'RP0': 5, 'RP1': 6, 'IRP': 7,
            // INTCON bit names
            'RBIF': 0, 'INTF': 1, 'T0IF': 2, 'RBIE': 3, 'INTE': 4, 'T0IE': 5, 'EEIE': 6, 'GIE': 7,
            'PEIE': 6,
            // Destination
            'W': 0, 'F': 1
        };
        
        // Configuration bits (valori standard PIC16F84A/628A/877A)
        // Convenzione MPASM: _XX_ON/_XX_OFF
        this._configSymbols = {
            // Oscillator
            '_LP_OSC':    0x3FFC, '_XT_OSC':    0x3FFD, '_HS_OSC':    0x3FFE, '_RC_OSC':    0x3FFF,
            '_INTRC_OSC_NOCLKOUT': 0x3FFC, '_INTRC_OSC_CLKOUT': 0x3FFD,
            '_EXTCLK':    0x3FFF, '_INTOSC':    0x3FFC,
            // Watchdog
            '_WDT_ON':    0x3FFF, '_WDT_OFF':   0x3FFB,
            // Power-up Timer
            '_PWRTE_ON':  0x3FF7, '_PWRTE_OFF': 0x3FFF,
            // Code Protect
            '_CP_ON':     0x0000, '_CP_OFF':    0x3FFF,
            // Brown-out
            '_BODEN_ON':  0x3FFF, '_BODEN_OFF': 0x3FBF,
            '_BOR_ON':    0x3FFF, '_BOR_OFF':   0x3FBF,
            // LVP
            '_LVP_ON':    0x3FFF, '_LVP_OFF':   0x3F7F,
            // MCLR
            '_MCLRE_ON':  0x3FFF, '_MCLRE_OFF': 0x3FDF,
            // Data Code Protect
            '_CPD_ON':    0x3EFF, '_CPD_OFF':   0x3FFF,
            // Write Protect
            '_WRT_ON':    0x3FFF, '_WRT_OFF':   0x3DFF,
            // Debug
            '_DEBUG_ON':  0x37FF, '_DEBUG_OFF': 0x3FFF
        };
        
        this._deviceId = null;
    }

    /**
     * Carica simboli SFR per un device specifico dal JSON.
     * Può essere chiamato dal manager al cambio device o dalla direttiva LIST P=xxx.
     * 
     * Strategia: se il JSON ha la sezione 'sfr', la usa.
     * Altrimenti, ricostruisce gli SFR dalle porte e periferiche definite.
     * I registri base rimangono sempre — quelli dal device si aggiungono.
     * 
     * @param {string} deviceId
     * @param {object} deviceData - JSON del device
     */
    loadDeviceSymbols(deviceId, deviceData) {
        if (!deviceData || this._deviceId === deviceId) return;
        this._deviceId = deviceId;
        
        // Reset ai base, poi aggiungi device-specific
        this.initRegisters();

        // 1. Se il JSON ha sezione 'sfr', usala direttamente
        if (deviceData.sfr) {
            for (var bank in deviceData.sfr) {
                if (!deviceData.sfr.hasOwnProperty(bank)) continue;
                var regs = deviceData.sfr[bank];
                for (var addr in regs) {
                    if (!regs.hasOwnProperty(addr)) continue;
                    var info = regs[addr];
                    var numAddr = parseInt(addr, 16);
                    this.registers[info.name] = numAddr;
                    // Bit names se presenti
                    if (info.bits) {
                        for (var bitName in info.bits) {
                            if (info.bits.hasOwnProperty(bitName)) {
                                this.registers[bitName] = info.bits[bitName];
                            }
                        }
                    }
                }
            }
            return;
        }

        // 2. Ricostruisci SFR dalle porte
        if (deviceData.ports) {
            for (var portName in deviceData.ports) {
                if (!deviceData.ports.hasOwnProperty(portName)) continue;
                var port = deviceData.ports[portName];
                var letter = portName.replace('PORT', '');
                this.registers[portName] = parseInt(port.dataReg, 16);
                this.registers['TRIS' + letter] = parseInt(port.trisReg, 16);
            }
        }

        // 3. Ricostruisci SFR dalle periferiche
        var pMap = deviceData.peripherals || {};
        
        // TMR1
        if (pMap.TMR1) {
            this._addPeriphRegs({
                'TMR1L': pMap.TMR1.regLow, 'TMR1H': pMap.TMR1.regHigh,
                'T1CON': pMap.TMR1.controlReg
            });
            this.registers['TMR1ON'] = 0; this.registers['TMR1CS'] = 1;
            this.registers['T1CKPS0'] = 4; this.registers['T1CKPS1'] = 5;
        }
        // TMR2
        if (pMap.TMR2) {
            this._addPeriphRegs({
                'TMR2': pMap.TMR2.reg, 'T2CON': pMap.TMR2.controlReg,
                'PR2': pMap.TMR2.periodReg
            });
            this.registers['TMR2ON'] = 2;
        }
        // CCP1
        if (pMap.CCP1) {
            this._addPeriphRegs({
                'CCPR1L': pMap.CCP1.regLow, 'CCPR1H': pMap.CCP1.regHigh,
                'CCP1CON': pMap.CCP1.controlReg
            });
        }
        // CCP2
        if (pMap.CCP2) {
            this._addPeriphRegs({
                'CCPR2L': pMap.CCP2.regLow, 'CCPR2H': pMap.CCP2.regHigh,
                'CCP2CON': pMap.CCP2.controlReg
            });
        }
        // USART
        if (pMap.USART) {
            this._addPeriphRegs({
                'TXREG': pMap.USART.txReg, 'RCREG': pMap.USART.rxReg,
                'RCSTA': pMap.USART.statusReg, 'TXSTA': pMap.USART.controlReg,
                'SPBRG': pMap.USART.baudReg
            });
            this.registers['TXEN'] = 5; this.registers['SPEN'] = 7;
            this.registers['CREN'] = 4; this.registers['TXIF'] = 4;
            this.registers['RCIF'] = 5;
        }
        // ADC
        if (pMap.ADC) {
            this._addPeriphRegs({
                'ADRESH': pMap.ADC.resultRegHigh, 'ADRESL': pMap.ADC.resultRegLow,
                'ADCON0': pMap.ADC.controlReg0, 'ADCON1': pMap.ADC.controlReg1
            });
            this.registers['ADON'] = 0; this.registers['GO'] = 2;
            this.registers['GO_DONE'] = 2; this.registers['ADFM'] = 7;
        }
        // MSSP
        if (pMap.MSSP) {
            this._addPeriphRegs({
                'SSPBUF': pMap.MSSP.bufferReg, 'SSPCON': pMap.MSSP.controlReg,
                'SSPCON2': pMap.MSSP.controlReg2, 'SSPADD': pMap.MSSP.addressReg,
                'SSPSTAT': pMap.MSSP.statusReg
            });
            this.registers['SSPEN'] = 5; this.registers['BF'] = 0;
        }
        // Comparator
        if (pMap.COMPARATOR) {
            this._addPeriphRegs({
                'CMCON': pMap.COMPARATOR.controlReg, 'VRCON': pMap.COMPARATOR.vrefReg
            });
        }
        
        // PIR/PIE (presenti se c'è almeno una periferica avanzata)
        if (pMap.TMR1 || pMap.USART || pMap.ADC || pMap.MSSP || pMap.CCP1) {
            this.registers['PIR1'] = 0x0C;
            this.registers['PIE1'] = 0x8C;
            // Bit names PIR1
            this.registers['TMR1IF'] = 0; this.registers['TMR2IF'] = 1;
            this.registers['CCP1IF'] = 2; this.registers['SSPIF'] = 3;
            this.registers['ADIF'] = 6;
            // PIE1
            this.registers['TMR1IE'] = 0; this.registers['TMR2IE'] = 1;
            this.registers['CCP1IE'] = 2; this.registers['SSPIE'] = 3;
            this.registers['TXIE'] = 4; this.registers['RCIE'] = 5;
            this.registers['ADIE'] = 6;
        }
        if (pMap.CCP2) {
            this.registers['PIR2'] = 0x0D;
            this.registers['PIE2'] = 0x8D;
            this.registers['CCP2IF'] = 0;
            this.registers['CCP2IE'] = 0;
        }
    }

    _addPeriphRegs(map) {
        for (var name in map) {
            if (map.hasOwnProperty(name) && map[name]) {
                var val = typeof map[name] === 'string' ? parseInt(map[name], 16) : map[name];
                if (!isNaN(val)) this.registers[name] = val;
            }
        }
    }

    /**
     * Parsa un'espressione __CONFIG.
     * Supporta:
     *   __CONFIG 0x3FF1              (valore numerico diretto)
     *   __CONFIG _XT_OSC & _WDT_OFF & _CP_OFF  (AND di simboli)
     *   __CONFIG _XT_OSC & _WDT_OFF & 0x3FFF   (misto)
     * 
     * @param {string} expr
     * @param {number} lineNum
     * @returns {number|null}
     */
    _parseConfigExpression(expr, lineNum) {
        // Split su & (AND bit a bit)
        var parts = expr.split('&').map(function(s) { return s.trim(); });
        var result = 0x3FFF; // Parti da tutti 1, AND con ogni token

        for (var i = 0; i < parts.length; i++) {
            var token = parts[i].toUpperCase();
            
            // Simbolo config
            if (this._configSymbols[token] !== undefined) {
                result &= this._configSymbols[token];
                continue;
            }
            
            // Simbolo utente (EQU)
            if (this.constants[token] !== undefined) {
                result &= this.constants[token];
                continue;
            }
            
            // Valore numerico
            var num = this.parseNumber(parts[i]);
            if (num !== null) {
                result &= num;
                continue;
            }
            
            // Token sconosciuto — warning ma non blocchiamo
            this.warnings.push({ line: lineNum, message: 'Unknown config symbol: ' + parts[i] });
        }

        return result;
    }

    initInstructions() {
        // Instruction encoding table
        this.instructions = {
            // Byte-oriented: 00 xxxx dffffff
            'ADDWF':  { type: 'byte', opcode: 0x0700 },
            'ANDWF':  { type: 'byte', opcode: 0x0500 },
            'CLRF':   { type: 'byte_f', opcode: 0x0180 },
            'CLRW':   { type: 'none', opcode: 0x0100 },
            'COMF':   { type: 'byte', opcode: 0x0900 },
            'DECF':   { type: 'byte', opcode: 0x0300 },
            'DECFSZ': { type: 'byte', opcode: 0x0B00 },
            'INCF':   { type: 'byte', opcode: 0x0A00 },
            'INCFSZ': { type: 'byte', opcode: 0x0F00 },
            'IORWF':  { type: 'byte', opcode: 0x0400 },
            'MOVF':   { type: 'byte', opcode: 0x0800 },
            'MOVWF':  { type: 'byte_f', opcode: 0x0080 },
            'NOP':    { type: 'none', opcode: 0x0000 },
            'RLF':    { type: 'byte', opcode: 0x0D00 },
            'RRF':    { type: 'byte', opcode: 0x0C00 },
            'SUBWF':  { type: 'byte', opcode: 0x0200 },
            'SWAPF':  { type: 'byte', opcode: 0x0E00 },
            'XORWF':  { type: 'byte', opcode: 0x0600 },

            // Bit-oriented: 01 oobbbb fffffff
            'BCF':    { type: 'bit', opcode: 0x1000 },
            'BSF':    { type: 'bit', opcode: 0x1400 },
            'BTFSC':  { type: 'bit', opcode: 0x1800 },
            'BTFSS':  { type: 'bit', opcode: 0x1C00 },

            // Literal: various
            'ADDLW':  { type: 'literal', opcode: 0x3E00 },
            'ANDLW':  { type: 'literal', opcode: 0x3900 },
            'IORLW':  { type: 'literal', opcode: 0x3800 },
            'MOVLW':  { type: 'literal', opcode: 0x3000 },
            'RETLW':  { type: 'literal', opcode: 0x3400 },
            'SUBLW':  { type: 'literal', opcode: 0x3C00 },
            'XORLW':  { type: 'literal', opcode: 0x3A00 },

            // Control
            'CALL':   { type: 'address', opcode: 0x2000 },
            'GOTO':   { type: 'address', opcode: 0x2800 },
            'RETURN': { type: 'none', opcode: 0x0008 },
            'RETFIE': { type: 'none', opcode: 0x0009 },
            'CLRWDT': { type: 'none', opcode: 0x0064 },
            'SLEEP':  { type: 'none', opcode: 0x0063 }
        };
    }

    assemble(source) {
        this.reset();
        
        const lines = source.split('\n');
        
        // Pass 1: collect labels and calculate addresses
        this.pass1(lines);
        
        if (this.errors.length > 0) {
            return this.getResult();
        }
        
        // Pass 2: generate code
        this.pass2(lines);
        
        return this.getResult();
    }

    pass1(lines) {
        this.currentAddress = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            let line = this.preprocessLine(lines[i]);
            
            if (!line) continue;
            
            // Check for label
            const labelMatch = line.match(/^(\w+):(.*)$/);
            if (labelMatch) {
                const label = labelMatch[1].toUpperCase();
                if (this.labels[label] !== undefined) {
                    this.errors.push({ line: lineNum, message: `Duplicate label: ${label}` });
                } else {
                    this.labels[label] = this.currentAddress;
                }
                line = labelMatch[2].trim();
                if (!line) continue;
            }
            
            // Process directives
            const directive = this.processDirective(line, lineNum, true);
            if (directive.handled) {
                if (directive.increment) {
                    this.currentAddress += directive.increment;
                }
                continue;
            }
            
            // Must be an instruction
            const parts = this.parseLine(line);
            if (parts && parts.mnemonic) {
                const instr = this.instructions[parts.mnemonic];
                if (instr) {
                    this.currentAddress++;
                } else {
                    this.errors.push({ line: lineNum, message: `Unknown instruction: ${parts.mnemonic}` });
                }
            }
        }
    }

    pass2(lines) {
        this.currentAddress = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            let line = this.preprocessLine(lines[i]);
            
            if (!line) continue;
            
            // Skip label definition
            const labelMatch = line.match(/^(\w+):(.*)$/);
            if (labelMatch) {
                line = labelMatch[2].trim();
                if (!line) continue;
            }
            
            // Process directives
            const directive = this.processDirective(line, lineNum, false);
            if (directive.handled) {
                if (directive.words) {
                    for (const word of directive.words) {
                        this.emit(word, lineNum);
                    }
                }
                if (directive.setAddress !== undefined) {
                    this.currentAddress = directive.setAddress;
                }
                continue;
            }
            
            // Assemble instruction
            const parts = this.parseLine(line);
            if (parts && parts.mnemonic) {
                const word = this.assembleInstruction(parts, lineNum);
                if (word !== null) {
                    this.emit(word, lineNum);
                }
            }
        }
    }

    preprocessLine(line) {
        // Remove comments
        const semicolonIdx = line.indexOf(';');
        if (semicolonIdx !== -1) {
            line = line.substring(0, semicolonIdx);
        }
        return line.trim();
    }

    processDirective(line, lineNum, isPass1) {
        const upper = line.toUpperCase();
        const parts = line.split(/\s+/);
        const directive = parts[0].toUpperCase();
        
        // ORG directive
        if (directive === 'ORG') {
            const addr = this.parseNumber(parts[1]);
            if (addr === null) {
                this.errors.push({ line: lineNum, message: 'Invalid ORG address' });
                return { handled: true };
            }
            if (isPass1) {
                this.currentAddress = addr;
            }
            return { handled: true, setAddress: addr };
        }
        
        // EQU directive
        if (parts.length >= 3 && parts[1].toUpperCase() === 'EQU') {
            const name = parts[0].toUpperCase();
            const value = this.parseNumber(parts[2]);
            if (value === null) {
                this.errors.push({ line: lineNum, message: `Invalid EQU value: ${parts[2]}` });
            } else {
                this.constants[name] = value;
            }
            return { handled: true };
        }
        
        // CBLOCK / ENDC
        if (directive === 'CBLOCK') {
            const startAddr = parts[1] ? this.parseNumber(parts[1]) : 0x0C;
            this.cblockAddress = startAddr;
            return { handled: true };
        }
        
        if (directive === 'ENDC') {
            this.cblockAddress = undefined;
            return { handled: true };
        }
        
        // Variable in CBLOCK
        if (this.cblockAddress !== undefined && parts[0]) {
            const name = parts[0].toUpperCase();
            this.variables[name] = this.cblockAddress;
            this.cblockAddress++;
            return { handled: true };
        }
        
        // #DEFINE
        if (directive === '#DEFINE' && parts.length >= 3) {
            const name = parts[1].toUpperCase();
            const value = parts.slice(2).join(' ');
            this.constants[name] = value;
            return { handled: true };
        }
        
        // #INCLUDE (simplified - just skip)
        if (directive === '#INCLUDE' || directive === 'INCLUDE') {
            return { handled: true };
        }
        
        // LIST, PROCESSOR - carica simboli device se possibile
        if (directive === 'LIST' || directive === 'PROCESSOR') {
            // Estrai device ID da "LIST P=16F877A" o "PROCESSOR 16F877A"
            var raw = parts.slice(1).join(' ');
            var pMatch = raw.match(/P\s*=\s*(\S+)/i) || raw.match(/^(\S+)/);
            if (pMatch) {
                var devId = pMatch[1].toUpperCase();
                if (devId.indexOf('PIC') !== 0) devId = 'PIC' + devId;
                // Carica simboli se deviceLoader disponibile
                if (this._deviceLoader && this._deviceLoader.devices && this._deviceLoader.devices[devId]) {
                    this.loadDeviceSymbols(devId, this._deviceLoader.devices[devId]);
                }
            }
            return { handled: true };
        }
        
        // __CONFIG directive: salva configuration word per hex
        if (directive === '__CONFIG' || directive === 'CONFIG') {
            var configExpr = parts.slice(1).join(' ').trim();
            // Rimuovi eventuale prefisso "CONFIG =" (sintassi alternativa)
            configExpr = configExpr.replace(/^=\s*/, '');
            
            var configVal = this._parseConfigExpression(configExpr, lineNum);
            if (configVal !== null) {
                this.configWord = configVal & 0x3FFF;
            } else {
                this.errors.push({ line: lineNum, message: 'Invalid __CONFIG value: ' + configExpr });
            }
            return { handled: true };
        }
        
        // RADIX, END (skip)
        if (['RADIX', 'END'].includes(directive)) {
            return { handled: true };
        }
        
        // DW / DATA / DT
        if (['DW', 'DATA', 'DT', 'DE'].includes(directive)) {
            const words = [];
            for (let i = 1; i < parts.length; i++) {
                const values = parts[i].split(',').map(v => v.trim()).filter(v => v);
                for (const val of values) {
                    const num = this.parseNumber(val);
                    if (num !== null) {
                        if (directive === 'DT') {
                            words.push(0x3400 | (num & 0xFF)); // RETLW
                        } else {
                            words.push(num & 0x3FFF);
                        }
                    }
                }
            }
            if (isPass1) {
                return { handled: true, increment: words.length };
            }
            return { handled: true, words: words };
        }
        
        // RES (reserve space)
        if (directive === 'RES') {
            const count = this.parseNumber(parts[1]) || 1;
            if (isPass1) {
                return { handled: true, increment: count };
            }
            const words = new Array(count).fill(0x3FFF);
            return { handled: true, words: words };
        }
        
        return { handled: false };
    }

    parseLine(line) {
        const parts = line.trim().split(/[\s,]+/).filter(p => p);
        if (parts.length === 0) return null;
        
        const mnemonic = parts[0].toUpperCase();
        const operands = parts.slice(1);
        
        return { mnemonic, operands };
    }

    assembleInstruction(parts, lineNum) {
        const { mnemonic, operands } = parts;
        const instr = this.instructions[mnemonic];
        
        if (!instr) {
            this.errors.push({ line: lineNum, message: `Unknown instruction: ${mnemonic}` });
            return null;
        }
        
        let word = instr.opcode;
        
        switch (instr.type) {
            case 'none':
                break;
                
            case 'byte': {
                // f, d format
                const f = this.resolveOperand(operands[0], lineNum);
                let d = 1; // default to F
                if (operands.length > 1) {
                    const dOp = operands[1].toUpperCase();
                    if (dOp === 'W' || dOp === '0') d = 0;
                    else if (dOp === 'F' || dOp === '1') d = 1;
                    else d = this.resolveOperand(operands[1], lineNum);
                }
                if (f === null) return null;
                word |= (d << 7) | (f & 0x7F);
                break;
            }
            
            case 'byte_f': {
                // f only (CLRF, MOVWF)
                const f = this.resolveOperand(operands[0], lineNum);
                if (f === null) return null;
                word |= (f & 0x7F);
                break;
            }
            
            case 'bit': {
                // f, b format
                const f = this.resolveOperand(operands[0], lineNum);
                const b = this.resolveOperand(operands[1], lineNum);
                if (f === null || b === null) return null;
                word |= ((b & 0x07) << 7) | (f & 0x7F);
                break;
            }
            
            case 'literal': {
                // k format
                const k = this.resolveOperand(operands[0], lineNum);
                if (k === null) return null;
                word |= (k & 0xFF);
                break;
            }
            
            case 'address': {
                // 11-bit address
                let addr = this.resolveOperand(operands[0], lineNum);
                if (addr === null) return null;
                word |= (addr & 0x7FF);
                break;
            }
        }
        
        return word;
    }

    resolveOperand(operand, lineNum) {
        if (operand === undefined || operand === null) {
            this.errors.push({ line: lineNum, message: 'Missing operand' });
            return null;
        }
        
        const upper = operand.toUpperCase();
        
        // Check constants first
        if (this.constants[upper] !== undefined) {
            const val = this.constants[upper];
            if (typeof val === 'string') {
                return this.parseNumber(val);
            }
            return val;
        }
        
        // Check labels
        if (this.labels[upper] !== undefined) {
            return this.labels[upper];
        }
        
        // Check variables
        if (this.variables[upper] !== undefined) {
            return this.variables[upper];
        }
        
        // Check register names
        if (this.registers[upper] !== undefined) {
            return this.registers[upper];
        }
        
        // Try parsing as number
        const num = this.parseNumber(operand);
        if (num !== null) {
            return num;
        }
        
        // Check for expression (simple subtraction/addition)
        const exprMatch = operand.match(/^(\w+)\s*([+-])\s*(\w+)$/);
        if (exprMatch) {
            const left = this.resolveOperand(exprMatch[1], lineNum);
            const right = this.resolveOperand(exprMatch[3], lineNum);
            if (left !== null && right !== null) {
                return exprMatch[2] === '+' ? left + right : left - right;
            }
        }
        
        this.errors.push({ line: lineNum, message: `Cannot resolve operand: ${operand}` });
        return null;
    }

    parseNumber(str) {
        if (!str) return null;
        str = str.trim().toUpperCase();
        
        // Hex: 0x, H', $
        if (str.startsWith('0X')) return parseInt(str.substring(2), 16);
        if (str.startsWith('H\'') && str.endsWith('\'')) return parseInt(str.slice(2, -1), 16);
        if (str.startsWith('$')) return parseInt(str.substring(1), 16);
        if (str.endsWith('H')) return parseInt(str.slice(0, -1), 16);
        
        // Binary: 0b, B', %
        if (str.startsWith('0B')) return parseInt(str.substring(2), 2);
        if (str.startsWith('B\'') && str.endsWith('\'')) return parseInt(str.slice(2, -1), 2);
        if (str.startsWith('%')) return parseInt(str.substring(1), 2);
        
        // Octal: O', 0o
        if (str.startsWith('O\'') && str.endsWith('\'')) return parseInt(str.slice(2, -1), 8);
        if (str.startsWith('0O')) return parseInt(str.substring(2), 8);
        
        // Decimal: D', .
        if (str.startsWith('D\'') && str.endsWith('\'')) return parseInt(str.slice(2, -1), 10);
        if (str.startsWith('.')) return parseInt(str.substring(1), 10);
        
        // Character: A'x' or 'x'
        if ((str.startsWith('A\'') || str.startsWith('\'')) && str.endsWith('\'')) {
            const char = str.startsWith('A\'') ? str.charAt(2) : str.charAt(1);
            return char.charCodeAt(0);
        }
        
        // Plain decimal
        const num = parseInt(str, 10);
        return isNaN(num) ? null : num;
    }

    emit(word, lineNum) {
        while (this.programMemory.length < this.currentAddress) {
            this.programMemory.push(0x3FFF);
        }
        this.programMemory[this.currentAddress] = word & 0x3FFF;
        this.sourceMap[this.currentAddress] = lineNum;
        
        this.listing.push({
            address: this.currentAddress,
            word: word & 0x3FFF,
            line: lineNum
        });
        
        this.currentAddress++;
    }

    getResult() {
        return {
            success: this.errors.length === 0,
            programMemory: this.programMemory,
            errors: this.errors,
            warnings: this.warnings,
            labels: this.labels,
            constants: this.constants,
            variables: this.variables,
            sourceMap: this.sourceMap,
            listing: this.listing
        };
    }

    // Generate Intel HEX format (INHX8M - standard Microchip)
    toIntelHex() {
        const lines = [];
        const wordsPerRecord = 8; // 8 words = 16 bytes per record
        
        // Trova ultimo word usato
        let lastUsed = 0;
        for (let i = 0; i < this.programMemory.length; i++) {
            if (this.programMemory[i] !== undefined && this.programMemory[i] !== 0x3FFF) {
                lastUsed = i;
            }
        }
        
        for (let i = 0; i <= lastUsed; i += wordsPerRecord) {
            const chunk = [];
            const byteAddr = i * 2; // PIC usa byte addressing nel HEX
            
            // Quante word in questo record
            const count = Math.min(wordsPerRecord, lastUsed - i + 1);
            
            for (let j = 0; j < count; j++) {
                const word = this.programMemory[i + j] || 0x3FFF;
                chunk.push(word & 0xFF);          // low byte first (little-endian)
                chunk.push((word >> 8) & 0x3F);   // high byte (14-bit max)
            }
            
            if (chunk.length === 0) continue;
            
            // Costruisci record Intel HEX
            // :BBAAAA00[DD...]CC
            // BB = byte count, AAAA = address, 00 = data record, DD = data, CC = checksum
            const byteCount = chunk.length;
            let checksum = byteCount;
            checksum += (byteAddr >> 8) & 0xFF;
            checksum += byteAddr & 0xFF;
            checksum += 0x00; // record type
            
            let line = ':';
            line += byteCount.toString(16).padStart(2, '0').toUpperCase();
            line += byteAddr.toString(16).padStart(4, '0').toUpperCase();
            line += '00';
            
            for (const byte of chunk) {
                line += byte.toString(16).padStart(2, '0').toUpperCase();
                checksum += byte;
            }
            
            checksum = ((~checksum) + 1) & 0xFF;
            line += checksum.toString(16).padStart(2, '0').toUpperCase();
            
            lines.push(line);
        }
        
        // EOF record
        lines.push(':00000001FF');
        
        // Se c'è una config word, inseriscila prima dell'EOF
        if (this.configWord !== null) {
            // Config word a indirizzo 0x2007 (byte addr = 0x400E)
            var cfgByteAddr = this.configAddr * 2;
            var cfgLow = this.configWord & 0xFF;
            var cfgHigh = (this.configWord >> 8) & 0x3F;
            var cfgChecksum = 2; // byte count
            cfgChecksum += (cfgByteAddr >> 8) & 0xFF;
            cfgChecksum += cfgByteAddr & 0xFF;
            cfgChecksum += 0x00; // record type
            cfgChecksum += cfgLow;
            cfgChecksum += cfgHigh;
            cfgChecksum = ((~cfgChecksum) + 1) & 0xFF;
            
            var cfgLine = ':02' +
                cfgByteAddr.toString(16).padStart(4, '0').toUpperCase() +
                '00' +
                cfgLow.toString(16).padStart(2, '0').toUpperCase() +
                cfgHigh.toString(16).padStart(2, '0').toUpperCase() +
                cfgChecksum.toString(16).padStart(2, '0').toUpperCase();
            
            // Inserisci prima dell'EOF
            lines.splice(lines.length - 1, 0, cfgLine);
        }
        
        return lines.join('\n') + '\n';
    }

    /**
     * Genera file .map con mappa simboli, indirizzi e utilizzo memoria.
     * @param {string} deviceId - Nome device (es. "PIC16F84A")
     * @param {number} clockFreq - Frequenza clock in Hz
     * @param {object} deviceSpec - DeviceLoader per info device (opzionale)
     * @returns {string} Contenuto del file .map
     */
    toMapFile(deviceId = 'PIC16F84A', clockFreq = 4000000, deviceSpec = null) {
        const lines = [];
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
        const report = this.getMemoryReport(deviceSpec);

        // === HEADER ===
        lines.push(';==========================================================');
        lines.push('; WebPicSimulator - Memory Map File');
        lines.push('; Generated: ' + timestamp);
        lines.push(';==========================================================');
        lines.push('; Device:    ' + deviceId);
        lines.push('; Clock:     ' + this.formatFrequency(clockFreq));
        lines.push('; Assembler: WebPicSimulator v2.2');
        lines.push('');

        // === MEMORY USAGE SUMMARY ===
        lines.push(';----------------------------------------------------------');
        lines.push('; MEMORY USAGE');
        lines.push(';----------------------------------------------------------');
        lines.push(';');
        lines.push(';  Flash:  ' + this.padRight(report.flash.used + ' / ' + report.flash.total + ' words', 20) + '(' + report.flash.percent + '%)');
        lines.push(';  RAM:    ' + this.padRight(report.ram.used + ' / ' + report.ram.total + ' bytes GPR', 20) + '(' + report.ram.percent + '%)');
        lines.push(';  EEPROM: ' + this.padRight(report.eeprom.used + ' / ' + report.eeprom.total + ' bytes', 20) + '(' + report.eeprom.percent + '%)');
        lines.push(';  Stack:  ' + report.stack.depth + ' / ' + report.stack.max + ' levels' + (report.stack.warning ? '  ** WARNING: near limit **' : ''));
        lines.push('');

        // === PROGRAM MEMORY MAP ===
        lines.push(';----------------------------------------------------------');
        lines.push('; PROGRAM MEMORY');
        lines.push(';----------------------------------------------------------');
        lines.push('; Addr  Opcode  Instruction          Source');
        lines.push(';----------------------------------------------------------');

        // Trova ultimo word usato
        let lastUsed = 0;
        for (let i = 0; i < this.programMemory.length; i++) {
            if (this.programMemory[i] !== undefined && this.programMemory[i] !== 0x3FFF) {
                lastUsed = i;
            }
        }

        // Mappa inversa: indirizzo → label
        const addrToLabel = {};
        for (const [name, addr] of Object.entries(this.labels)) {
            if (!addrToLabel[addr]) addrToLabel[addr] = [];
            addrToLabel[addr].push(name);
        }

        for (let i = 0; i <= lastUsed; i++) {
            const word = this.programMemory[i];
            if (word === undefined) continue;

            // Label su questa riga?
            if (addrToLabel[i]) {
                lines.push('');
                for (const label of addrToLabel[i]) {
                    lines.push(label + ':');
                }
            }

            const addr = '0x' + i.toString(16).toUpperCase().padStart(3, '0');
            const opcode = '0x' + word.toString(16).toUpperCase().padStart(4, '0');
            const disasm = PIC16Assembler.disassemble(word, i);
            const sourceLine = this.sourceMap[i] || '';
            const sourceRef = sourceLine ? '[L' + sourceLine + ']' : '';

            lines.push('  ' + addr + '  ' + opcode + '  ' + this.padRight(disasm, 22) + sourceRef);
        }
        lines.push('');

        // === LABELS ===
        lines.push(';----------------------------------------------------------');
        lines.push('; LABELS');
        lines.push(';----------------------------------------------------------');

        const sortedLabels = Object.entries(this.labels)
            .sort((a, b) => a[1] - b[1]);

        if (sortedLabels.length > 0) {
            for (const [name, addr] of sortedLabels) {
                lines.push('  ' + this.padRight(name, 20) + '= 0x' + addr.toString(16).toUpperCase().padStart(4, '0'));
            }
        } else {
            lines.push(';  (none)');
        }
        lines.push('');

        // === VARIABLES (GPR) ===
        lines.push(';----------------------------------------------------------');
        lines.push('; VARIABLES (GPR)');
        lines.push(';----------------------------------------------------------');

        const sortedVars = Object.entries(this.variables)
            .sort((a, b) => a[1] - b[1]);

        if (sortedVars.length > 0) {
            for (const [name, addr] of sortedVars) {
                lines.push('  ' + this.padRight(name, 20) + '= 0x' + addr.toString(16).toUpperCase().padStart(2, '0'));
            }
        } else {
            lines.push(';  (none)');
        }
        lines.push('');

        // === CONSTANTS (EQU) ===
        lines.push(';----------------------------------------------------------');
        lines.push('; CONSTANTS (EQU / #DEFINE)');
        lines.push(';----------------------------------------------------------');

        const sortedConsts = Object.entries(this.constants)
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

        if (sortedConsts.length > 0) {
            for (const [name, value] of sortedConsts) {
                const valStr = typeof value === 'number'
                    ? '= 0x' + value.toString(16).toUpperCase().padStart(2, '0') + '  (' + value + ')'
                    : '= ' + value;
                lines.push('  ' + this.padRight(name, 20) + valStr);
            }
        } else {
            lines.push(';  (none)');
        }
        lines.push('');

        // === CROSS-REFERENCE ===
        lines.push(';----------------------------------------------------------');
        lines.push('; CROSS-REFERENCE (label usage)');
        lines.push(';----------------------------------------------------------');

        // Trova dove ogni label è usata (CALL/GOTO target)
        for (const [name, targetAddr] of sortedLabels) {
            const usedAt = [];
            for (let i = 0; i <= lastUsed; i++) {
                const word = this.programMemory[i];
                if (word === undefined) continue;

                // CALL o GOTO che puntano a targetAddr
                const isCall = (word >> 11) === 0x04;
                const isGoto = (word >> 11) === 0x05;
                if (isCall || isGoto) {
                    const dest = word & 0x7FF;
                    if (dest === (targetAddr & 0x7FF)) {
                        usedAt.push('0x' + i.toString(16).toUpperCase().padStart(3, '0'));
                    }
                }
            }
            if (usedAt.length > 0) {
                lines.push('  ' + this.padRight(name, 16) + 'called/jumped from: ' + usedAt.join(', '));
            }
        }
        lines.push('');

        // === FOOTER ===
        lines.push(';----------------------------------------------------------');
        lines.push('; End of map file');
        lines.push(';----------------------------------------------------------');
        lines.push('');

        return lines.join('\n');
    }

    // Utility: pad string a destra
    padRight(str, len) {
        str = String(str);
        return str.length >= len ? str : str + ' '.repeat(len - str.length);
    }

    // Utility: formatta frequenza leggibile
    formatFrequency(hz) {
        if (hz >= 1000000) return (hz / 1000000) + ' MHz';
        if (hz >= 1000) return (hz / 1000) + ' kHz';
        return hz + ' Hz';
    }

    // Disassemble a single word
    static disassemble(word, address = 0) {
        word &= 0x3FFF;
        
        // Control
        if (word === 0x0008) return 'RETURN';
        if (word === 0x0009) return 'RETFIE';
        if (word === 0x0064) return 'CLRWDT';
        if (word === 0x0063) return 'SLEEP';
        if (word === 0x0000) return 'NOP';
        
        // CLRW
        if ((word & 0xFF80) === 0x0100) return 'CLRW';
        
        // CLRF
        if ((word & 0xFF80) === 0x0180) {
            const f = word & 0x7F;
            return `CLRF 0x${f.toString(16).toUpperCase()}`;
        }
        
        // MOVWF
        if ((word & 0xFF80) === 0x0080) {
            const f = word & 0x7F;
            return `MOVWF 0x${f.toString(16).toUpperCase()}`;
        }
        
        // Bit-oriented
        if ((word >> 12) === 0x01) {
            const f = word & 0x7F;
            const b = (word >> 7) & 0x07;
            const op = (word >> 10) & 0x03;
            const ops = ['BCF', 'BSF', 'BTFSC', 'BTFSS'];
            return `${ops[op]} 0x${f.toString(16).toUpperCase()}, ${b}`;
        }
        
        // CALL
        if ((word >> 11) === 0x04) {
            const k = word & 0x7FF;
            return `CALL 0x${k.toString(16).toUpperCase()}`;
        }
        
        // GOTO
        if ((word >> 11) === 0x05) {
            const k = word & 0x7FF;
            return `GOTO 0x${k.toString(16).toUpperCase()}`;
        }
        
        // MOVLW
        if ((word >> 10) === 0x0C) {
            const k = word & 0xFF;
            return `MOVLW 0x${k.toString(16).toUpperCase()}`;
        }
        
        // RETLW
        if ((word >> 10) === 0x0D) {
            const k = word & 0xFF;
            return `RETLW 0x${k.toString(16).toUpperCase()}`;
        }
        
        // Literal
        if ((word >> 11) === 0x07) {
            const k = word & 0xFF;
            const op = (word >> 8) & 0x07;
            const ops = { 0: 'IORLW', 1: 'ANDLW', 2: 'XORLW', 4: 'SUBLW', 5: 'SUBLW', 6: 'ADDLW', 7: 'ADDLW' };
            if (ops[op]) return `${ops[op]} 0x${k.toString(16).toUpperCase()}`;
        }
        
        // Byte-oriented
        if ((word >> 12) === 0x00) {
            const f = word & 0x7F;
            const d = (word >> 7) & 0x01;
            const op = (word >> 8) & 0x0F;
            const dStr = d ? 'F' : 'W';
            const ops = {
                0x02: 'SUBWF', 0x03: 'DECF', 0x04: 'IORWF', 0x05: 'ANDWF',
                0x06: 'XORWF', 0x07: 'ADDWF', 0x08: 'MOVF', 0x09: 'COMF',
                0x0A: 'INCF', 0x0B: 'DECFSZ', 0x0C: 'RRF', 0x0D: 'RLF',
                0x0E: 'SWAPF', 0x0F: 'INCFSZ'
            };
            if (ops[op]) return `${ops[op]} 0x${f.toString(16).toUpperCase()}, ${dStr}`;
        }
        
        return `DW 0x${word.toString(16).toUpperCase()}`;
    }

    // === MEMORY REPORT ===

    /**
     * Genera report sull'utilizzo memoria dopo assembly riuscito.
     * @param {object} deviceSpec - Specifiche device dal DeviceLoader (opzionale)
     * @returns {object} Report con flash, ram, eeprom, stack info
     */
    getMemoryReport(deviceData) {
        // Dimensioni device dal JSON (default PIC16F84A)
        var mem = deviceData && deviceData.memory ? deviceData.memory : {};
        var flashTotal = (mem.program && mem.program.size) || 1024;
        var gprTotal = (mem.ram && mem.ram.total) || 68;
        var eepromTotal = (mem.eeprom && mem.eeprom.size) || 64;
        var stackMax = 8;

        // Flash: ultimo indirizzo usato
        var flashUsed = 0;
        for (var i = 0; i < this.programMemory.length; i++) {
            if (this.programMemory[i] !== undefined && this.programMemory[i] !== 0x3FFF) {
                flashUsed = i + 1;
            }
        }

        // RAM GPR: variabili dichiarate con CBLOCK
        var gprUsed = Object.keys(this.variables).length;

        // EEPROM: direttive DE
        var eepromUsed = 0;
        for (var j = 0; j < this.listing.length; j++) {
            if (this.listing[j] && this.listing[j].directive === 'DE') {
                eepromUsed += this.listing[j].count || 1;
            }
        }

        // Stack depth: analisi statica
        var stackDepth = this.estimateStackDepth();

        // Overflow detection
        var warnings = [];
        var flashOverflow = flashUsed > flashTotal;
        var ramOverflow = gprUsed > gprTotal;
        var eepromOverflow = eepromUsed > eepromTotal;
        var stackOverflow = stackDepth > stackMax;

        if (flashOverflow) warnings.push('FLASH OVERFLOW: ' + flashUsed + '/' + flashTotal + ' words');
        if (ramOverflow) warnings.push('RAM OVERFLOW: ' + gprUsed + '/' + gprTotal + ' variables');
        if (eepromOverflow) warnings.push('EEPROM OVERFLOW: ' + eepromUsed + '/' + eepromTotal + ' bytes');
        if (stackOverflow) warnings.push('STACK OVERFLOW: ' + stackDepth + ' levels (max ' + stackMax + ')');

        // Percentuali
        var flashPercent = flashTotal > 0 ? (flashUsed / flashTotal * 100) : 0;
        var gprPercent = gprTotal > 0 ? (gprUsed / gprTotal * 100) : 0;
        var eepromPercent = eepromTotal > 0 ? (eepromUsed / eepromTotal * 100) : 0;

        return {
            flash: {
                used: flashUsed, total: flashTotal,
                percent: Math.round(flashPercent * 10) / 10,
                free: flashTotal - flashUsed,
                overflow: flashOverflow
            },
            ram: {
                used: gprUsed, total: gprTotal,
                percent: Math.round(gprPercent * 10) / 10,
                free: gprTotal - gprUsed,
                overflow: ramOverflow,
                variables: Object.assign({}, this.variables)
            },
            eeprom: {
                used: eepromUsed, total: eepromTotal,
                percent: Math.round(eepromPercent * 10) / 10,
                free: eepromTotal - eepromUsed,
                overflow: eepromOverflow
            },
            stack: {
                depth: stackDepth, max: stackMax,
                warning: stackDepth >= stackMax,
                overflow: stackOverflow
            },
            labels: Object.keys(this.labels).length,
            constants: Object.keys(this.constants).length,
            warnings: warnings,
            hasOverflow: flashOverflow || ramOverflow || eepromOverflow || stackOverflow,
            config: this.configWord !== null ? {
                word: this.configWord,
                hex: '0x' + this.configWord.toString(16).toUpperCase().padStart(4, '0'),
                address: '0x' + this.configAddr.toString(16).toUpperCase()
            } : null,
            deviceName: deviceData ? deviceData.device : 'PIC16F84A'
        };
    }

    /**
     * Stima la profondità massima dello stack analizzando le CALL.
     * Analisi statica: segue il grafo delle chiamate.
     */
    estimateStackDepth() {
        // Trova tutte le istruzioni CALL e i loro target
        const calls = {};    // indirizzo label → [indirizzi chiamati]
        const isCall = [];   // indice PM → indirizzo target se CALL
        
        for (let i = 0; i < this.programMemory.length; i++) {
            const word = this.programMemory[i];
            if (word === undefined) continue;
            
            // CALL: 10 0kkk kkkk kkkk (bit 13-11 = 100)
            if ((word >> 11) === 0x04) {
                const target = word & 0x7FF;
                isCall[i] = target;
            }
        }

        // Trova a quale funzione appartiene ogni indirizzo
        // Usa le labels come entry point delle funzioni
        const funcForAddr = {};
        const sortedLabels = Object.entries(this.labels)
            .sort((a, b) => a[1] - b[1]);
        
        for (let li = 0; li < sortedLabels.length; li++) {
            const [name, addr] = sortedLabels[li];
            const nextAddr = li < sortedLabels.length - 1 
                ? sortedLabels[li + 1][1] 
                : this.programMemory.length;
            
            for (let a = addr; a < nextAddr; a++) {
                funcForAddr[a] = name;
            }
        }

        // Costruisci grafo chiamate: funzione → [funzioni chiamate]
        const callGraph = {};
        for (const [addr, target] of Object.entries(isCall)) {
            const caller = funcForAddr[parseInt(addr)] || '__main';
            const callee = funcForAddr[target] || `__addr_${target}`;
            
            if (!callGraph[caller]) callGraph[caller] = new Set();
            callGraph[caller].add(callee);
        }

        // DFS per trovare profondità massima
        const maxDepth = (func, visited = new Set()) => {
            if (visited.has(func)) return 0; // Ricorsione → non contare di nuovo
            visited.add(func);
            
            const callees = callGraph[func];
            if (!callees || callees.size === 0) return 0;
            
            let max = 0;
            for (const callee of callees) {
                max = Math.max(max, 1 + maxDepth(callee, new Set(visited)));
            }
            return max;
        };

        // Calcola dal main (o dalla prima label, o da indirizzo 0)
        let depth = 0;
        const entryPoints = Object.keys(callGraph);
        for (const entry of entryPoints) {
            depth = Math.max(depth, maxDepth(entry));
        }

        // +1 se c'è almeno un interrupt handler (indirizzo 0x04)
        if (this.labels['ISR'] || this.programMemory[4] !== undefined && this.programMemory[4] !== 0x3FFF) {
            depth = Math.min(depth + 1, 8);
        }

        return depth;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16Assembler;
}
