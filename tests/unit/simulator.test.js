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

    test('assemblare programma il chip: EEPROM cancellata e dati DE', () => {
        const sim = make();
        sim.loadSource('    NOP\n    ORG 0x2100\n    DE 0x11, 0x22');
        assert.deepEqual(Array.from(sim.cpu.eeprom.slice(0, 3)), [0x11, 0x22, 0xFF]);
    });

    test('il Reset conserva programma ed EEPROM scritta dal programma', () => {
        const sim = make();
        sim.loadSource('    MOVLW 5\n    ORG 0x2100\n    DE 0x11');
        sim.cpu.eeprom[0] = 0x99; // come se l'avesse scritta il programma
        sim.reset();
        assert.equal(sim.cpu.eeprom[0], 0x99);
        assert.equal(sim.cpu.programMemory[0], 0x3005);
        
        // Riassemblare riprogramma: torna il valore di DE.
        sim.loadSource('    MOVLW 5\n    ORG 0x2100\n    DE 0x11');
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

    test('getSimulatedTime: 4 periodi di clock per ciclo', () => {
        const sim = make();
        sim.cpu.cycles = 1000000;
        assert.equal(sim.getSimulatedTime(), 1);
        sim.setClockFrequency(20000000);
        assert.equal(sim.getSimulatedTime(), 0.2);
    });

    test('getCurrentInstruction disassembla l\'istruzione al PC', () => {
        const sim = make();
        sim.loadSource('    MOVLW 0x3C');
        assert.equal(sim.getCurrentInstruction().disassembly, 'MOVLW 0x3C');
    });
});

describe('Run a tempo', () => {
    /**
     * Simulatore con orologio finto: `clock.t` e' l'ora in ms, `clock.auto`
     * di quanto avanza a ogni lettura (simula il tempo di calcolo).
     * run() avvia l'intervallo vero, che si ferma subito: i tick si
     * chiamano a mano.
     */
    function running(source) {
        const sim = make();
        const clock = { t: 1000, auto: 0 };
        sim.now = () => { const t = clock.t; clock.t += clock.auto; return t; };
        sim.loadSource(source);
        sim.run();
        clearInterval(sim.runInterval);
        return { sim, clock };
    }

    const LOOP = 'LOOP: NOP\n    NOP\n    GOTO LOOP';

    test('tempo reale a 4 MHz: un milione di cicli al secondo', () => {
        const { sim, clock } = running(LOOP);
        clock.t += 50;
        sim.runTick();
        assert.ok(Math.abs(sim.cpu.cycles - 50000) <= 2, `cicli: ${sim.cpu.cycles}`);
        assert.equal(sim.lagging, false);
        sim.stop();
    });

    test('un tick in ritardo recupera i cicli mancanti', () => {
        const { sim, clock } = running(LOOP);
        clock.t += 16;
        sim.runTick();
        clock.t += 40; // tick arrivato tardi
        sim.runTick();
        assert.ok(Math.abs(sim.cpu.cycles - 56000) <= 2, `cicli: ${sim.cpu.cycles}`);
        sim.stop();
    });

    test('velocita\' 1/1000: mille cicli al secondo', () => {
        const { sim, clock } = running(LOOP);
        sim.setSpeedFactor(0.001);
        clock.t += 100;
        sim.runTick();
        assert.ok(Math.abs(sim.cpu.cycles - 100) <= 2, `cicli: ${sim.cpu.cycles}`);
        sim.stop();
    });

    test('velocita\' massima: si ferma al tetto di tempo del tick', () => {
        const { sim, clock } = running(LOOP);
        sim.setSpeedFactor(Infinity);
        clock.auto = 1; // ogni lettura dell'orologio = 1 ms di calcolo
        sim.runTick();
        // l'orologio si legge ogni 1024 istruzioni: tetto di 10 ms = ~10 letture
        assert.ok(sim.stepCount > 5000 && sim.stepCount < 20000, `istruzioni: ${sim.stepCount}`);
        sim.stop();
    });

    test('se la CPU non sta al passo non accumula debito', () => {
        const { sim, clock } = running(LOOP);
        clock.t += 1000; // un secondo di ritardo, es. scheda in secondo piano
        clock.auto = 1;
        sim.runTick();
        assert.equal(sim.lagging, true);
        const after = sim.cpu.cycles;
        assert.ok(after < 1000000, 'non recupera tutto il secondo in un tick');
        
        // Il tick successivo riparte da adesso: niente raffica.
        clock.auto = 0;
        clock.t += 16;
        sim.runTick();
        // ~16-17 ms di cicli (l'orologio finto avanza anche alla lettura di
        // syncClock), non il secondo arretrato (~990.000 cicli).
        assert.ok(sim.cpu.cycles - after <= 20000, `cicli nel tick: ${sim.cpu.cycles - after}`);
        sim.stop();
    });

    test('un breakpoint ferma Run a meta\' tick', () => {
        const { sim, clock } = running(LOOP);
        sim.toggleBreakpoint(2);
        let hit = null;
        sim.onBreakpoint = addr => { hit = addr; };
        clock.t += 50;
        sim.runTick();
        assert.equal(hit, 2);
        assert.equal(sim.running, false);
        assert.ok(sim.cpu.cycles < 10);
    });

    test('esempio 01 in tempo reale: il LED cambia ogni ~0,2 s simulati', () => {
        const { readExample } = require('./helpers');
        const { sim, clock } = running(readExample('01_blink_led.asm'));
        const toggles = [];
        let last = sim.cpu.readPortPins('B') & 1;
        for (let i = 0; i < 100 && toggles.length < 3; i++) {
            clock.t += 16;
            sim.runTick();
            const led = sim.cpu.readPortPins('B') & 1;
            if (led !== last) toggles.push(sim.getSimulatedTime());
            last = led;
        }
        sim.stop();
        assert.equal(toggles.length, 3);
        const period = toggles[2] - toggles[1];
        assert.ok(period > 0.1 && period < 0.4, `periodo: ${period} s`);
    });
});
