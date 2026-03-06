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
    }

    initRegisters() {
        // Standard SFR names
        this.registers = {
            'INDF':    0x00, 'TMR0':    0x01, 'PCL':     0x02, 'STATUS':  0x03,
            'FSR':     0x04, 'PORTA':   0x05, 'PORTB':   0x06, 'EEDATA':  0x08,
            'EEADR':   0x09, 'PCLATH':  0x0A, 'INTCON':  0x0B,
            'OPTION_REG': 0x81, 'TRISA': 0x85, 'TRISB':  0x86,
            'EECON1':  0x88, 'EECON2':  0x89,
            // Bit names - STATUS
            'C': 0, 'DC': 1, 'Z': 2, 'PD': 3, 'TO': 4, 'RP0': 5, 'RP1': 6, 'IRP': 7,
            // Bit names - INTCON
            'RBIF': 0, 'INTF': 1, 'T0IF': 2, 'RBIE': 3, 'INTE': 4, 'T0IE': 5, 'EEIE': 6, 'GIE': 7,
            // Bit names - OPTION_REG
            'PS0': 0, 'PS1': 1, 'PS2': 2, 'PSA': 3, 'T0SE': 4, 'T0CS': 5, 'INTEDG': 6, 'RBPU': 7,
            // Bit names - EECON1
            'RD': 0, 'WR': 1, 'WREN': 2, 'WRERR': 3, 'EEIF': 4,
            // Destination
            'W': 0, 'F': 1
        };
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
        
        // LIST, PROCESSOR, __CONFIG (skip)
        if (['LIST', 'PROCESSOR', '__CONFIG', 'CONFIG', 'RADIX', 'END'].includes(directive)) {
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

    // Generate Intel HEX format
    toIntelHex() {
        const lines = [];
        const recordSize = 16; // bytes per line (8 words)
        
        for (let i = 0; i < this.programMemory.length; i += recordSize / 2) {
            const chunk = [];
            const addr = i * 2; // byte address
            
            for (let j = 0; j < recordSize / 2 && i + j < this.programMemory.length; j++) {
                const word = this.programMemory[i + j];
                chunk.push(word & 0xFF);        // low byte
                chunk.push((word >> 8) & 0x3F); // high byte
            }
            
            if (chunk.length === 0) continue;
            
            let line = ':';
            const byteCount = chunk.length;
            let checksum = byteCount;
            
            line += byteCount.toString(16).padStart(2, '0').toUpperCase();
            line += addr.toString(16).padStart(4, '0').toUpperCase();
            checksum += (addr >> 8) & 0xFF;
            checksum += addr & 0xFF;
            
            line += '00'; // data record
            
            for (const byte of chunk) {
                line += byte.toString(16).padStart(2, '0').toUpperCase();
                checksum += byte;
            }
            
            checksum = ((~checksum) + 1) & 0xFF;
            line += checksum.toString(16).padStart(2, '0').toUpperCase();
            
            lines.push(line);
        }
        
        lines.push(':00000001FF'); // EOF
        return lines.join('\n');
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
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16Assembler;
}
