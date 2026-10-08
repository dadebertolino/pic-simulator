/**
 * PIC16 Assembler
 * Assembla codice sorgente ASM in codice macchina 14-bit
 */

class PIC16Assembler {
    constructor() {
        this.reset();
        this.initInstructions();
        this.initRegisters();
        this.initDirectives();
    }

    reset() {
        this.programMemory = [];
        this.eepromData = [];   // DE a 0x2100-0x213F: contenuto iniziale della EEPROM
        this.labels = {};
        this.constants = {};
        this.variables = {};
        this.currentAddress = 0;
        this.errors = [];
        this.warnings = [];
        this.sourceMap = {}; // address -> line number
        this.listing = [];
        this.cblockAddress = undefined; // CBLOCK aperto (undefined = nessuno)
        this.cblockNext = 0x0C;         // dove riparte un CBLOCK senza indirizzo
        this.radix = 10;
        this.overflowLine = null;
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
            'NOT_PD': 3, 'NOT_TO': 4,
            // Bit names - INTCON
            'RBIF': 0, 'INTF': 1, 'T0IF': 2, 'RBIE': 3, 'INTE': 4, 'T0IE': 5, 'EEIE': 6, 'GIE': 7,
            'TMR0IF': 2, 'TMR0IE': 5,
            // Bit names - OPTION_REG
            'PS0': 0, 'PS1': 1, 'PS2': 2, 'PSA': 3, 'T0SE': 4, 'T0CS': 5, 'INTEDG': 6, 'RBPU': 7,
            'NOT_RBPU': 7,
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

    initDirectives() {
        // Servono a distinguere un'etichetta in colonna 1 senza due punti
        // (stile MPASM) da una direttiva scritta senza rientro.
        this.directives = new Set([
            'ORG', 'EQU', 'SET', 'CBLOCK', 'ENDC', 'END', 'RADIX',
            '#INCLUDE', 'INCLUDE', 'LIST', 'NOLIST', 'PROCESSOR', '__CONFIG', 'CONFIG', 'ERRORLEVEL',
            'DW', 'DATA', 'DT', 'DE', 'RES', 'BANKSEL'
        ]);
    }

    assemble(source) {
        this.reset();

        const lines = this.preprocess(source.split('\n'));

        // Pass 1: collect labels and calculate addresses
        this.runPass(lines, true);

        if (this.cblockAddress !== undefined) {
            // Senza ENDC ogni riga successiva verrebbe scambiata per una
            // variabile e il programma risulterebbe vuoto senza spiegazione.
            this.errors.push({ line: lines.length, message: 'CBLOCK senza ENDC' });
            this.cblockAddress = undefined;
        }

        if (this.errors.length > 0) {
            return this.getResult();
        }

        // Pass 2: generate code
        this.runPass(lines, false);

        return this.getResult();
    }

    /**
     * Le due passate leggono le righe allo stesso modo; la prima conta le
     * parole e definisce le etichette, la seconda valuta gli operandi ed
     * emette il codice. Tenerle in un unico ciclo evita che divergano: se
     * la prima contasse una parola che la seconda non emette, tutte le
     * etichette successive punterebbero all'istruzione sbagliata.
     */
    runPass(lines, isPass1) {
        this.currentAddress = 0;
        this.radix = 10;
        this.cblockAddress = undefined;
        this.cblockNext = 0x0C;

        for (let i = 0; i < lines.length; i++) {
            const lineNum = i + 1;
            const raw = lines[i];
            if (!raw.trim()) continue;

            if (this.cblockAddress !== undefined) {
                this.processCblockLine(raw.trim(), lineNum, isPass1);
                continue;
            }

            const { label, body } = this.splitLabel(raw);
            if (label && isPass1) {
                if (this.labels[label] !== undefined) {
                    this.errors.push({ line: lineNum, message: `Duplicate label: ${label}` });
                } else {
                    this.labels[label] = this.currentAddress;
                }
            }
            if (!body) continue;

            const directive = this.processDirective(body, lineNum, isPass1);
            if (directive.end) break;
            if (directive.handled) continue;

            this.processInstruction(body, lineNum, isPass1);
        }
    }

    // === PREPROCESSING ===

    /**
     * Toglie i commenti e risolve #define. In MPASM #define e' una
     * sostituzione testuale, quindi "#define LED PORTB,0" seguito da
     * "BSF LED" diventa "BSF PORTB,0". Le righe di definizione restano,
     * vuote, perche' i numeri di riga degli errori non si spostino.
     */
    preprocess(lines) {
        const defines = {};
        return lines.map(raw => {
            const line = this.stripComment(raw);

            const def = line.match(/^\s*#define\s+([A-Za-z_]\w*)\s*(.*)$/i);
            if (def) {
                defines[def[1].toUpperCase()] = this.substituteDefines(def[2].trim(), defines);
                return '';
            }

            const undef = line.match(/^\s*#undefine\s+([A-Za-z_]\w*)\s*$/i);
            if (undef) {
                delete defines[undef[1].toUpperCase()];
                return '';
            }

            return this.substituteDefines(line, defines);
        });
    }

    substituteDefines(line, defines) {
        if (Object.keys(defines).length === 0) return line;
        // Solo parole intere, e mai dentro i letterali tra apici.
        return line.replace(/'[^']*'|"[^"]*"|\b[A-Za-z_]\w*\b/g, tok => {
            const key = tok.toUpperCase();
            return Object.prototype.hasOwnProperty.call(defines, key) ? defines[key] : tok;
        });
    }

    stripComment(line) {
        // Un ';' tra apici (MOVLW ';') non apre un commento.
        let quote = null;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (quote) {
                if (ch === quote) quote = null;
            } else if (ch === '"' || ch === '\'') {
                quote = ch;
            } else if (ch === ';') {
                return line.substring(0, i);
            }
        }
        return line;
    }

    /**
     * Separa l'etichetta dal resto della riga. Accetta sia "LOOP:" sia lo
     * stile MPASM con l'etichetta in colonna 1 senza due punti; in questo
     * caso il nome non deve essere un'istruzione o una direttiva, e non
     * deve introdurre un EQU/SET.
     */
    splitLabel(raw) {
        const line = raw.replace(/\s+$/, '');

        const colon = line.match(/^\s*([A-Za-z_]\w*):(.*)$/);
        if (colon) {
            return { label: colon[1].toUpperCase(), body: colon[2].trim() };
        }

        const col1 = line.match(/^([A-Za-z_]\w*)(?:\s+(.*))?$/);
        if (col1) {
            const name = col1[1].toUpperCase();
            const rest = (col1[2] || '').trim();
            const next = rest.split(/\s+/)[0].toUpperCase();
            if (!this.instructions[name] && !this.directives.has(name) && next !== 'EQU' && next !== 'SET') {
                return { label: name, body: rest };
            }
        }

        return { label: null, body: line.trim() };
    }

    // === DIRECTIVES ===

    processDirective(line, lineNum, isPass1) {
        const [, first, restRaw] = line.match(/^(\S+)\s*(.*)$/);
        const directive = first.toUpperCase();
        const rest = restRaw.trim();

        // NAME EQU expr / NAME SET expr
        const assign = rest.match(/^(EQU|SET)(?:\s+(.*))?$/i);
        if (assign) {
            if (!/^[A-Za-z_]\w*$/.test(first)) {
                this.errors.push({ line: lineNum, message: `Invalid symbol name: ${first}` });
                return { handled: true };
            }
            const value = this.evaluate(assign[2], lineNum);
            if (value !== null) {
                this.constants[directive] = value;
            }
            return { handled: true };
        }

        switch (directive) {
            case 'ORG': {
                const addr = this.evaluate(rest, lineNum);
                if (addr !== null) {
                    if (addr < 0) {
                        this.errors.push({ line: lineNum, message: `Invalid ORG address: ${rest}` });
                    } else {
                        this.currentAddress = addr;
                    }
                }
                return { handled: true };
            }

            case 'CBLOCK': {
                let start = this.cblockNext;
                if (rest) {
                    const value = this.evaluate(rest, lineNum);
                    if (value !== null) start = value;
                }
                this.cblockAddress = start;
                return { handled: true };
            }

            case 'ENDC':
                this.errors.push({ line: lineNum, message: 'ENDC senza CBLOCK' });
                return { handled: true };

            case 'END':
                // Come MPASM: quel che segue END non viene assemblato.
                return { handled: true, end: true };

            case 'RADIX':
                this.setRadix(rest, lineNum);
                return { handled: true };

            case 'LIST': {
                const radix = rest.match(/\bR\s*=\s*(\w+)/i);
                if (radix) this.setRadix(radix[1], lineNum);
                return { handled: true };
            }

            // Accettate e ignorate: non cambiano il codice simulato.
            case '#INCLUDE':
            case 'INCLUDE':
            case 'NOLIST':
            case 'PROCESSOR':
            case '__CONFIG':
            case 'CONFIG':
            case 'ERRORLEVEL':
                return { handled: true };

            case 'DW':
            case 'DATA':
            case 'DT':
            case 'DE':
                this.processData(directive, rest, lineNum, isPass1);
                return { handled: true };

            case 'RES': {
                const count = this.evaluate(rest, lineNum);
                if (count !== null) {
                    if (count < 0) {
                        this.errors.push({ line: lineNum, message: `Invalid RES count: ${rest}` });
                    } else {
                        for (let i = 0; i < count; i++) this.output(0x3FFF, lineNum, isPass1, true);
                    }
                }
                return { handled: true };
            }

            case 'BANKSEL': {
                // Sul 16F84A il banco dipende solo da RP0: una sola istruzione.
                if (isPass1) {
                    this.output(0, lineNum, true);
                    return { handled: true };
                }
                const addr = this.evalRange(rest, 0, 0xFF, 'File register', lineNum);
                const word = (addr !== null && (addr & 0x80) ? 0x1400 : 0x1000) | (5 << 7) | 0x03;
                this.output(word, lineNum, false);
                return { handled: true };
            }
        }

        return { handled: false };
    }

    processCblockLine(line, lineNum, isPass1) {
        if (/^ENDC\b/i.test(line)) {
            this.cblockNext = this.cblockAddress;
            this.cblockAddress = undefined;
            return;
        }

        // Una o piu' variabili per riga, separate da virgole; "NOME:n"
        // riserva n byte.
        for (const item of this.splitArgs(line)) {
            const m = item.match(/^([A-Za-z_]\w*)\s*(?::\s*(.+))?$/);
            if (!m) {
                this.errors.push({ line: lineNum, message: `Invalid CBLOCK entry: ${item}` });
                continue;
            }

            let size = 1;
            if (m[2] !== undefined) {
                size = this.evaluate(m[2], lineNum);
                if (size === null) continue;
                if (size < 1) {
                    this.errors.push({ line: lineNum, message: `Invalid size: ${item}` });
                    continue;
                }
            }

            const name = m[1].toUpperCase();
            if (isPass1 && this.variables[name] !== undefined) {
                this.errors.push({ line: lineNum, message: `Duplicate variable: ${name}` });
            }
            this.variables[name] = this.cblockAddress;
            this.cblockAddress += size;
        }
    }

    processData(directive, rest, lineNum, isPass1) {
        const args = this.splitArgs(rest);
        if (args.length === 0) {
            this.errors.push({ line: lineNum, message: 'Missing operand' });
            return;
        }

        // DT e' codice (RETLW k), gli altri sono dati e possono finire
        // anche nella zona EEPROM o di configurazione.
        const isData = directive !== 'DT';

        for (const arg of args) {
            // Stringa: un valore per carattere ("CIAO" -> 4 RETLW con DT).
            const str = arg.match(/^"(.*)"$/);
            const values = str
                ? Array.from(str[1], ch => ch.charCodeAt(0))
                : [isPass1 ? 0 : this.dataValue(directive, arg, lineNum)];

            for (const value of values) {
                let word;
                if (directive === 'DT') word = 0x3400 | (value & 0xFF);
                else if (directive === 'DE') word = value & 0xFF;
                else word = value & 0x3FFF;
                this.output(word, lineNum, isPass1, isData);
            }
        }
    }

    dataValue(directive, arg, lineNum) {
        const value = directive === 'DW' || directive === 'DATA'
            ? this.evalRange(arg, 0, 0x3FFF, 'Value', lineNum)
            : this.evalRange(arg, -128, 255, 'Value', lineNum);
        // Valore errato: si emette comunque una parola per non spostare
        // gli indirizzi; l'errore e' gia' registrato.
        return value === null ? 0 : value;
    }

    setRadix(name, lineNum) {
        const radix = { HEX: 16, DEC: 10 }[(name || '').toUpperCase()];
        if (radix === undefined) {
            this.errors.push({ line: lineNum, message: `Unsupported radix: ${name} (use DEC or HEX)` });
        } else {
            this.radix = radix;
        }
    }

    // === INSTRUCTIONS ===

    processInstruction(line, lineNum, isPass1) {
        const [, first, rest] = line.match(/^(\S+)\s*(.*)$/);
        const mnemonic = first.toUpperCase();
        const instr = this.instructions[mnemonic];

        if (!instr) {
            if (isPass1) {
                this.errors.push({ line: lineNum, message: `Unknown instruction: ${mnemonic}` });
            }
            return;
        }

        if (isPass1) {
            this.output(0, lineNum, true);
            return;
        }

        const word = this.assembleInstruction(mnemonic, instr, this.splitArgs(rest), lineNum);
        // Anche se l'operando e' errato la parola va emessa, altrimenti gli
        // indirizzi divergono da quelli calcolati nella prima passata.
        this.output(word === null ? 0 : word, lineNum, false);
    }

    assembleInstruction(mnemonic, instr, operands, lineNum) {
        const arity = {
            none: [0, 0], byte: [1, 2], byte_f: [1, 1], bit: [2, 2], literal: [1, 1], address: [1, 1]
        }[instr.type];

        if (operands.length < arity[0]) {
            this.errors.push({ line: lineNum, message: `Missing operand for ${mnemonic}` });
            return null;
        }
        if (operands.length > arity[1]) {
            this.errors.push({ line: lineNum, message: `Too many operands for ${mnemonic}` });
            return null;
        }

        const word = instr.opcode;

        switch (instr.type) {
            case 'none':
                return word;

            case 'byte': {
                // f, d format (d omesso = F, come in MPASM)
                const f = this.evalRange(operands[0], 0, 0xFF, 'File register', lineNum);
                const d = operands.length > 1
                    ? this.evalRange(operands[1], 0, 1, 'Destination (W or F)', lineNum)
                    : 1;
                if (f === null || d === null) return null;
                return word | (d << 7) | (f & 0x7F);
            }

            case 'byte_f': {
                // f only (CLRF, MOVWF)
                const f = this.evalRange(operands[0], 0, 0xFF, 'File register', lineNum);
                if (f === null) return null;
                return word | (f & 0x7F);
            }

            case 'bit': {
                const f = this.evalRange(operands[0], 0, 0xFF, 'File register', lineNum);
                const b = this.evalRange(operands[1], 0, 7, 'Bit number', lineNum);
                if (f === null || b === null) return null;
                return word | (b << 7) | (f & 0x7F);
            }

            case 'literal': {
                // -128..255: i negativi sono il complemento a due (MOVLW -1 = 0xFF)
                const k = this.evalRange(operands[0], -128, 255, 'Literal', lineNum);
                if (k === null) return null;
                return word | (k & 0xFF);
            }

            case 'address': {
                // Il 16F84A ha 1K di memoria programma
                const addr = this.evalRange(operands[0], 0, 0x3FF, 'Address', lineNum);
                if (addr === null) return null;
                return word | addr;
            }
        }

        return null;
    }

    /**
     * Divide gli operandi sulle virgole, ignorando quelle tra apici o
     * parentesi: "MOVLW ','" e "MOVLW (A + B)" restano un operando solo.
     */
    splitArgs(str) {
        const args = [];
        let current = '';
        let quote = null;
        let depth = 0;

        for (const ch of str) {
            if (quote) {
                if (ch === quote) quote = null;
            } else if (ch === '"' || ch === '\'') {
                quote = ch;
            } else if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
            } else if (ch === ',' && depth === 0) {
                args.push(current.trim());
                current = '';
                continue;
            }
            current += ch;
        }

        if (current.trim() || args.length > 0) {
            args.push(current.trim());
        }
        return args;
    }

    // === EXPRESSIONS ===

    /**
     * Valuta un operando. Restituisce il valore, oppure null dopo aver
     * registrato un errore: mai un valore inventato. Un operando che non
     * si risolve deve fermare l'assemblaggio, non diventare 0 in silenzio.
     */
    evaluate(expr, lineNum) {
        try {
            return this.parseExpression(expr);
        } catch (e) {
            this.errors.push({ line: lineNum, message: e.message });
            return null;
        }
    }

    evalRange(expr, min, max, what, lineNum) {
        const value = this.evaluate(expr, lineNum);
        if (value === null) return null;
        if (value < min || value > max) {
            const fmt = v => (v < 0 ? '-' : '') + '0x' + Math.abs(v).toString(16).toUpperCase();
            this.errors.push({
                line: lineNum,
                message: `${what} out of range: ${expr.trim()} = ${fmt(value)} (allowed ${fmt(min)}..${fmt(max)})`
            });
            return null;
        }
        return value;
    }

    /**
     * Espressioni in stile MPASM: + - * / << >> & | ^ ~, parentesi,
     * HIGH/LOW e $ (indirizzo corrente). Precedenze come in C.
     */
    parseExpression(expr) {
        const text = (expr || '').trim();
        if (!text) throw new Error('Missing operand');

        const tokens = this.tokenize(text);
        let pos = 0;

        const peek = () => tokens[pos];
        const isOp = (...ops) => peek() !== undefined && peek().type === 'op' && ops.includes(peek().value);

        let orExpr;

        const primary = () => {
            const t = tokens[pos++];
            if (!t) throw new Error(`Incomplete expression: ${text}`);
            if (t.type === 'num') return t.value;
            if (t.type === 'sym') return this.lookupSymbol(t.value);
            if (t.value === '(') {
                const value = orExpr();
                if (!isOp(')')) throw new Error(`Missing ')' in: ${text}`);
                pos++;
                return value;
            }
            throw new Error(`Unexpected '${t.value}' in: ${text}`);
        };

        const unary = () => {
            if (isOp('-')) { pos++; return -unary(); }
            if (isOp('+')) { pos++; return unary(); }
            if (isOp('~')) { pos++; return ~unary(); }
            const t = peek();
            if (t && t.type === 'sym' && (t.value === 'HIGH' || t.value === 'LOW')) {
                pos++;
                const value = unary();
                return t.value === 'HIGH' ? (value >> 8) & 0xFF : value & 0xFF;
            }
            return primary();
        };

        const binary = (operand, ops, apply) => () => {
            let left = operand();
            while (isOp(...ops)) {
                const op = tokens[pos++].value;
                left = apply(op, left, operand());
            }
            return left;
        };

        const mul = binary(unary, ['*', '/'], (op, a, b) => {
            if (op === '*') return a * b;
            if (b === 0) throw new Error(`Division by zero in: ${text}`);
            return Math.trunc(a / b);
        });
        const add = binary(mul, ['+', '-'], (op, a, b) => (op === '+' ? a + b : a - b));
        const shift = binary(add, ['<<', '>>'], (op, a, b) => (op === '<<' ? a << b : a >> b));
        const and = binary(shift, ['&'], (op, a, b) => a & b);
        const xor = binary(and, ['^'], (op, a, b) => a ^ b);
        orExpr = binary(xor, ['|'], (op, a, b) => a | b);

        const value = orExpr();
        if (pos < tokens.length) {
            throw new Error(`Unexpected '${tokens[pos].value}' in: ${text}`);
        }
        return value;
    }

    tokenize(text) {
        const tokens = [];
        const number = str => {
            const value = this.parseNumber(str);
            if (value === null) throw new Error(`Invalid number: ${str}`);
            return { type: 'num', value };
        };

        let i = 0;
        while (i < text.length) {
            const rest = text.slice(i);
            let m;

            if ((m = rest.match(/^\s+/))) {
                // spazi
            } else if ((m = rest.match(/^[HBDOA]'[^']*'/i)) || (m = rest.match(/^'[^']*'/))) {
                tokens.push(number(m[0]));          // H'1F', B'0101', 'x', ...
            } else if ((m = rest.match(/^\$(?![0-9A-Za-z])/))) {
                tokens.push({ type: 'num', value: this.currentAddress });
            } else if ((m = rest.match(/^[$%][0-9A-Za-z]+/)) || (m = rest.match(/^\.[0-9A-Za-z]+/)) ||
                       (m = rest.match(/^[0-9][0-9A-Za-z]*/))) {
                tokens.push(number(m[0]));          // $1F, %0101, .10, 0x1F, 1FH, 10
            } else if ((m = rest.match(/^[A-Za-z_]\w*/))) {
                tokens.push({ type: 'sym', value: m[0].toUpperCase() });
            } else if ((m = rest.match(/^(<<|>>|[-+*/&|^~()])/))) {
                tokens.push({ type: 'op', value: m[0] });
            } else {
                throw new Error(`Unexpected character '${rest[0]}' in: ${text}`);
            }

            i += m[0].length;
        }

        return tokens;
    }

    lookupSymbol(name) {
        for (const table of [this.constants, this.labels, this.variables, this.registers]) {
            if (Object.prototype.hasOwnProperty.call(table, name)) {
                return table[name];
            }
        }
        throw new Error(`Undefined symbol: ${name}`);
    }

    /**
     * Converte un letterale numerico, oppure restituisce null. Ogni forma
     * deve corrispondere per intero: parseInt da solo accetterebbe
     * "B'0102'" come 2 e "FETCH" come 0xFE.
     */
    parseNumber(str) {
        if (typeof str !== 'string') return null;
        const s = str.trim();

        // Carattere: 'x' o A'x'. Va letto prima del maiuscolo, che
        // trasformerebbe 'a' in 0x41.
        const ch = s.match(/^[Aa]?'(.)'$/);
        if (ch) return ch[1].charCodeAt(0);

        const u = s.toUpperCase();

        // In radice esadecimale le cifre nude sono esadecimali: "0B1" e'
        // 0xB1, non un binario.
        if (this.radix === 16 && /^[0-9][0-9A-F]*$/.test(u)) return parseInt(u, 16);

        const forms = [
            [/^0X([0-9A-F]+)$/, 16], [/^H'([0-9A-F]+)'$/, 16], [/^\$([0-9A-F]+)$/, 16],
            [/^0B([01]+)$/, 2], [/^B'([01]+)'$/, 2], [/^%([01]+)$/, 2],
            [/^O'([0-7]+)'$/, 8], [/^0O([0-7]+)$/, 8],
            [/^D'([0-9]+)'$/, 10], [/^\.([0-9]+)$/, 10],
            [/^([0-9][0-9A-F]*)H$/, 16],
            [/^([0-9]+)$/, 10]
        ];

        for (const [re, base] of forms) {
            const m = u.match(re);
            if (m) return parseInt(m[1], base);
        }
        return null;
    }

    // === OUTPUT ===

    /**
     * Emette una parola all'indirizzo corrente (seconda passata) o la
     * conta soltanto (prima passata). I dati possono finire anche nella
     * EEPROM (0x2100-0x213F) o nella zona ID/configurazione (0x2000-0x20FF,
     * non simulata); il codice deve stare nella memoria programma.
     */
    output(word, lineNum, isPass1, isData = false) {
        const addr = this.currentAddress;
        this.currentAddress++;

        const inEeprom = addr >= 0x2100 && addr < 0x2140;
        const inConfig = addr >= 0x2000 && addr < 0x2100;

        if (isPass1) {
            if (addr > 0x3FF && !(isData && (inEeprom || inConfig)) && this.overflowLine !== lineNum) {
                this.overflowLine = lineNum;
                this.errors.push({
                    line: lineNum,
                    message: `Address 0x${addr.toString(16).toUpperCase()} is outside program memory (0x000-0x3FF)`
                });
            }
            return;
        }

        if (inEeprom) {
            this.eepromData[addr - 0x2100] = word & 0xFF;
            return;
        }
        if (inConfig) return;

        this.emit(addr, word, lineNum);
    }

    emit(addr, word, lineNum) {
        while (this.programMemory.length < addr) {
            this.programMemory.push(0x3FFF);
        }
        this.programMemory[addr] = word & 0x3FFF;
        this.sourceMap[addr] = lineNum;

        this.listing.push({
            address: addr,
            word: word & 0x3FFF,
            line: lineNum
        });
    }

    getResult() {
        return {
            success: this.errors.length === 0,
            programMemory: this.programMemory,
            eepromData: this.eepromData,
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
