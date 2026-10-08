const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PIC16F84A, PIC16Assembler, Simulator } = require('./helpers');

const make = () => new Simulator(new PIC16F84A(), new PIC16Assembler());

describe('Simulator', () => {
    test('loadSource carica il programma solo se l\'assemblaggio riesce', () => {
        const sim = make();
        assert.equal(sim.loadSource('    MOVLW 5').success, true);
        assert.equal(sim.cpu.programMemory[0], 0x3005);

        assert.equal(sim.loadSource('    FOO').success, false);
        assert.equal(sim.step(), false, 'senza un programma valido step non fa nulla');
    });

    test('DE precarica la EEPROM, anche dopo un Reset', () => {
        const sim = make();
        sim.loadSource('    NOP\n    ORG 0x2100\n    DE 0x11, 0x22');
        assert.deepEqual(Array.from(sim.cpu.eeprom.slice(0, 2)), [0x11, 0x22]);
        sim.cpu.eeprom[0] = 0;
        sim.reset();
        assert.equal(sim.cpu.eeprom[0], 0x11);
    });

    test('il breakpoint ferma step e chiama onBreakpoint', () => {
        const sim = make();
        sim.loadSource('    NOP\n    NOP\n    NOP');
        sim.toggleBreakpoint(2);
        let hit = null;
        sim.onBreakpoint = addr => { hit = addr; };
        sim.step();
        assert.equal(hit, null);
        sim.step();
        assert.equal(hit, 2);
    });

    test('i breakpoint sopravvivono al Reset', () => {
        const sim = make();
        sim.loadSource('    NOP');
        sim.toggleBreakpoint(0);
        sim.reset();
        assert.deepEqual(sim.getBreakpoints(), [0]);
    });

    test('getLineForAddress segue la mappa sorgente', () => {
        const sim = make();
        sim.loadSource('; commento\n    ORG 0\n    NOP\n\n    GOTO 0');
        assert.equal(sim.getLineForAddress(0), 3);
        assert.equal(sim.getLineForAddress(1), 5);
        assert.equal(sim.getAddressForLine(5), 1);
    });

    test('undo ripristina lo stato precedente allo step', () => {
        const sim = make();
        sim.loadSource('    MOVLW 7\n    MOVWF 0x20');
        sim.step();
        sim.step();
        assert.equal(sim.cpu.ram[0x20], 7);
        sim.undo();
        assert.equal(sim.cpu.ram[0x20], 0);
        assert.equal(sim.cpu.PC, 1);
    });

    test('getCurrentInstruction disassembla l\'istruzione al PC', () => {
        const sim = make();
        sim.loadSource('    MOVLW 0x3C');
        assert.equal(sim.getCurrentInstruction().disassembly, 'MOVLW 0x3C');
    });
});
