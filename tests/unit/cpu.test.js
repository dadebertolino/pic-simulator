/**
 * Core PIC16 (PIC16Core + periferiche della factory) sui tre device con la
 * scheda completa: 16F84A (2 banchi, niente PIR), 16F628A e 16F877A
 * (4 banchi, PIR/PIE, EEPROM a indirizzi diversi).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ctx, newCpu, cpuWith, pins, steps } = require('./helpers');

const DEVICES = ['PIC16F84A', 'PIC16F628A', 'PIC16F877A'];
const Z = 0x04, C = 0x01, DC = 0x02;
const flags = (cpu) => cpu.ram[0x03] & (Z | C | DC);
const layout = (dev) => ctx.DeviceLoader.memoryLayout(dev);

for (const dev of DEVICES) {
    describe(`${dev}: istruzioni e flag`, () => {
        test('Z impostato da un risultato nullo e azzerato da uno non nullo', async () => {
            // Regressione: setZ(true) azzerava Z, che non veniva mai impostato.
            const cpu = await cpuWith('    MOVLW 0\n    MOVWF 0x20\n    MOVF 0x20, F\n    MOVLW 1\n    IORLW 0', dev);
            steps(cpu, 3);
            assert.equal(cpu.ram[0x03] & Z, Z, 'MOVF di uno zero');
            steps(cpu, 2);
            assert.equal(cpu.ram[0x03] & Z, 0, 'IORLW con risultato 1');
        });

        test('CLRF e CLRW impostano Z', async () => {
            const cpu = await cpuWith('    MOVLW 1\n    IORLW 1\n    CLRW\n    IORLW 1\n    CLRF 0x20', dev);
            steps(cpu, 3);
            assert.equal(cpu.ram[0x03] & Z, Z);
            steps(cpu, 2);
            assert.equal(cpu.ram[0x03] & Z, Z);
        });

        test('ADDWF: riporto, mezzo riporto e zero', async () => {
            const cpu = await cpuWith('    MOVLW 0xF8\n    MOVWF 0x20\n    MOVLW 0x08\n    ADDWF 0x20, F', dev);
            steps(cpu, 4);
            assert.equal(cpu.ram[0x20], 0x00);
            assert.equal(flags(cpu), Z | C | DC);
        });

        test('SUBWF e SUBLW: C = 1 significa nessun prestito', async () => {
            const cpu = await cpuWith('    MOVLW 5\n    MOVWF 0x20\n    MOVLW 3\n    SUBWF 0x20, W\n    SUBLW 1', dev);
            steps(cpu, 4);
            assert.equal(cpu.W, 2);
            assert.equal(cpu.ram[0x03] & C, C);
            steps(cpu, 1);
            assert.equal(cpu.W, 0xFF);
            assert.equal(cpu.ram[0x03] & C, 0);
        });

        test('DECFSZ salta quando arriva a zero, contando 2 cicli', async () => {
            const cpu = await cpuWith('    MOVLW 1\n    MOVWF 0x20\n    DECFSZ 0x20, F\n    GOTO 0\n    NOP', dev);
            steps(cpu, 3);
            assert.equal(cpu.PC, 4);
            assert.equal(cpu.cycles, 4);
        });

        test('TO e PD non sono scrivibili', async () => {
            const cpu = await cpuWith('    CLRF STATUS', dev);
            steps(cpu, 1);
            assert.equal(cpu.ram[0x03] & 0x18, 0x18);
        });
    });

    describe(`${dev}: memoria`, () => {
        test('RP0 seleziona il banco 1 per TRISB', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\n    MOVLW 0xA5\n    MOVWF PORTB', dev);
            steps(cpu, 5);
            assert.equal(cpu.ram[0x86], 0x00);
            assert.equal(pins(cpu, 'B'), 0xA5);
        });

        test('indirizzamento indiretto con FSR e INDF', async () => {
            const cpu = await cpuWith('    MOVLW 0x20\n    MOVWF FSR\n    MOVLW 0x5A\n    MOVWF INDF\n    INCF FSR, F\n    MOVWF INDF', dev);
            steps(cpu, 6);
            assert.equal(cpu.ram[0x20], 0x5A);
            assert.equal(cpu.ram[0x21], 0x5A);
        });

        test('una scrittura su PORTB tramite INDF passa dalla periferica', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\n' +
                '    MOVLW PORTB\n    MOVWF FSR\n    MOVLW 0x3C\n    MOVWF INDF', dev);
            let notified = 0;
            cpu.onPortChange = () => notified++;
            steps(cpu, 7);
            assert.ok(notified > 0);
            assert.equal(pins(cpu, 'B'), 0x3C);
        });

        test('FSR verso TRISB scrive il registro del banco 1', async () => {
            const cpu = await cpuWith('    MOVLW 0x86\n    MOVWF FSR\n    MOVLW 0x0F\n    MOVWF INDF\n    MOVF INDF, W', dev);
            steps(cpu, 5);
            assert.equal(cpu.ram[0x86], 0x0F);
            assert.equal(cpu.W, 0x0F);
        });

        test('INDF con FSR che punta a INDF legge 0', async () => {
            const cpu = await cpuWith('    CLRF FSR\n    MOVLW 0x55\n    MOVWF INDF\n    MOVF INDF, W', dev);
            steps(cpu, 4);
            assert.equal(cpu.W, 0);
        });

        test('la scrittura di PCL usa PCLATH<4:0>', async () => {
            const cpu = await cpuWith('    MOVLW 0xE1\n    MOVWF PCLATH\n    MOVLW 0x23\n    MOVWF PCL', dev);
            steps(cpu, 4);
            assert.equal(cpu.PC, 0x0123);
        });

        test('ADDWF PCL per la tabella con RETLW', async () => {
            const cpu = await cpuWith('    MOVLW 2\n    CALL TAB\n    GOTO $\nTAB: ADDWF PCL, F\n    RETLW 10\n    RETLW 11\n    RETLW 12', dev);
            steps(cpu, 5);
            assert.equal(cpu.W, 12);
            assert.equal(cpu.PC, 2);
        });
    });
}

describe('PIC16F84A: mappa della memoria', () => {
    test('i GPR 0x0C-0x4F sono gli stessi nei due banchi', async () => {
        const cpu = await cpuWith('    MOVLW 0x42\n    BSF STATUS, RP0\n    MOVWF 0x20\n    BCF STATUS, RP0\n    CLRW\n    MOVF 0x20, W');
        steps(cpu, 6);
        assert.equal(cpu.W, 0x42);
    });

    test('FSR tra 0x8C e 0xCF raggiunge i GPR 0x0C-0x4F', async () => {
        const cpu = await cpuWith('    MOVLW 0x8C\n    MOVWF FSR\n    MOVLW 0x42\n    MOVWF INDF');
        steps(cpu, 4);
        assert.equal(cpu.ram[0x0C], 0x42);
    });

    test('0x50-0x7F non e\' implementata: si legge 0', async () => {
        const cpu = await cpuWith('    MOVLW 0x42\n    MOVWF 0x50\n    MOVF 0x50, W');
        steps(cpu, 3);
        assert.equal(cpu.W, 0);
    });
});

for (const dev of ['PIC16F628A', 'PIC16F877A']) {
    describe(`${dev}: mappa della memoria a 4 banchi`, () => {
        test('0x70-0x7F e\' la stessa area in tutti i banchi', async () => {
            const cpu = await cpuWith('    MOVLW 0x42\n    MOVWF 0x70\n    BSF STATUS, RP0\n    BSF STATUS, RP1\n    CLRW\n    MOVF 0x70, W\n' +
                '    BCF STATUS, RP0\n    INCF 0x7F, F', dev);
            steps(cpu, 8);
            assert.equal(cpu.W, 0x42, 'letto dal banco 3');
            assert.equal(cpu.ram[0x7F], 1, 'scritto dal banco 2');
        });

        test('TMR0 e PORTB nel banco 2, OPTION_REG e TRISB nel banco 3', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP1\n    MOVLW 0x77\n    MOVWF 0x01\n    BSF STATUS, RP0\n' +
                '    MOVLW 0xE8\n    MOVWF 0x01\n    CLRF 0x06\n    BCF STATUS, RP0\n    MOVLW 0x5A\n    MOVWF 0x06', dev);
            steps(cpu, 10);
            assert.equal(cpu.ram[0x01], 0x77, 'TMR0 (fermo: T0CS = 1)');
            assert.equal(cpu.ram[0x81], 0xE8, 'OPTION_REG');
            assert.equal(cpu.ram[0x86], 0x00, 'TRISB');
            assert.equal(pins(cpu, 'B'), 0x5A, 'PORTB');
        });
    });
}

describe('PIC16F877A: registri dei banchi 2 e 3', () => {
    test('PORTD e TRISD non sono piu\' occupati dalla EEPROM', async () => {
        // Regressione: la EEPROM registrava 0x08/0x88 e TRISD=0xFF diventava 0x1E.
        const cpu = await newCpu('PIC16F877A');
        assert.equal(cpu.ram[0x88], 0xFF, 'TRISD al reset');
        const prog = await cpuWith('    BSF STATUS, RP0\n    CLRF TRISD\n    BCF STATUS, RP0\n    MOVLW 0xA5\n    MOVWF PORTD', 'PIC16F877A');
        steps(prog, 5);
        assert.equal(prog.ram[0x88], 0x00);
        assert.equal(pins(prog, 'D'), 0xA5);
    });

    test('IRP:FSR raggiunge i GPR dei banchi 2 e 3', async () => {
        const cpu = await cpuWith('    BSF STATUS, IRP\n    MOVLW 0x10\n    MOVWF FSR\n    MOVLW 0x11\n    MOVWF INDF\n' +
            '    MOVLW 0x90\n    MOVWF FSR\n    MOVLW 0x33\n    MOVWF INDF', 'PIC16F877A');
        steps(cpu, 9);
        assert.equal(cpu.ram[0x110], 0x11);
        assert.equal(cpu.ram[0x190], 0x33);
    });
});

for (const dev of DEVICES) {
    describe(`${dev}: Timer0`, () => {
        test('overflow di TMR0 imposta T0IF e salta al vettore 0x04', async () => {
            // Regressione: ram e' Uint8Array, il confronto > 255 non scattava mai.
            const cpu = await cpuWith(
                '    GOTO MAIN\n    ORG 4\n    GOTO ISR\n' +
                'MAIN: BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n' +
                '    MOVLW 0xA0\n    MOVWF INTCON\n    MOVLW 0xF0\n    MOVWF TMR0\nLOOP: GOTO LOOP\n' +
                'ISR: BCF INTCON, T0IF\n    INCF 0x20, F\n    RETFIE', dev);
            for (let i = 0; i < 30 && cpu.ram[0x20] === 0; i++) cpu.step();
            assert.equal(cpu.ram[0x20], 1, 'la ISR e\' stata eseguita');
            assert.equal(cpu.ram[0x0B] & 0x80, 0, 'GIE azzerato dentro la ISR');
            steps(cpu, 1);
            assert.equal(cpu.ram[0x0B] & 0x80, 0x80, 'RETFIE riattiva GIE');
            assert.equal(cpu.PC, 13, 'ritorno nel loop (LOOP = 0x0D)');
        });

        test('prescaler 1:4 su TMR0', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    MOVLW 0x01\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n    CLRF TMR0\nL: GOTO L', dev);
            steps(cpu, 5);
            steps(cpu, 8); // 8 GOTO = 16 cicli, 1 fermo dopo CLRF TMR0: 15 / 4 = 3
            assert.equal(cpu.ram[0x01], 3);
        });

        test('TMR0 avanza di un passo per ciclo, anche sulle istruzioni da 2 cicli', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n    CLRF TMR0\nL: GOTO L', dev);
            steps(cpu, 5);
            const start = cpu.cycles;
            steps(cpu, 10); // 10 GOTO = 20 cicli
            // Il secondo dei due cicli fermi dopo CLRF TMR0 cade qui.
            assert.equal(cpu.ram[0x01], cpu.cycles - start - 1);
        });

        test('dopo una scrittura TMR0 resta fermo per due cicli', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n' +
                '    MOVLW 0x10\n    MOVWF TMR0\n    MOVF TMR0, W\n    MOVF TMR0, W\n    MOVF TMR0, W\n    MOVF TMR0, W', dev);
            steps(cpu, 6);
            const reads = [];
            for (let i = 0; i < 4; i++) {
                cpu.step();
                reads.push(cpu.W);
            }
            assert.deepEqual(reads, [0x10, 0x10, 0x11, 0x12]);
        });

        test('CLRWDT azzera il prescaler solo se e\' assegnato al watchdog', async () => {
            const cpu = await cpuWith('    BSF STATUS, RP0\n    MOVLW 0x07\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n' +
                '    NOP\n    NOP\n    NOP\n    CLRWDT', dev);
            steps(cpu, 7);
            const tmr0 = cpu.getPeripheral('TMR0');
            const before = tmr0.prescalerCount;
            assert.ok(before > 0);
            steps(cpu, 1);
            assert.equal(tmr0.prescalerCount, before + 1, 'PSA = 0: il prescaler e\' del Timer0');
        });
    });

    describe(`${dev}: interrupt`, () => {
        test('il salto al vettore di interrupt costa 2 cicli', async () => {
            const cpu = await cpuWith('    GOTO MAIN\n    ORG 4\n    RETFIE\nMAIN: BSF INTCON, GIE\n    BSF INTCON, INTE\nL: GOTO L', dev);
            steps(cpu, 3);
            cpu.ram[0x81] = 0x40; // INTEDG = 1
            cpu.setExternalInput('B', 0, 1);
            const before = cpu.cycles;
            steps(cpu, 1);
            assert.equal(cpu.PC, 4);
            assert.equal(cpu.cycles - before, 2);
        });

        test('INTF e RBIF si alzano anche con l\'interrupt disabilitato', async () => {
            const cpu = await newCpu(dev);
            cpu.ram[0x81] = 0x40;
            cpu.setExternalInput('B', 0, 1);
            cpu.setExternalInput('B', 5, 1);
            assert.equal(cpu.ram[0x0B] & 0x03, 0x03);
            assert.equal(cpu.checkInterrupts(), false);
        });

        test('un pin RB4-RB7 configurato come uscita non genera RBIF', async () => {
            const cpu = await newCpu(dev);
            cpu.ram[0x86] = 0x0F; // RB4-RB7 uscite
            cpu.setExternalInput('B', 6, 1);
            assert.equal(cpu.ram[0x0B] & 0x01, 0);
        });
    });
}

for (const dev of ['PIC16F628A', 'PIC16F877A']) {
    describe(`${dev}: interrupt di periferica`, () => {
        const SRC = '    GOTO MAIN\n    ORG 4\n    INCF 0x20, F\n    BCF PIR1, TMR1IF\n    RETFIE\n' +
            'MAIN: BSF STATUS, RP0\n    BSF PIE1, TMR1IE\n    BCF STATUS, RP0\n' +
            '    MOVLW 0xFF\n    MOVWF TMR1H\n    MOVLW 0xF0\n    MOVWF TMR1L\n    BSF T1CON, TMR1ON\n';

        test('overflow di TMR1 con GIE e PEIE: ISR', async () => {
            const cpu = await cpuWith(SRC + '    MOVLW 0xC0\n    MOVWF INTCON\nL: GOTO L', dev);
            for (let i = 0; i < 60 && cpu.ram[0x20] === 0; i++) cpu.step();
            assert.equal(cpu.ram[0x20], 1);
        });

        test('senza PEIE il flag resta alzato ma non c\'e\' interrupt', async () => {
            const cpu = await cpuWith(SRC + '    BSF INTCON, GIE\nL: GOTO L', dev);
            steps(cpu, 60);
            assert.equal(cpu.ram[0x0C] & 0x01, 0x01, 'TMR1IF');
            assert.equal(cpu.ram[0x20], 0);
        });
    });
}

describe('PIC16F84A: INTCON.6 e\' EEIE, non PEIE', () => {
    test('GPR a 0x0C/0x8C con tutti i bit a 1 non genera interrupt', async () => {
        const cpu = await cpuWith('    MOVLW 0xFF\n    MOVWF 0x0C\n    MOVLW 0xC0\n    MOVWF INTCON\n    NOP\n    NOP');
        steps(cpu, 6);
        assert.equal(cpu.PC, 6);
    });
});

for (const dev of DEVICES) {
    describe(`${dev}: EEPROM`, () => {
        const ee = layout(dev).eeprom;
        const write = (value, addr) =>
            `    BANKSEL EEADR\n    MOVLW ${addr}\n    MOVWF EEADR\n    MOVLW ${value}\n    MOVWF EEDATA\n` +
            '    BANKSEL EECON1\n    BSF EECON1, WREN\n    MOVLW 0x55\n    MOVWF EECON2\n' +
            '    MOVLW 0xAA\n    MOVWF EECON2\n    BSF EECON1, WR\n    BANKSEL 0\n';
        const eeif = (cpu) => (cpu.ram[ee.flag.addr] >> ee.flag.bit) & 1;

        test('dopo la programmazione la EEPROM e\' cancellata (0xFF)', async () => {
            const cpu = await newCpu(dev);
            assert.ok(cpu.getEEPROMData().every((b) => b === 0xFF));
        });

        test('la sequenza 0x55/0xAA scrive e imposta EEIF', async () => {
            const cpu = await cpuWith(write(0x3C, 5) + 'L: GOTO L', dev);
            steps(cpu, 40);
            assert.equal(cpu.readEEPROM(5), 0x3C);
            assert.equal(eeif(cpu), 1);
        });

        test('la fine scrittura non accende INTE', async () => {
            // Regressione: con INTCON.6 attivo veniva impostato il bit 4 di INTCON.
            const cpu = await cpuWith('    BSF INTCON, 6\n' + write(1, 0) + 'L: GOTO L', dev);
            steps(cpu, 40);
            assert.equal(cpu.ram[0x0B] & 0x10, 0);
        });

        test('senza la sequenza di sblocco non scrive', async () => {
            const cpu = await cpuWith('    BANKSEL EEDATA\n    MOVLW 7\n    MOVWF EEDATA\n    BANKSEL EECON1\n    BSF EECON1, WREN\n    BSF EECON1, WR\nL: GOTO L', dev);
            steps(cpu, 20);
            assert.equal(cpu.readEEPROM(0), 0xFF);
        });

        test('lettura con RD', async () => {
            const cpu = await cpuWith('    BANKSEL EEADR\n    MOVLW 3\n    MOVWF EEADR\n    BANKSEL EECON1\n    BSF EECON1, RD\n' +
                '    BANKSEL EEDATA\n    MOVF EEDATA, W\nL: GOTO L', dev);
            cpu.getPeripheral('EEPROM').writeByte(3, 0x99);
            steps(cpu, 20);
            assert.equal(cpu.W, 0x99);
        });

        test('il Reset non cancella EEPROM e memoria programma', async () => {
            const cpu = await cpuWith(write(0x3C, 5) + 'L: GOTO L', dev);
            const first = cpu.programMemory[0];
            steps(cpu, 40);
            cpu.reset();
            assert.equal(cpu.readEEPROM(5), 0x3C);
            assert.equal(cpu.PC, 0);
            assert.equal(cpu.programMemory[0], first);
        });

        test('fine scrittura con interrupt EEPROM abilitato: ISR', async () => {
            const en = ee.enable;
            const enable = en.addr === 0x0B
                ? '    MOVLW 0xC0\n    MOVWF INTCON\n'
                : `    BANKSEL 0x${en.addr.toString(16)}\n    BSF 0x${(en.addr & 0x7F).toString(16)}, ${en.bit}\n    BANKSEL 0\n    MOVLW 0xC0\n    MOVWF INTCON\n`;
            const clear = `    BANKSEL 0x${ee.flag.addr.toString(16)}\n    BCF 0x${(ee.flag.addr & 0x7F).toString(16)}, ${ee.flag.bit}\n    BANKSEL 0\n`;
            // La ISR scatta subito dopo BSF EECON1, WR: seleziona il banco 0.
            const cpu = await cpuWith('    GOTO MAIN\n    ORG 4\n    BANKSEL 0\n    INCF 0x20, F\n' + clear + '    RETFIE\n' +
                'MAIN:\n' + enable + write(0x11, 1) + 'L: GOTO L', dev);
            for (let i = 0; i < 80 && cpu.ram[0x20] === 0; i++) cpu.step();
            assert.equal(cpu.ram[0x20], 1);
            steps(cpu, 10);
            assert.equal(cpu.ram[0x20], 1, 'EEIF azzerato nella ISR: una sola volta');
        });
    });

    describe(`${dev}: SLEEP`, () => {
        const sleeper = (setup) => cpuWith(
            '    GOTO MAIN\n    ORG 4\n    INCF 0x21, F\n    BCF INTCON, INTF\n    RETFIE\n' +
            `MAIN: ${setup}\n    SLEEP\n    INCF 0x20, F\nL: GOTO L`, dev);

        test('imposta PD = 0 e TO = 1', async () => {
            const cpu = await sleeper('NOP');
            steps(cpu, 3);
            assert.equal(cpu.sleeping, true);
            assert.equal(cpu.ram[0x03] & 0x18, 0x10);
        });

        test('Timer0 non conta durante lo sleep', async () => {
            const cpu = await sleeper('BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0');
            steps(cpu, 6);
            assert.equal(cpu.sleeping, true);
            const tmr0 = cpu.ram[0x01];
            steps(cpu, 50);
            assert.equal(cpu.ram[0x01], tmr0);
        });

        test('con GIE = 0 si risveglia su INT e prosegue dopo SLEEP', async () => {
            const cpu = await sleeper('BSF INTCON, INTE');
            steps(cpu, 3);
            assert.equal(cpu.sleeping, true);
            cpu.ram[0x81] = 0x40;
            cpu.setExternalInput('B', 0, 1);
            steps(cpu, 2); // risveglio, poi INCF 0x20
            assert.equal(cpu.sleeping, false);
            assert.equal(cpu.ram[0x20], 1);
            assert.equal(cpu.ram[0x21], 0, 'nessuna ISR');
        });

        test('con GIE = 1 esegue l\'istruzione dopo SLEEP e poi la ISR', async () => {
            const cpu = await sleeper('MOVLW 0x90\n    MOVWF INTCON');
            steps(cpu, 4);
            assert.equal(cpu.sleeping, true);
            cpu.ram[0x81] = 0x40;
            cpu.setExternalInput('B', 0, 1);
            steps(cpu, 2); // risveglio, poi INCF 0x20
            assert.equal(cpu.ram[0x20], 1);
            steps(cpu, 2); // salto al vettore, INCF 0x21
            assert.equal(cpu.ram[0x21], 1);
        });

        test('senza sorgenti abilitate resta addormentato', async () => {
            const cpu = await sleeper('NOP');
            steps(cpu, 3);
            cpu.ram[0x81] = 0x40;
            cpu.setExternalInput('B', 0, 1); // INTF si alza ma INTE e' spento
            steps(cpu, 20);
            assert.equal(cpu.sleeping, true);
        });
    });
}

for (const dev of ['PIC16F628A', 'PIC16F877A']) {
    test(`${dev}: una periferica con PEIE risveglia da SLEEP anche con GIE = 0`, async () => {
        const cpu = await cpuWith('    BSF STATUS, RP0\n    BSF PIE1, TMR1IE\n    BCF STATUS, RP0\n    BSF INTCON, PEIE\n' +
            '    SLEEP\n    INCF 0x20, F\nL: GOTO L', dev);
        steps(cpu, 6);
        assert.equal(cpu.sleeping, true);
        cpu.ram[0x0C] |= 0x01; // TMR1IF, come da un clock esterno asincrono
        steps(cpu, 2);
        assert.equal(cpu.sleeping, false);
        assert.equal(cpu.ram[0x20], 1);
    });
}
