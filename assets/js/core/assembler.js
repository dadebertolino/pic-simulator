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
        this.eepromData = [];   // DE a 0x2100: contenuto iniziale della EEPROM
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
        this.cblockAddress = undefined; // CBLOCK aperto (undefined = nessuno)
        this.cblockNext = 0x0C;         // dove riparte un CBLOCK senza indirizzo
        this.radix = 10;
        this.overflowLine = null;
        // Limiti del device: PIC16F84A finche' loadDeviceSymbols non dice altro.
        if (!this.limits) {
            this.limits = { programSize: 1024, eepromSize: 64, banks: 2 };
        }
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
            'NOT_PD': 3, 'NOT_TO': 4, 'TMR0IF': 2, 'TMR0IE': 5,
            // OPTION_REG bit names (uguali su tutti i PIC16 mid-range)
            'PS0': 0, 'PS1': 1, 'PS2': 2, 'PSA': 3, 'T0SE': 4, 'T0CS': 5, 'INTEDG': 6, 'RBPU': 7,
            'NOT_RBPU': 7,
            // EECON1 bit names (EEIF e' il bit 4 anche in PIR2 dei device piu' grandi)
            'RD': 0, 'WR': 1, 'WREN': 2, 'WRERR': 3, 'EEIF': 4, 'EEPGD': 7,
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
        
        // Limiti usati dai controlli di intervallo e da BANKSEL.
        var mem = deviceData.memory || {};
        this.limits = {
            programSize: (mem.program && mem.program.size) || 1024,
            eepromSize: (mem.eeprom && mem.eeprom.size) || 0,
            banks: (mem.ram && mem.ram.banks) || 2
        };
        
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

    initDirectives() {
        // Servono a distinguere un'etichetta in colonna 1 senza due punti
        // (stile MPASM) da una direttiva scritta senza rientro.
        this.directives = new Set([
            'ORG', 'EQU', 'SET', 'CBLOCK', 'ENDC', 'END', 'RADIX',
            '#INCLUDE', 'INCLUDE', 'LIST', 'NOLIST', 'PROCESSOR', '__CONFIG', 'CONFIG', 'ERRORLEVEL',
            'DW', 'DATA', 'DT', 'DE', 'RES', 'BANKSEL'
        ]);
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
                    this.errors.push({ line: lineNum, message: `Etichetta duplicata: ${label}` });
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
                this.errors.push({ line: lineNum, message: `Nome di simbolo non valido: ${first}` });
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
                        this.errors.push({ line: lineNum, message: `Indirizzo ORG non valido: ${rest}` });
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

            case 'LIST':
            case 'PROCESSOR': {
                // "LIST P=16F877A, R=DEC" o "PROCESSOR 16F877A": simboli e
                // limiti del device, se il loader lo ha gia' caricato.
                const proc = directive === 'LIST' ? rest.match(/\bP\s*=\s*([\w]+)/i) : rest.match(/^([\w]+)/);
                if (proc) {
                    let devId = proc[1].toUpperCase();
                    if (devId.indexOf('PIC') !== 0) devId = 'PIC' + devId;
                    if (this._deviceLoader && this._deviceLoader.devices && this._deviceLoader.devices[devId]) {
                        this.loadDeviceSymbols(devId, this._deviceLoader.devices[devId]);
                    }
                }
                const radix = rest.match(/\bR\s*=\s*(\w+)/i);
                if (radix) this.setRadix(radix[1], lineNum);
                return { handled: true };
            }

            case '__CONFIG':
            case 'CONFIG': {
                // Configuration word (0x2007): finisce nell'Intel HEX.
                // "__CONFIG _XT_OSC & _WDT_OFF" o un valore numerico.
                const configVal = this._parseConfigExpression(rest.replace(/^=\s*/, ''), lineNum);
                if (configVal !== null) this.configWord = configVal & 0x3FFF;
                return { handled: true };
            }

            // Accettate e ignorate: non cambiano il codice simulato.
            case '#INCLUDE':
            case 'INCLUDE':
            case 'NOLIST':
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
                        this.errors.push({ line: lineNum, message: `Numero di parole RES non valido: ${rest}` });
                    } else {
                        for (let i = 0; i < count; i++) this.output(0x3FFF, lineNum, isPass1, true);
                    }
                }
                return { handled: true };
            }

            case 'BANKSEL': {
                // Come MPASM: BCF/BSF STATUS,RP0 e, sui device a 4 banchi,
                // anche STATUS,RP1. Il numero di parole non dipende
                // dall'operando, quindi la prima passata puo' contarle.
                const fourBanks = this.limits.banks >= 4;
                if (isPass1) {
                    this.output(0, lineNum, true);
                    if (fourBanks) this.output(0, lineNum, true);
                    return { handled: true };
                }
                const addr = this.evalRange(rest, 0, this.ramTop(), 'Registro', lineNum);
                const bitOp = (bit, set) => (set ? 0x1400 : 0x1000) | (bit << 7) | 0x03;
                this.output(bitOp(5, addr !== null && (addr & 0x80)), lineNum, false);
                if (fourBanks) this.output(bitOp(6, addr !== null && (addr & 0x100)), lineNum, false);
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
                this.errors.push({ line: lineNum, message: `Voce CBLOCK non valida: ${item}` });
                continue;
            }

            let size = 1;
            if (m[2] !== undefined) {
                size = this.evaluate(m[2], lineNum);
                if (size === null) continue;
                if (size < 1) {
                    this.errors.push({ line: lineNum, message: `Dimensione non valida: ${item}` });
                    continue;
                }
            }

            const name = m[1].toUpperCase();
            if (isPass1 && this.variables[name] !== undefined) {
                this.errors.push({ line: lineNum, message: `Variabile duplicata: ${name}` });
            }
            this.variables[name] = this.cblockAddress;
            this.cblockAddress += size;
        }
    }

    processData(directive, rest, lineNum, isPass1) {
        const args = this.splitArgs(rest);
        if (args.length === 0) {
            this.errors.push({ line: lineNum, message: 'Operando mancante' });
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
            ? this.evalRange(arg, 0, 0x3FFF, 'Valore', lineNum)
            : this.evalRange(arg, -128, 255, 'Valore', lineNum);
        // Valore errato: si emette comunque una parola per non spostare
        // gli indirizzi; l'errore e' gia' registrato.
        return value === null ? 0 : value;
    }

    setRadix(name, lineNum) {
        const radix = { HEX: 16, DEC: 10 }[(name || '').toUpperCase()];
        if (radix === undefined) {
            this.errors.push({ line: lineNum, message: `Radice non supportata: ${name} (usa DEC o HEX)` });
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
                this.errors.push({ line: lineNum, message: `Istruzione sconosciuta: ${mnemonic}` });
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
            this.errors.push({ line: lineNum, message: `Operando mancante per ${mnemonic}` });
            return null;
        }
        if (operands.length > arity[1]) {
            this.errors.push({ line: lineNum, message: `Troppi operandi per ${mnemonic}` });
            return null;
        }

        const word = instr.opcode;

        switch (instr.type) {
            case 'none':
                return word;

            case 'byte': {
                // f, d format (d omesso = F, come in MPASM)
                const f = this.evalRange(operands[0], 0, this.ramTop(), 'Registro', lineNum);
                const d = operands.length > 1
                    ? this.evalRange(operands[1], 0, 1, 'Destinazione (W o F)', lineNum)
                    : 1;
                if (f === null || d === null) return null;
                return word | (d << 7) | (f & 0x7F);
            }

            case 'byte_f': {
                // f only (CLRF, MOVWF)
                const f = this.evalRange(operands[0], 0, this.ramTop(), 'Registro', lineNum);
                if (f === null) return null;
                return word | (f & 0x7F);
            }

            case 'bit': {
                const f = this.evalRange(operands[0], 0, this.ramTop(), 'Registro', lineNum);
                const b = this.evalRange(operands[1], 0, 7, 'Numero di bit', lineNum);
                if (f === null || b === null) return null;
                return word | (b << 7) | (f & 0x7F);
            }

            case 'literal': {
                // -128..255: i negativi sono il complemento a due (MOVLW -1 = 0xFF)
                const k = this.evalRange(operands[0], -128, 255, 'Letterale', lineNum);
                if (k === null) return null;
                return word | (k & 0xFF);
            }

            case 'address': {
                // Il 16F84A ha 1K di memoria programma
                // Tutta la memoria programma del device; nell'istruzione
                // entrano 11 bit, il resto lo danno PCLATH<4:3>.
                const addr = this.evalRange(operands[0], 0, this.limits.programSize - 1, 'Indirizzo', lineNum);
                if (addr === null) return null;
                return word | (addr & 0x7FF);
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
                message: `${what} fuori intervallo: ${expr.trim()} = ${fmt(value)} (ammesso ${fmt(min)}..${fmt(max)})`
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
        if (!text) throw new Error('Operando mancante');

        const tokens = this.tokenize(text);
        let pos = 0;

        const peek = () => tokens[pos];
        const isOp = (...ops) => peek() !== undefined && peek().type === 'op' && ops.includes(peek().value);

        let orExpr;

        const primary = () => {
            const t = tokens[pos++];
            if (!t) throw new Error(`Espressione incompleta: ${text}`);
            if (t.type === 'num') return t.value;
            if (t.type === 'sym') return this.lookupSymbol(t.value);
            if (t.value === '(') {
                const value = orExpr();
                if (!isOp(')')) throw new Error(`Manca ')' in: ${text}`);
                pos++;
                return value;
            }
            throw new Error(`'${t.value}' inatteso in: ${text}`);
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
            if (b === 0) throw new Error(`Divisione per zero in: ${text}`);
            return Math.trunc(a / b);
        });
        const add = binary(mul, ['+', '-'], (op, a, b) => (op === '+' ? a + b : a - b));
        const shift = binary(add, ['<<', '>>'], (op, a, b) => (op === '<<' ? a << b : a >> b));
        const and = binary(shift, ['&'], (op, a, b) => a & b);
        const xor = binary(and, ['^'], (op, a, b) => a ^ b);
        orExpr = binary(xor, ['|'], (op, a, b) => a | b);

        const value = orExpr();
        if (pos < tokens.length) {
            throw new Error(`'${tokens[pos].value}' inatteso in: ${text}`);
        }
        return value;
    }

    tokenize(text) {
        const tokens = [];
        const number = str => {
            const value = this.parseNumber(str);
            if (value === null) throw new Error(`Numero non valido: ${str}`);
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
                throw new Error(`Carattere inatteso '${rest[0]}' in: ${text}`);
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
        throw new Error(`Simbolo non definito: ${name}`);
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

        const progTop = this.limits.programSize - 1;
        const inEeprom = addr >= 0x2100 && addr < 0x2100 + this.limits.eepromSize;
        const inConfig = addr >= 0x2000 && addr < 0x2100;

        if (isPass1) {
            if (addr > progTop && !(isData && (inEeprom || inConfig)) && this.overflowLine !== lineNum) {
                this.overflowLine = lineNum;
                const top = progTop.toString(16).toUpperCase().padStart(3, '0');
                this.errors.push({
                    line: lineNum,
                    message: `Indirizzo 0x${addr.toString(16).toUpperCase()} fuori dalla memoria programma (0x000-0x${top})`
                });
            }
            return;
        }

        if (inEeprom) {
            this.eepromData[addr - 0x2100] = word & 0xFF;
            return;
        }
        if (inConfig) {
            // DW a 0x2007 equivale a __CONFIG; il resto (ID) non e' simulato.
            if (addr === this.configAddr) this.configWord = word & 0x3FFF;
            return;
        }

        this.emit(addr, word, lineNum);
    }

    /** Ultimo indirizzo di registro valido: 0xFF con 2 banchi, 0x1FF con 4. */
    ramTop() {
        return this.limits.banks >= 4 ? 0x1FF : 0xFF;
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
            configWord: this.configWord,
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
