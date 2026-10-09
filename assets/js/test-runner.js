/**
 * PIC Simulator Test Runner
 * Test automatici: assembla → esegui → verifica stato.
 */

class PicTestRunner {
    constructor(deviceLoader) {
        this.deviceLoader = deviceLoader;
        this.factory = new PIC16Factory(deviceLoader);
        this.results = [];
        this.running = false;
        this.stopped = false;
        this.passed = 0;
        this.failed = 0;
        this.total = 0;
    }

    async runAll() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
        this.stopped = false;
        this.running = true;
        this._clearUI();

        var tests = this._getAllTests();
        this.total = tests.length;
        this._updateStats();

        for (var i = 0; i < tests.length; i++) {
            if (this.stopped) break;
            var test = tests[i];
            try {
                await this._runTest(test);
            } catch (e) {
                this._addResult(test.name, false, 'Exception: ' + e.message);
            }
            this._updateProgress((i + 1) / tests.length * 100);
            // Yield per UI update
            await new Promise(function(r) { setTimeout(r, 1); });
        }

        this.running = false;
        this._showSummary();
    }

    stop() {
        this.stopped = true;
    }

    // ================================================================
    //  TEST EXECUTION
    // ================================================================

    async _runTest(test) {
        // Carica device se necessario
        var deviceId = test.device || 'PIC16F84A';
        if (this.deviceLoader) {
            try { await this.deviceLoader.loadDevice(deviceId); } catch(e) {}
        }

        var result = this.factory.create(deviceId);
        var cpu = result.cpu;
        var assembler = new PIC16Assembler();

        // Carica simboli device
        if (this.deviceLoader && this.deviceLoader.devices && this.deviceLoader.devices[deviceId]) {
            assembler._deviceLoader = this.deviceLoader;
            assembler.loadDeviceSymbols(deviceId, this.deviceLoader.devices[deviceId]);
        }

        // Assembla
        assembler.reset();
        assembler.assemble(test.source);

        if (assembler.errors.length > 0) {
            this._addResult(test.name, false, 'Assembly error: ' + assembler.errors[0].message + ' (line ' + assembler.errors[0].line + ')');
            return;
        }

        // Carica in CPU
        for (var a = 0; a < assembler.programMemory.length; a++) {
            if (assembler.programMemory[a] !== undefined) {
                cpu.programMemory[a] = assembler.programMemory[a];
            }
        }

        // Pre-setup (opzionale)
        if (test.setup) test.setup(cpu);

        // Esegui N cicli
        var maxCycles = test.cycles || 1000;
        for (var c = 0; c < maxCycles; c++) {
            cpu.step();
            if (test.breakAt && cpu.PC === test.breakAt) break;
        }

        // Verifica
        if (test.verify) {
            var err = test.verify(cpu, assembler);
            if (err) {
                this._addResult(test.name, false, err);
            } else {
                this._addResult(test.name, true);
            }
        } else {
            this._addResult(test.name, true, 'No verify (ran ' + maxCycles + ' cycles)');
        }
    }

    // ================================================================
    //  ALL TESTS
    // ================================================================

    _getAllTests() {
        var tests = [];

        // === CPU CORE ===
        tests.push({
            name: 'CPU: MOVLW + MOVWF',
            source: '    ORG 0\n    MOVLW 0x42\n    MOVWF 0x20\n    NOP\n    END',
            cycles: 10,
            verify: function(cpu) {
                if (cpu.W !== 0x42) return 'W=' + cpu.W + ' expected 0x42';
                if (cpu.ram[0x20] !== 0x42) return 'RAM[0x20]=' + cpu.ram[0x20] + ' expected 0x42';
            }
        });

        tests.push({
            name: 'CPU: ADDLW + STATUS flags',
            source: '    ORG 0\n    MOVLW 0xFF\n    ADDLW 0x01\n    NOP\n    END',
            cycles: 10,
            verify: function(cpu) {
                if (cpu.W !== 0x00) return 'W=' + cpu.W + ' expected 0';
                if (!(cpu.ram[0x03] & 0x04)) return 'Z flag not set';
                if (!(cpu.ram[0x03] & 0x01)) return 'C flag not set';
            }
        });

        tests.push({
            name: 'CPU: DECFSZ skip',
            source: '    ORG 0\n    MOVLW 0x01\n    MOVWF 0x20\n    DECFSZ 0x20, F\n    GOTO FAIL\n    GOTO PASS\nFAIL:\n    MOVLW 0xFF\n    GOTO END_T\nPASS:\n    MOVLW 0xAA\nEND_T:\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.W !== 0xAA) return 'W=' + cpu.W.toString(16) + ' expected 0xAA (skip failed)';
            }
        });

        tests.push({
            name: 'CPU: CALL + RETURN',
            source: '    ORG 0\n    CALL SUB\n    MOVLW 0xBB\n    NOP\n    END\nSUB:\n    MOVLW 0xAA\n    RETURN',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.W !== 0xBB) return 'W=' + cpu.W.toString(16) + ' expected 0xBB';
            }
        });

        tests.push({
            name: 'CPU: BSF + BCF + BTFSC',
            source: '    ORG 0\n    CLRF 0x20\n    BSF 0x20, 3\n    BTFSC 0x20, 3\n    GOTO SET_OK\n    MOVLW 0xFF\n    GOTO END_T\nSET_OK:\n    BCF 0x20, 3\n    BTFSS 0x20, 3\n    GOTO CLR_OK\n    MOVLW 0xFE\n    GOTO END_T\nCLR_OK:\n    MOVLW 0xAA\nEND_T:\n    NOP\n    END',
            cycles: 30,
            verify: function(cpu) {
                if (cpu.W !== 0xAA) return 'W=' + cpu.W.toString(16) + ' expected 0xAA';
            }
        });

        tests.push({
            name: 'CPU: SWAPF',
            source: '    ORG 0\n    MOVLW 0xA5\n    MOVWF 0x20\n    SWAPF 0x20, W\n    NOP\n    END',
            cycles: 10,
            verify: function(cpu) {
                if (cpu.W !== 0x5A) return 'W=' + cpu.W.toString(16) + ' expected 0x5A';
            }
        });

        tests.push({
            name: 'CPU: RLF + RRF',
            source: '    ORG 0\n    BCF STATUS, C\n    MOVLW 0x01\n    MOVWF 0x20\n    RLF 0x20, F\n    RLF 0x20, F\n    RLF 0x20, F\n    MOVF 0x20, W\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.W !== 0x08) return 'W=' + cpu.W.toString(16) + ' expected 0x08';
            }
        });

        tests.push({
            name: 'CPU: Indirect addressing (FSR/INDF)',
            source: '    ORG 0\n    MOVLW 0x20\n    MOVWF FSR\n    MOVLW 0x55\n    MOVWF INDF\n    INCF FSR, F\n    MOVLW 0xAA\n    MOVWF INDF\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.ram[0x20] !== 0x55) return 'RAM[0x20]=' + cpu.ram[0x20].toString(16) + ' expected 0x55';
                if (cpu.ram[0x21] !== 0xAA) return 'RAM[0x21]=' + cpu.ram[0x21].toString(16) + ' expected 0xAA';
            }
        });

        // === BANK SWITCHING ===
        tests.push({
            name: 'CPU: Bank 0/1 switching',
            source: '    ORG 0\n    BSF STATUS, RP0\n    MOVLW 0x00\n    MOVWF TRISB\n    BCF STATUS, RP0\n    MOVLW 0xFF\n    MOVWF PORTB\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.ram[0x86] !== 0x00) return 'TRISB=0x' + cpu.ram[0x86].toString(16) + ' expected 0';
                if (cpu.ram[0x06] !== 0xFF) return 'PORTB=0x' + cpu.ram[0x06].toString(16) + ' expected 0xFF';
            }
        });

        // === GPIO ===
        tests.push({
            name: 'GPIO: PORTB output',
            source: '    ORG 0\n    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\n    MOVLW 0xA5\n    MOVWF PORTB\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                var gpio = cpu.getPeripheral('GPIO_B');
                if (!gpio) return 'GPIO_B not found';
                var out = gpio.getOutput();
                if (out.data !== 0xA5) return 'PORTB output=' + out.data.toString(16) + ' expected 0xA5';
            }
        });

        tests.push({
            name: 'GPIO: PORTA input (TRIS=1)',
            source: '    ORG 0\n    BSF STATUS, RP0\n    MOVLW 0xFF\n    MOVWF TRISA\n    BCF STATUS, RP0\n    MOVF PORTA, W\n    NOP\n    END',
            cycles: 20,
            setup: function(cpu) {
                var gpio = cpu.getPeripheral('GPIO_A');
                if (gpio) { gpio.setExternalPin(2, 1); gpio.setExternalPin(4, 1); }
            },
            verify: function(cpu) {
                if ((cpu.W & 0x14) !== 0x14) return 'W=' + cpu.W.toString(16) + ' expected bits 2,4 set';
            }
        });

        // === TMR0 ===
        tests.push({
            name: 'TMR0: Increment (internal, 1:1)',
            source: '    ORG 0\n    BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n    CLRF TMR0\n    NOP\n    NOP\n    NOP\n    NOP\n    NOP\n    MOVF TMR0, W\n    NOP\n    END',
            cycles: 30,
            verify: function(cpu) {
                if (cpu.W < 3) return 'TMR0=' + cpu.W + ' expected >3 (incremented)';
            }
        });

        // === EEPROM ===
        tests.push({
            name: 'EEPROM: Write + Read',
            source: '    ORG 0\n    BSF STATUS, RP0\n    BSF EECON1, 2\n    BCF STATUS, RP0\n    MOVLW 0x05\n    MOVWF EEADR\n    MOVLW 0x42\n    MOVWF EEDATA\n    BSF STATUS, RP0\n    MOVLW 0x55\n    MOVWF EECON2\n    MOVLW 0xAA\n    MOVWF EECON2\n    BSF EECON1, 1\n    BCF STATUS, RP0\n    CLRF EEDATA\n    BSF STATUS, RP0\n    BSF EECON1, 0\n    BCF STATUS, RP0\n    MOVF EEDATA, W\n    NOP\n    END',
            cycles: 50,
            verify: function(cpu) {
                if (cpu.W !== 0x42) return 'W=' + cpu.W.toString(16) + ' expected 0x42 (EEPROM read back)';
                var eep = cpu.getPeripheral('EEPROM');
                if (eep && eep.readByte(5) !== 0x42) return 'EEPROM[5]=' + eep.readByte(5).toString(16);
            }
        });

        // === ASSEMBLER: __CONFIG ===
        tests.push({
            name: 'ASM: __CONFIG parsing',
            source: '    LIST P=16F84A\n    __CONFIG _XT_OSC & _WDT_OFF & _CP_OFF & _PWRTE_ON\n    ORG 0\n    NOP\n    END',
            cycles: 5,
            verify: function(cpu, asm) {
                if (asm.configWord === null) return 'configWord is null';
                if (asm.configWord !== 0x3FF1) return 'configWord=0x' + asm.configWord.toString(16) + ' expected 0x3FF1';
            }
        });

        // === ASSEMBLER: LIST P= symbols ===
        tests.push({
            name: 'ASM: LIST P=16F877A loads PORTC symbol',
            device: 'PIC16F877A',
            source: '    LIST P=16F877A\n    ORG 0\n    BSF STATUS, RP0\n    CLRF TRISC\n    BCF STATUS, RP0\n    MOVLW 0x55\n    MOVWF PORTC\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.ram[0x07] !== 0x55) return 'PORTC(0x07)=' + cpu.ram[0x07].toString(16) + ' expected 0x55';
            }
        });

        // === ASSEMBLER: CBLOCK/ENDC ===
        tests.push({
            name: 'ASM: CBLOCK variables',
            source: '    ORG 0\n    CBLOCK 0x20\n    VAR1\n    VAR2\n    VAR3\n    ENDC\n    MOVLW 0x11\n    MOVWF VAR1\n    MOVLW 0x22\n    MOVWF VAR2\n    MOVLW 0x33\n    MOVWF VAR3\n    NOP\n    END',
            cycles: 20,
            verify: function(cpu) {
                if (cpu.ram[0x20] !== 0x11) return 'VAR1=' + cpu.ram[0x20].toString(16);
                if (cpu.ram[0x21] !== 0x22) return 'VAR2=' + cpu.ram[0x21].toString(16);
                if (cpu.ram[0x22] !== 0x33) return 'VAR3=' + cpu.ram[0x22].toString(16);
            }
        });

        // === HEX EXPORT ===
        tests.push({
            name: 'HEX: Config word in hex output',
            source: '    __CONFIG 0x3FF1\n    ORG 0\n    NOP\n    END',
            cycles: 5,
            verify: function(cpu, asm) {
                var hex = asm.toIntelHex();
                if (hex.indexOf('400E') === -1) return 'Config record not found in hex (expected addr 400E)';
            }
        });

        // === MULTI-DEVICE ===
        var deviceTests = [
            { id: 'PIC16F84A',  checkPeriphs: ['GPIO_A','GPIO_B','TMR0','EEPROM'] },
            { id: 'PIC16F628A', checkPeriphs: ['GPIO_A','GPIO_B','TMR0','TMR1','TMR2','CCP1','USART','EEPROM','COMPARATOR'] },
            { id: 'PIC16F877A', checkPeriphs: ['GPIO_A','GPIO_B','GPIO_C','TMR0','TMR1','TMR2','CCP1','CCP2','USART','ADC','MSSP','EEPROM'] },
            { id: 'PIC16F887', checkPeriphs: ['GPIO_A','GPIO_B','GPIO_C','TMR0','TMR1','TMR2','CCP1','USART','ADC','MSSP','COMPARATOR','EEPROM'] },
            { id: 'PIC16F690', checkPeriphs: ['GPIO_A','GPIO_B','GPIO_C','TMR0','TMR1','TMR2','CCP1','USART','ADC','MSSP','COMPARATOR','EEPROM'] }
        ];

        for (var d = 0; d < deviceTests.length; d++) {
            (function(dt) {
                tests.push({
                    name: 'Device: ' + dt.id + ' peripherals',
                    device: dt.id,
                    source: '    ORG 0\n    NOP\n    END',
                    cycles: 5,
                    verify: function(cpu) {
                        var list = cpu.peripherals.list();
                        for (var p = 0; p < dt.checkPeriphs.length; p++) {
                            if (list.indexOf(dt.checkPeriphs[p]) === -1) {
                                return dt.checkPeriphs[p] + ' missing. Have: ' + list.join(',');
                            }
                        }
                    }
                });
            })(deviceTests[d]);
        }

        // === 4-BANK (PIC16F877A) ===
        tests.push({
            name: 'Bank: 4-bank addressing (877A)',
            device: 'PIC16F877A',
            source: '    LIST P=16F877A\n    ORG 0\n    BSF STATUS, RP1\n    BCF STATUS, RP0\n    MOVLW 0xBB\n    MOVWF 0x20\n    BCF STATUS, RP1\n    BCF STATUS, RP0\n    MOVLW 0xAA\n    MOVWF 0x20\n    NOP\n    END',
            cycles: 30,
            verify: function(cpu) {
                if (cpu.ram[0x20] !== 0xAA) return 'Bank0[0x20]=' + cpu.ram[0x20].toString(16) + ' expected 0xAA';
                if (cpu.ram[0x120] !== 0xBB) return 'Bank2[0x120]=' + cpu.ram[0x120].toString(16) + ' expected 0xBB';
            }
        });

        // === PERIPHERALS: TMR1 ===
        tests.push({
            name: 'TMR1: Enable + count',
            device: 'PIC16F628A',
            source: '    LIST P=16F628A\n    ORG 0\n    CLRF TMR1L\n    CLRF TMR1H\n    MOVLW 0x01\n    MOVWF T1CON\n    NOP\n    NOP\n    NOP\n    NOP\n    MOVF TMR1L, W\n    NOP\n    END',
            cycles: 30,
            verify: function(cpu) {
                if (cpu.W < 2) return 'TMR1L=' + cpu.W + ' expected >2';
            }
        });

        // === PERIPHERALS: TMR2 ===
        tests.push({
            name: 'TMR2: Enable + count vs PR2',
            device: 'PIC16F628A',
            source: '    LIST P=16F628A\n    ORG 0\n    BSF STATUS, RP0\n    MOVLW 0x05\n    MOVWF PR2\n    BCF STATUS, RP0\n    CLRF TMR2\n    MOVLW 0x04\n    MOVWF T2CON\n    NOP\n    NOP\n    NOP\n    NOP\n    NOP\n    NOP\n    NOP\n    NOP\n    MOVF TMR2, W\n    NOP\n    END',
            cycles: 50,
            verify: function(cpu) {
                if (cpu.W > 5) return 'TMR2=' + cpu.W + ' expected <=5 (PR2=5 resets)';
            }
        });

        // === PERIPHERALS: ADC ===
        tests.push({
            name: 'ADC: Conversion (877A)',
            device: 'PIC16F877A',
            source: '    LIST P=16F877A\n    ORG 0\n    BSF STATUS, RP0\n    MOVLW 0x80\n    MOVWF ADCON1\n    BCF STATUS, RP0\n    MOVLW 0x41\n    MOVWF ADCON0\n    BSF ADCON0, 2\n    NOP\n    END',
            cycles: 200,
            setup: function(cpu) {
                var adc = cpu.getPeripheral('ADC');
                if (adc) adc.setChannelValue(0, 512);
            },
            verify: function(cpu) {
                var adc = cpu.getPeripheral('ADC');
                if (!adc) return 'ADC not found';
                var result = adc.getResult();
                if (result < 400 || result > 600) return 'ADC result=' + result + ' expected ~512';
            }
        });

        return tests;
    }

    // ================================================================
    //  UI
    // ================================================================

    _clearUI() {
        var el = document.getElementById('test-results');
        if (el) el.innerHTML = '';
        this._updateProgress(0);
    }

    _addResult(name, pass, detail) {
        if (pass) this.passed++; else this.failed++;
        this._updateStats();

        var el = document.getElementById('test-results');
        if (!el) return;

        var div = document.createElement('div');
        div.className = 'pic-test-result ' + (pass ? 'pic-test-pass' : 'pic-test-fail');
        div.innerHTML =
            '<span class="pic-test-icon">' + (pass ? '&#10004;' : '&#10008;') + '</span>' +
            '<span class="pic-test-name">' + name + '</span>' +
            (detail ? '<span class="pic-test-detail">' + detail + '</span>' : '');
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
    }

    _updateStats() {
        var el = document.getElementById('test-stats');
        if (el) el.textContent = this.passed + ' / ' + (this.passed + this.failed) + (this.failed > 0 ? ' (' + this.failed + ' failed)' : '');
    }

    _updateProgress(pct) {
        var el = document.getElementById('test-progress');
        if (el) el.style.width = pct + '%';
    }

    _showSummary() {
        var el = document.getElementById('test-results');
        if (!el) return;
        var div = document.createElement('div');
        div.className = 'pic-test-summary ' + (this.failed === 0 ? 'pic-test-all-pass' : 'pic-test-has-fail');
        div.textContent = this.failed === 0
            ? 'All ' + this.passed + ' tests passed!'
            : this.passed + ' passed, ' + this.failed + ' failed out of ' + this.total;
        el.appendChild(div);
    }
}
