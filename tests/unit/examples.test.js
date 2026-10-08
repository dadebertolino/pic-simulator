/**
 * Esempi integrati (SimulatorUI.prototype._getExamples): si assemblano
 * tutti sul device della loro direttiva LIST P= e fanno quello che dichiarano
 * nell'intestazione, osservando i pin delle porte come lo studente.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { assemblerFor, cpuWith, examples, pins } = require('./helpers');

const ALL = examples();
const deviceOf = (ex) => 'PIC16F' + ex.source.match(/LIST\s+P\s*=\s*16F(\w+)/i)[1].toUpperCase();
const byName = (name) => {
    const ex = Object.values(ALL).find((e) => e.name === name);
    assert.ok(ex, 'esempio mancante: ' + name);
    return ex;
};

/**
 * Esegue l'esempio e restituisce i primi `count` valori distinti sui pin
 * di `port`, nell'ordine in cui compaiono. `stimulus(step, cpu)` simula
 * pulsanti e interruttori sui pin di ingresso.
 */
async function sequence(name, port, count, stimulus = () => {}, maxSteps = 3e6) {
    const ex = byName(name);
    const cpu = await cpuWith(ex.source, deviceOf(ex));
    const seen = [];
    let last = null;
    for (let i = 0; i < maxSteps && seen.length < count; i++) {
        stimulus(i, cpu);
        cpu.step();
        const value = pins(cpu, port);
        if (value !== last) {
            seen.push(value);
            last = value;
        }
    }
    return { seen, cpu };
}

describe('esempi', () => {
    test('sono 53 e si assemblano tutti sul loro device', async () => {
        const list = Object.values(ALL);
        assert.equal(list.length, 53);
        for (const ex of list) {
            const r = (await assemblerFor(deviceOf(ex))).assemble(ex.source);
            assert.ok(r.success, `${ex.name}: ${JSON.stringify(r.errors)}`);
        }
    });

    test('LED Blink: RB0 lampeggia', async () => {
        assert.deepEqual((await sequence('LED Blink', 'B', 5)).seen, [0, 1, 0, 1, 0]);
    });

    test('Knight Rider: il LED scorre avanti e indietro', async () => {
        // Regressione: con il flag Z mai impostato il verso non cambiava.
        assert.deepEqual((await sequence('Knight Rider', 'B', 13)).seen,
            [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x40, 0x20, 0x10, 0x08]);
    });

    test('Binary Counter: PORTB conta da 0 in su', async () => {
        assert.deepEqual((await sequence('Binary Counter', 'B', 6)).seen, [0, 1, 2, 3, 4, 5]);
    });

    test('TMR0 Interrupt: la ISR commuta RB0', async () => {
        // Regressione: T0IF non si alzava mai.
        assert.deepEqual((await sequence('TMR0 Interrupt', 'B', 4)).seen, [0, 1, 0, 1]);
    });

    test('EEPROM Read/Write: scrive 0x42 e lo rilegge su PORTB', async () => {
        const { seen, cpu } = await sequence('EEPROM Read/Write', 'B', 2);
        assert.deepEqual(seen, [0, 0x42]);
        assert.equal(cpu.readEEPROM(0), 0x42);
    });

    test('8-bit Addition e Multiply 8x8', async () => {
        assert.deepEqual((await sequence('8-bit Addition', 'B', 2)).seen, [0, 0x37 + 0x4A]);
        assert.deepEqual((await sequence('Multiply 8x8', 'B', 2)).seen, [0, 6 * 7]);
    });

    test('Lookup Table: cifre 0-9 sul display a 7 segmenti', async () => {
        assert.deepEqual((await sequence('Lookup Table', 'B', 11)).seen,
            [0, 0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]);
    });

    test('Stack Demo: quattro livelli di CALL accendono e spengono RB0-RB3', async () => {
        assert.deepEqual((await sequence('Stack Demo', 'B', 9)).seen, [0, 1, 3, 7, 0xF, 7, 3, 1, 0]);
    });

    test('Timer1 Overflow (628A): la ISR di periferica commuta RB0', async () => {
        assert.deepEqual((await sequence('Timer1 Overflow', 'B', 4)).seen, [0, 1, 0, 1]);
    });

    test('Multi-Port I/O (877A): PORTA copiata, negata e scambiata su B, C, D', async () => {
        // Regressione: PORTD/TRISD erano occupati dai registri della EEPROM.
        const set = (i, cpu) => {
            if (i === 0) { cpu.setExternalInput('A', 0, 1); cpu.setExternalInput('A', 2, 1); }
        };
        const { cpu } = await sequence('Multi-Port I/O', 'D', 2, set);
        assert.equal(pins(cpu, 'B'), 0x05);
        assert.equal(pins(cpu, 'C'), 0xFA);
        assert.equal(pins(cpu, 'D'), 0x50);
    });
});
