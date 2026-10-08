const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PIC16F84A, cpuWith, steps } = require('./helpers');

const Z = 0x04, C = 0x01, DC = 0x02;
const flags = cpu => cpu.ram[0x03] & (Z | C | DC);

describe('flag di STATUS', () => {
    test('Z impostato da un risultato nullo e azzerato da uno non nullo', () => {
        // Regressione: setZ(true) azzerava Z, che non veniva mai impostato.
        const cpu = cpuWith('    MOVLW 0\n    MOVWF 0x20\n    MOVF 0x20, F\n    MOVLW 1\n    IORLW 0');
        steps(cpu, 3);
        assert.equal(cpu.ram[0x03] & Z, Z, 'MOVF di uno zero');
        steps(cpu, 2);
        assert.equal(cpu.ram[0x03] & Z, 0, 'IORLW con risultato 1');
    });

    test('CLRF e CLRW impostano Z', () => {
        const cpu = cpuWith('    MOVLW 1\n    IORLW 1\n    CLRW\n    IORLW 1\n    CLRF 0x20');
        steps(cpu, 3);
        assert.equal(cpu.ram[0x03] & Z, Z);
        steps(cpu, 2);
        assert.equal(cpu.ram[0x03] & Z, Z);
    });

    test('ADDWF: riporto, mezzo riporto e zero', () => {
        const cpu = cpuWith('    MOVLW 0xF8\n    MOVWF 0x20\n    MOVLW 0x08\n    ADDWF 0x20, F');
        steps(cpu, 4);
        assert.equal(cpu.ram[0x20], 0x00);
        assert.equal(flags(cpu), Z | C | DC);
    });

    test('SUBWF: C = 1 significa nessun prestito', () => {
        const cpu = cpuWith('    MOVLW 5\n    MOVWF 0x20\n    MOVLW 3\n    SUBWF 0x20, W\n    SUBLW 1');
        steps(cpu, 4);
        assert.equal(cpu.W, 2);
        assert.equal(cpu.ram[0x03] & C, C, '5 - 3: nessun prestito');
        steps(cpu, 1);
        assert.equal(cpu.W, 0xFF);
        assert.equal(cpu.ram[0x03] & C, 0, '1 - 2: prestito');
    });

    test('RLF e RRF ruotano attraverso il carry', () => {
        const cpu = cpuWith('    MOVLW 0x81\n    MOVWF 0x20\n    BCF STATUS, C\n    RLF 0x20, F\n    RRF 0x20, F');
        steps(cpu, 4);
        assert.equal(cpu.ram[0x20], 0x02);
        assert.equal(cpu.ram[0x03] & C, C);
        steps(cpu, 1);
        assert.equal(cpu.ram[0x20], 0x81);
        assert.equal(cpu.ram[0x03] & C, 0);
    });

    test('TO e PD non sono scrivibili', () => {
        const cpu = cpuWith('    CLRF STATUS');
        steps(cpu, 1);
        assert.equal(cpu.ram[0x03] & 0x18, 0x18);
    });
});

describe('salti condizionati e cicli', () => {
    test('DECFSZ salta quando arriva a zero, contando 2 cicli', () => {
        const cpu = cpuWith('    MOVLW 1\n    MOVWF 0x20\n    DECFSZ 0x20, F\n    GOTO 0\n    NOP');
        steps(cpu, 3);
        assert.equal(cpu.PC, 4);
        assert.equal(cpu.cycles, 4);
    });

    test('BTFSS e BTFSC', () => {
        const cpu = cpuWith('    BSF 0x20, 3\n    BTFSS 0x20, 3\n    NOP\n    BTFSC 0x20, 3\n    NOP');
        steps(cpu, 2);
        assert.equal(cpu.PC, 3, 'BTFSS su bit a 1 salta');
        steps(cpu, 1);
        assert.equal(cpu.PC, 4, 'BTFSC su bit a 1 non salta');
    });

    test('GOTO e CALL contano 2 cicli', () => {
        const cpu = cpuWith('    CALL SUB\n    NOP\nSUB: RETURN');
        steps(cpu, 2);
        assert.equal(cpu.PC, 1);
        assert.equal(cpu.cycles, 4);
    });
});

describe('memoria e banchi', () => {
    test('RP0 seleziona il banco 1 per TRISB', () => {
        const cpu = cpuWith('    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\n    MOVLW 0xA5\n    MOVWF PORTB');
        steps(cpu, 5);
        assert.equal(cpu.ram[0x86], 0x00);
        assert.equal(cpu.ram[0x06], 0xA5);
    });

    test('i GPR 0x0C-0x4F sono gli stessi nei due banchi', () => {
        const cpu = cpuWith('    MOVLW 0x42\n    BSF STATUS, RP0\n    MOVWF 0x20\n    BCF STATUS, RP0\n    MOVF 0x20, W');
        cpu.W = 0;
        steps(cpu, 5);
        assert.equal(cpu.W, 0x42);
    });

    test('lettura di PORTB: latch sulle uscite, livello esterno sugli ingressi', () => {
        const cpu = cpuWith('    BSF STATUS, RP0\n    MOVLW 0xF0\n    MOVWF TRISB\n    BCF STATUS, RP0\n    MOVLW 0x0F\n    MOVWF PORTB\n    MOVF PORTB, W');
        cpu.setExternalInput('B', 7, 1);
        steps(cpu, 7);
        assert.equal(cpu.W, 0x8F);
    });

    test('indirizzamento indiretto con FSR e INDF', () => {
        const cpu = cpuWith('    MOVLW 0x20\n    MOVWF FSR\n    MOVLW 0x5A\n    MOVWF INDF\n    INCF FSR, F\n    MOVWF INDF');
        steps(cpu, 6);
        assert.equal(cpu.ram[0x20], 0x5A);
        assert.equal(cpu.ram[0x21], 0x5A);
    });

    test('FSR tra 0x8C e 0xCF raggiunge i GPR 0x0C-0x4F', () => {
        const cpu = cpuWith('    MOVLW 0x8C\n    MOVWF FSR\n    MOVLW 0x42\n    MOVWF INDF');
        steps(cpu, 4);
        assert.equal(cpu.ram[0x0C], 0x42);
    });

    test('una scrittura su PORTB tramite INDF aggiorna le uscite', () => {
        const cpu = cpuWith('    MOVLW PORTB\n    MOVWF FSR\n    MOVLW 0xFF\n    MOVWF INDF');
        let notified = 0;
        cpu.onPortChange = () => notified++;
        steps(cpu, 4);
        assert.ok(notified > 0);
        assert.equal(cpu.ram[0x06], 0xFF);
    });

    test('FSR verso TRISB scrive il registro del banco 1', () => {
        const cpu = cpuWith('    MOVLW TRISB\n    MOVWF FSR\n    MOVLW 0x0F\n    MOVWF INDF\n    MOVF INDF, W');
        steps(cpu, 5);
        assert.equal(cpu.ram[0x86], 0x0F);
        assert.equal(cpu.W, 0x0F);
    });

    test('INDF con FSR che punta a INDF legge 0 e non scrive', () => {
        const cpu = cpuWith('    CLRF FSR\n    MOVLW 0x55\n    MOVWF INDF\n    MOVF INDF, W');
        steps(cpu, 4);
        assert.equal(cpu.W, 0);
    });

    test('0x50-0x7F non e\' implementata: si legge 0', () => {
        const cpu = cpuWith('    MOVLW 0x42\n    MOVWF 0x50\n    MOVF 0x50, W');
        steps(cpu, 3);
        assert.equal(cpu.W, 0);
    });

    test('PCLATH entra nel PC con la scrittura di PCL, mascherato a 5 bit', () => {
        const cpu = cpuWith('    MOVLW 0xE1\n    MOVWF PCLATH\n    MOVLW 0x23\n    MOVWF PCL');
        steps(cpu, 4);
        assert.equal(cpu.PC, 0x0123);
    });

    test('ADDWF PCL per il GOTO calcolato', () => {
        const cpu = cpuWith('    MOVLW 2\n    CALL TAB\n    GOTO $\nTAB: ADDWF PCL, F\n    RETLW 10\n    RETLW 11\n    RETLW 12');
        steps(cpu, 5);
        assert.equal(cpu.W, 12);
        assert.equal(cpu.PC, 2);
    });
});

describe('stack', () => {
    test('8 livelli circolari: il nono CALL sovrascrive il primo', () => {
        const cpu = cpuWith('L: CALL L');
        steps(cpu, 9);
        assert.equal(cpu.stackPointer, 1);
        assert.deepEqual(Array.from(cpu.stack), Array(8).fill(1));
    });
});

describe('Timer0 e interrupt', () => {
    test('overflow di TMR0 imposta T0IF e salta al vettore 0x04', () => {
        const cpu = cpuWith(
            '    GOTO MAIN\n    ORG 4\n    GOTO ISR\n' +
            'MAIN: BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n' +
            '    MOVLW 0xA0\n    MOVWF INTCON\n    MOVLW 0xF0\n    MOVWF TMR0\nLOOP: GOTO LOOP\n' +
            'ISR: BCF INTCON, T0IF\n    INCF 0x20, F\n    RETFIE'
        );
        for (let i = 0; i < 30 && cpu.ram[0x20] === 0; i++) cpu.step();
        assert.equal(cpu.ram[0x20], 1, 'la ISR e\' stata eseguita');
        assert.equal(cpu.ram[0x0B] & 0x80, 0, 'GIE azzerato dentro la ISR');
        steps(cpu, 1);
        assert.equal(cpu.ram[0x0B] & 0x80, 0x80, 'RETFIE riattiva GIE');
        assert.equal(cpu.PC, 13, 'ritorno nel loop (LOOP = 0x0D)');
    });

    test('prescaler 1:4 su TMR0', () => {
        const cpu = cpuWith('    BSF STATUS, RP0\n    MOVLW 0x01\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n    CLRF TMR0\nL: GOTO L');
        steps(cpu, 5);
        steps(cpu, 8); // 8 GOTO = 16 cicli, 1 fermo dopo CLRF TMR0: 15 / 4 = 3
        assert.equal(cpu.ram[0x01], 3);
    });

    test('TMR0 avanza di un passo per ciclo, anche sulle istruzioni da 2 cicli', () => {
        const cpu = cpuWith('    BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n    CLRF TMR0\nL: GOTO L');
        steps(cpu, 5);
        const start = cpu.cycles;
        steps(cpu, 10); // 10 GOTO = 20 cicli
        // Il secondo dei due cicli fermi dopo CLRF TMR0 cade qui.
        assert.equal(cpu.ram[0x01], cpu.cycles - start - 1);
    });

    test('dopo una scrittura TMR0 resta fermo per due cicli', () => {
        // Come nel diagramma del datasheet: le due letture dopo MOVWF TMR0
        // danno il valore scritto, la terza lo vede incrementato.
        const cpu = cpuWith('    BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0\n' +
            '    MOVLW 0x10\n    MOVWF TMR0\n    MOVF TMR0, W\n    MOVF TMR0, W\n    MOVF TMR0, W\n    MOVF TMR0, W');
        steps(cpu, 6);
        const reads = [];
        for (let i = 0; i < 4; i++) {
            cpu.step();
            reads.push(cpu.W);
        }
        assert.deepEqual(reads, [0x10, 0x10, 0x11, 0x12]);
    });

    test('il salto al vettore di interrupt costa 2 cicli', () => {
        const cpu = cpuWith('    GOTO MAIN\n    ORG 4\n    RETFIE\nMAIN: BSF INTCON, GIE\n    BSF INTCON, INTE\nL: GOTO L');
        steps(cpu, 3);
        cpu.ram[0x81] = 0x40; // INTEDG = 1
        cpu.setExternalInput('B', 0, 1);
        const before = cpu.cycles;
        steps(cpu, 1);
        assert.equal(cpu.PC, 4);
        assert.equal(cpu.cycles - before, 2);
    });

    test('fronte di salita su RB0/INT con INTEDG = 1', () => {
        const cpu = new PIC16F84A();
        cpu.ram[0x81] = 0x40;
        cpu.ram[0x0B] = 0x10;
        cpu.setExternalInput('B', 0, 1);
        assert.equal(cpu.ram[0x0B] & 0x02, 0x02);
    });

    test('INTF e RBIF si alzano anche con l\'interrupt disabilitato', () => {
        const cpu = new PIC16F84A();
        cpu.ram[0x81] = 0x40;
        cpu.setExternalInput('B', 0, 1);
        cpu.setExternalInput('B', 5, 1);
        assert.equal(cpu.ram[0x0B] & 0x03, 0x03);
        assert.equal(cpu.checkInterrupts(), false);
    });

    test('cambio su RB4-RB7 imposta RBIF', () => {
        const cpu = new PIC16F84A();
        cpu.ram[0x0B] = 0x08;
        cpu.setExternalInput('B', 6, 1);
        assert.equal(cpu.ram[0x0B] & 0x01, 0x01);
    });

    test('un pin RB4-RB7 configurato come uscita non genera RBIF', () => {
        const cpu = new PIC16F84A();
        cpu.ram[0x86] = 0x0F; // RB4-RB7 uscite
        cpu.setExternalInput('B', 6, 1);
        assert.equal(cpu.ram[0x0B] & 0x01, 0);
    });
});

describe('EEPROM', () => {
    const write = (value, addr) =>
        `    MOVLW ${addr}\n    MOVWF EEADR\n    MOVLW ${value}\n    MOVWF EEDATA\n` +
        '    BSF STATUS, RP0\n    BSF EECON1, WREN\n    MOVLW 0x55\n    MOVWF EECON2\n' +
        '    MOVLW 0xAA\n    MOVWF EECON2\n    BSF EECON1, WR\n    BCF STATUS, RP0\n';

    test('la sequenza 0x55/0xAA scrive e imposta EEIF', () => {
        const cpu = cpuWith(write(0x3C, 5));
        steps(cpu, 12);
        assert.equal(cpu.eeprom[5], 0x3C);
        assert.equal(cpu.ram[0x88] & 0x10, 0x10);
    });

    test('la fine scrittura non accende INTE', () => {
        // Regressione: con EEIE attivo veniva impostato il bit 4 di INTCON.
        const cpu = cpuWith('    BSF INTCON, EEIE\n' + write(1, 0));
        steps(cpu, 13);
        assert.equal(cpu.ram[0x0B] & 0x10, 0);
    });

    test('senza la sequenza di sblocco non scrive', () => {
        const cpu = cpuWith('    MOVLW 7\n    MOVWF EEDATA\n    BSF STATUS, RP0\n    BSF EECON1, WREN\n    BSF EECON1, WR');
        steps(cpu, 5);
        assert.equal(cpu.eeprom[0], 0xFF);
    });

    test('dopo la programmazione la EEPROM e\' cancellata (0xFF)', () => {
        assert.ok(new PIC16F84A().eeprom.every(b => b === 0xFF));
    });

    test('il Reset non cancella la EEPROM', () => {
        const cpu = cpuWith(write(0x3C, 5));
        steps(cpu, 12);
        cpu.reset();
        assert.equal(cpu.eeprom[5], 0x3C);
        assert.equal(cpu.PC, 0);
        assert.equal(cpu.programMemory[0], 0x3005, 'anche la memoria programma resta');
    });

    test('lettura con RD', () => {
        const cpu = cpuWith('    MOVLW 3\n    MOVWF EEADR\n    BSF STATUS, RP0\n    BSF EECON1, RD\n    BCF STATUS, RP0\n    MOVF EEDATA, W');
        cpu.eeprom[3] = 0x99;
        steps(cpu, 6);
        assert.equal(cpu.W, 0x99);
    });
});

describe('SLEEP', () => {
    const sleeper = (setup) => cpuWith(
        '    GOTO MAIN\n    ORG 4\n    INCF 0x21, F\n    BCF INTCON, INTF\n    RETFIE\n' +
        `MAIN: ${setup}\n    SLEEP\n    INCF 0x20, F\nL: GOTO L`
    );

    test('imposta PD = 0 e TO = 1', () => {
        const cpu = sleeper('NOP');
        steps(cpu, 3);
        assert.equal(cpu.sleeping, true);
        assert.equal(cpu.ram[0x03] & 0x18, 0x10);
    });

    test('Timer0 non conta durante lo sleep', () => {
        const cpu = sleeper('BSF STATUS, RP0\n    MOVLW 0x08\n    MOVWF OPTION_REG\n    BCF STATUS, RP0');
        steps(cpu, 6);
        assert.equal(cpu.sleeping, true);
        const tmr0 = cpu.ram[0x01];
        steps(cpu, 50);
        assert.equal(cpu.ram[0x01], tmr0);
    });

    test('con GIE = 0 si risveglia su INT e prosegue dopo SLEEP', () => {
        const cpu = sleeper('BSF INTCON, INTE');
        steps(cpu, 3);
        assert.equal(cpu.sleeping, true);
        cpu.ram[0x81] = 0x40;
        cpu.setExternalInput('B', 0, 1);
        steps(cpu, 2); // risveglio, poi INCF 0x20
        assert.equal(cpu.sleeping, false);
        assert.equal(cpu.ram[0x20], 1);
        assert.equal(cpu.ram[0x21], 0, 'nessuna ISR');
    });

    test('con GIE = 1 esegue l\'istruzione dopo SLEEP e poi la ISR', () => {
        const cpu = sleeper('MOVLW 0x90\n    MOVWF INTCON');
        steps(cpu, 4);
        assert.equal(cpu.sleeping, true);
        cpu.ram[0x81] = 0x40;
        cpu.setExternalInput('B', 0, 1);
        steps(cpu, 2); // risveglio, poi INCF 0x20
        assert.equal(cpu.ram[0x20], 1);
        steps(cpu, 2); // salto al vettore, INCF 0x21
        assert.equal(cpu.ram[0x21], 1);
    });

    test('senza sorgenti abilitate resta addormentato', () => {
        const cpu = sleeper('NOP');
        steps(cpu, 3);
        cpu.ram[0x81] = 0x40;
        cpu.setExternalInput('B', 0, 1); // INTF si alza ma INTE e' spento
        steps(cpu, 20);
        assert.equal(cpu.sleeping, true);
    });
});
