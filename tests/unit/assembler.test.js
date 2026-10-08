const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PIC16Assembler, hexWords } = require('./helpers');

function words(source) {
    const result = new PIC16Assembler().assemble(source);
    assert.ok(result.success, 'errori inattesi: ' + JSON.stringify(result.errors));
    return hexWords(result.programMemory);
}

function errors(source) {
    const result = new PIC16Assembler().assemble(source);
    assert.equal(result.success, false, 'atteso un errore, assemblato: ' + hexWords(result.programMemory));
    return result.errors;
}

describe('codifica delle istruzioni', () => {
    test('le 35 istruzioni', () => {
        const source = [
            'ADDWF 0x20,W', 'ANDWF 0x20,F', 'CLRF 0x20', 'CLRW', 'COMF 0x20,F', 'DECF 0x20,F',
            'DECFSZ 0x20,F', 'INCF 0x20,F', 'INCFSZ 0x20,F', 'IORWF 0x20,F', 'MOVF 0x20,W',
            'MOVWF 0x20', 'NOP', 'RLF 0x20,F', 'RRF 0x20,F', 'SUBWF 0x20,F', 'SWAPF 0x20,F',
            'XORWF 0x20,F', 'BCF 0x20,3', 'BSF 0x20,3', 'BTFSC 0x20,3', 'BTFSS 0x20,3',
            'ADDLW 0x55', 'ANDLW 0x55', 'IORLW 0x55', 'MOVLW 0x55', 'RETLW 0x55', 'SUBLW 0x55',
            'XORLW 0x55', 'CALL 0x123', 'GOTO 0x123', 'RETURN', 'RETFIE', 'CLRWDT', 'SLEEP',
        ].map(l => '    ' + l).join('\n');
        assert.equal(words(source), [
            '0720', '05A0', '01A0', '0100', '09A0', '03A0', '0BA0', '0AA0', '0FA0', '04A0', '0820',
            '00A0', '0000', '0DA0', '0CA0', '02A0', '0EA0', '06A0', '11A0', '15A0', '19A0', '1DA0',
            '3E55', '3955', '3855', '3055', '3455', '3C55', '3A55', '2123', '2923', '0008', '0009',
            '0064', '0063',
        ].join(' '));
    });

    test('disassemble e assemble sono inversi', () => {
        const result = new PIC16Assembler().assemble('    MOVLW 0x3C\n    BSF 0x06, 2\n    GOTO 0x10\n    ADDWF 0x0C, W');
        for (const word of result.programMemory) {
            const text = PIC16Assembler.disassemble(word);
            assert.equal(words('    ' + text), hexWords([word]), text);
        }
    });
});

describe('etichette e simboli', () => {
    test('$ e $-n sono l\'indirizzo corrente', () => {
        assert.equal(words('    NOP\n    GOTO $'), '0000 2801');
        assert.equal(words('    NOP\n    NOP\n    GOTO $-1'), '0000 0000 2801');
    });

    test('etichetta in colonna 1 senza due punti (stile MPASM)', () => {
        assert.equal(words('LOOP NOP\n    GOTO LOOP'), '0000 2800');
        assert.equal(words('LOOP\n    GOTO LOOP'), '2800');
    });

    test('una direttiva o un\'istruzione in colonna 1 non diventa etichetta', () => {
        assert.equal(words('ORG 0x02\nNOP\nGOTO $'), '3FFF 3FFF 0000 2803');
    });

    test('etichetta duplicata', () => {
        assert.match(errors('L: NOP\nL: NOP')[0].message, /Duplicate label/);
    });

    test('simbolo non definito: errore, non un esadecimale letto per meta\'', () => {
        // FETCH finiva in parseInt("FETC", 16) = 0xFE
        assert.match(errors('    GOTO FETCH')[0].message, /Undefined symbol: FETCH/);
    });

    test('nomi dei bit come nel file .inc di Microchip', () => {
        assert.equal(words('    BCF OPTION_REG, NOT_RBPU\n    BTFSS STATUS, NOT_TO\n    BSF INTCON, TMR0IE'),
            '1381 1E03 168B');
    });
});

describe('#define', () => {
    test('sostituisce un registro senza far sparire l\'istruzione', () => {
        // Prima CLRF X spariva e GOTO L puntava all'indirizzo sbagliato.
        assert.equal(words('#define X PORTB\n    CLRF X\n    NOP\nL:  GOTO L'), '0186 0000 2802');
    });

    test('sostituisce una coppia registro,bit', () => {
        assert.equal(words('#define LED PORTB,0\n    BSF LED\n    BCF LED'), '1406 1006');
    });

    test('non sostituisce dentro i letterali carattere', () => {
        assert.equal(words("#define A 5\n    MOVLW 'A'\n    MOVLW A"), '3041 3005');
    });

    test('mantiene i numeri di riga degli errori', () => {
        assert.equal(errors('#define X 1\n\n    BSF PORTB, 9')[0].line, 3);
    });
});

describe('espressioni e letterali', () => {
    test('operatori, parentesi e precedenze', () => {
        assert.equal(words('V EQU 5\n    MOVLW V + 1\n    MOVLW (V*2) | 1\n    MOVLW 1 << 3 + 1'),
            '3006 300B 3010');
    });

    test('HIGH e LOW', () => {
        const result = new PIC16Assembler().assemble('    ORG 0x123\nT:  MOVLW HIGH T\n    MOVLW LOW T');
        assert.ok(result.success);
        assert.equal(hexWords(result.programMemory.slice(0x123)), '3001 3023');
    });

    test('notazioni numeriche MPASM', () => {
        assert.equal(words("    MOVLW 0x1F\n    MOVLW H'1F'\n    MOVLW 1FH\n    MOVLW $1F\n" +
            "    MOVLW B'00011111'\n    MOVLW 0b00011111\n    MOVLW %00011111\n" +
            "    MOVLW O'37'\n    MOVLW D'31'\n    MOVLW .31\n    MOVLW 31"),
            Array(11).fill('301F').join(' '));
    });

    test('caratteri, senza cambiarne le maiuscole', () => {
        assert.equal(words("    MOVLW 'a'\n    MOVLW A'z'\n    MOVLW ','\n    MOVLW ';'"), '3061 307A 302C 303B');
    });

    test('letterale negativo in complemento a due', () => {
        assert.equal(words('    MOVLW -1\n    ADDLW -128'), '30FF 3E80');
    });

    test('RADIX HEX e LIST R=HEX', () => {
        assert.equal(words('    RADIX HEX\n    MOVLW 10\n    MOVLW .10\n    MOVLW 0B1'), '3010 300A 30B1');
        assert.equal(words('    LIST P=16F84A, R=HEX\n    MOVLW 20'), '3020');
    });

    for (const [source, pattern] of [
        ["    MOVLW B'0102'", /Invalid number/],
        ['    MOVLW 0xZZ', /Invalid number/],
        ['    MOVLW 12abc', /Invalid number/],
        ['    MOVLW 4/0', /Division by zero/],
        ['    MOVLW (1 + 2', /Missing '\)'/],
        ['    MOVLW 1 +', /Incomplete expression/],
    ]) {
        test(`rifiuta ${source.trim()}`, () => {
            assert.match(errors(source)[0].message, pattern);
        });
    }
});

describe('controlli di intervallo e operandi', () => {
    for (const [source, pattern] of [
        ['    MOVLW .300', /Literal out of range/],
        ['    MOVLW -129', /Literal out of range/],
        ['    ADDWF 0x20, 2', /Destination \(W or F\) out of range/],
        ['    BSF PORTB, 8', /Bit number out of range/],
        ['    CLRF 0x100', /File register out of range/],
        ['    GOTO 0x400', /Address out of range/],
        ['    ORG 0x3FF\n    NOP\n    NOP', /outside program memory/],
        ['    MOVLW 1, 2', /Too many operands for MOVLW/],
        ['    MOVF', /Missing operand for MOVF/],
        ['    BSF PORTB', /Missing operand for BSF/],
        ['    RETURN 1', /Too many operands for RETURN/],
        ['    FOO 1', /Unknown instruction: FOO/],
    ]) {
        test(`errore su ${source.trim().replace(/\n\s*/g, ' / ')}`, () => {
            assert.match(errors(source).map(e => e.message).join('\n'), pattern);
        });
    }

    test('registri del banco 1 accettati e troncati a 7 bit', () => {
        assert.equal(words('    CLRF TRISB\n    BSF OPTION_REG, 7'), '0186 1781');
    });

    test('destinazione omessa = F', () => {
        assert.equal(words('    INCF 0x20'), '0AA0');
    });

    test('tutti gli errori del programma, ognuno sulla sua riga', () => {
        const list = errors('L1: NOP\n    MOVLW FOO\n    GOTO L2\n    BSF PORTB,9');
        assert.deepEqual(list.map(e => e.line), [2, 3, 4]);
    });

    test('il messaggio riporta l\'operando cosi\' come scritto', () => {
        // La UI lo deve inserire come testo: e2e/simulator.spec.js lo verifica.
        assert.match(errors('    MOVLW <img/src=x>')[0].message, /<img\/src=x>/);
    });
});

describe('direttive', () => {
    test('CBLOCK con virgole, dimensioni e continuazione', () => {
        assert.equal(words('    CBLOCK 0x20\n    A, B\n    C:2, D\n    ENDC\n    MOVF B,W\n    MOVF D,W'), '0821 0824');
        assert.equal(words('    CBLOCK 0x20\n    A\n    ENDC\n    CBLOCK\n    B\n    ENDC\n    CLRF B'), '01A1');
    });

    test('CBLOCK senza ENDC e ENDC senza CBLOCK', () => {
        assert.match(errors('    CBLOCK 0x20\n    A\n    NOP')[0].message, /CBLOCK senza ENDC/);
        assert.match(errors('    ENDC')[0].message, /ENDC senza CBLOCK/);
    });

    test('EQU e SET valutano espressioni', () => {
        assert.equal(words('BASE EQU 0x20\nNEXT EQU BASE + 1\nN SET 3\n    MOVF NEXT, W\n    MOVLW N'), '0821 3003');
    });

    test('BANKSEL sceglie RP0 dal bit 7 dell\'indirizzo', () => {
        assert.equal(words('    BANKSEL TRISB\n    BANKSEL PORTB'), '1683 1283');
    });

    test('DT con stringhe e valori', () => {
        assert.equal(words('    DT "AB", 3'), '3441 3442 3403');
    });

    test('END ferma la lettura', () => {
        assert.equal(words('    NOP\n    END\n    questa riga non e\' assembler'), '0000');
    });

    test('DE a 0x2100 va nella EEPROM, non nella memoria programma', () => {
        const result = new PIC16Assembler().assemble('    NOP\n    ORG 0x2100\n    DE 7, "AB"');
        assert.ok(result.success);
        assert.equal(hexWords(result.programMemory), '0000');
        assert.deepEqual(result.eepromData, [7, 65, 66]);
    });

    test('direttive accettate e ignorate', () => {
        assert.equal(words('    LIST P=16F84A\n    #include <p16f84a.inc>\n    __CONFIG 0x3FF1\n' +
            '    ERRORLEVEL -302\n    PROCESSOR 16F84A\n    NOP'), '0000');
    });

    test('commento con apostrofo e ; tra apici', () => {
        assert.equal(words("    MOVLW ';' ; l'uscita"), '303B');
    });
});

describe('Intel HEX', () => {
    test('record dati con checksum e record di fine', () => {
        const asm = new PIC16Assembler();
        asm.assemble('    MOVLW 0x55\n    GOTO 0');
        assert.equal(asm.toIntelHex(), ':04000000553000284F\n:00000001FF');
    });
});
