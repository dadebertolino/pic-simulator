/**
 * Ogni esempio fa quello che dichiara nella sua intestazione. Si osserva
 * la sequenza dei valori sui pin di PORTB, come la vedrebbe lo studente.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { PIC16F84A, assemble, readExample, listExamples } = require('./helpers');

/**
 * Esegue l'esempio e restituisce i primi `count` valori distinti di
 * PORTB, nell'ordine in cui compaiono. `stimulus(step, cpu)` simula
 * pulsanti sui pin di ingresso.
 */
function portBSequence(file, count, stimulus = () => {}, maxSteps = 3e6) {
    const cpu = new PIC16F84A();
    cpu.loadProgram(assemble(readExample(file)).programMemory);

    const seen = [];
    let last = null;
    for (let i = 0; i < maxSteps && seen.length < count; i++) {
        stimulus(i, cpu);
        cpu.step();
        const value = cpu.readPortPins('B');
        if (value !== last) {
            seen.push(value);
            last = value;
        }
    }
    return { seen, cpu };
}

describe('esempi', () => {
    test('ci sono tutti e 10 e si assemblano', () => {
        const files = listExamples();
        assert.equal(files.length, 10);
        for (const file of files) assemble(readExample(file));
    });

    test('01 blink: RB0 lampeggia', () => {
        assert.deepEqual(portBSequence('01_blink_led.asm', 5).seen, [0, 1, 0, 1, 0]);
    });

    test('02 contatore binario: PORTB conta da 0 in su', () => {
        assert.deepEqual(portBSequence('02_binary_counter.asm', 6).seen, [0, 1, 2, 3, 4, 5]);
    });

    test('03 pulsante: RB0 segue RB4', () => {
        const press = (i, cpu) => {
            if (i === 1000) cpu.setExternalInput('B', 4, 1);
            if (i === 2000) cpu.setExternalInput('B', 4, 0);
        };
        // pulsante premuto -> LED acceso -> pulsante rilasciato -> LED spento
        assert.deepEqual(portBSequence('03_button_led.asm', 5, press, 5000).seen, [0x00, 0x10, 0x11, 0x01, 0x00]);
    });

    test('04 Knight Rider: il LED scorre avanti e indietro', () => {
        // Regressione: con il flag Z mai impostato si spegneva al primo passo.
        assert.deepEqual(portBSequence('04_knight_rider.asm', 13).seen,
            [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x40, 0x20, 0x10, 0x08]);
    });

    test('05 Timer0: la ISR commuta RB0', () => {
        const { seen, cpu } = portBSequence('05_timer0_interrupt.asm', 4);
        assert.deepEqual(seen, [0, 1, 0, 1]);
        // Il cambio di PORTB avviene dentro la ISR, dove GIE e' 0: T0IE resta attivo.
        assert.equal(cpu.ram[0x0B] & 0x20, 0x20);
    });

    test('06 interrupt esterno: ogni fronte su RB0 incrementa RB4-RB7', () => {
        const pulses = (i, cpu) => {
            if (i % 3000 === 1000) cpu.setExternalInput('B', 0, 1);
            if (i % 3000 === 2000) cpu.setExternalInput('B', 0, 0);
        };
        const { seen } = portBSequence('06_external_interrupt.asm', 13, pulses, 20000);
        const counter = [...new Set(seen.map(v => v >> 4))];
        assert.deepEqual(counter, [0, 1, 2, 3, 4]);
    });

    test('07 EEPROM: il contatore viene salvato in EEPROM e sopravvive al Reset', () => {
        // Appena programmata la EEPROM vale 0xFF: il contatore parte da li'.
        const { seen, cpu } = portBSequence('07_eeprom.asm', 6);
        assert.deepEqual(seen, [0x00, 0xFF, 0x00, 0x01, 0x02, 0x03]);
        // Ci si ferma appena PORTB mostra 3, prima che venga salvato: in EEPROM c'e' 2.
        assert.equal(cpu.eeprom[0], 0x02);
        
        cpu.reset();
        let shown = null;
        for (let i = 0; i < 100 && shown === null; i++) {
            cpu.step();
            if (cpu.readPortPins('B') !== 0) shown = cpu.readPortPins('B');
        }
        assert.equal(shown, 0x02, 'dopo il Reset riparte dal valore salvato');
    });

    test('08 tabella: cifre 0-9 sul display a 7 segmenti', () => {
        const segments = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
        assert.deepEqual(portBSequence('08_lookup_table.asm', 12).seen, [0, ...segments, 0x3F]);
    });

    test('09 subroutine: (5+3)*2 e (7+8)*2', () => {
        const { seen, cpu } = portBSequence('09_subroutines_stack.asm', 4);
        assert.deepEqual(seen, [0, 16, 30, 16]);
        assert.equal(cpu.stackPointer <= 3, true);
    });

    test('10 semaforo: verde, giallo, rosso, verde', () => {
        assert.deepEqual(portBSequence('10_state_machine.asm', 7).seen, [0, 1, 2, 4, 1, 2, 4]);
    });
});
