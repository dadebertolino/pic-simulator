/**
 * Carica le classi del simulatore come moduli CommonJS: ogni file in
 * assets/js termina con un `module.exports` condizionale proprio per questo.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');

const PIC16F84A = require(path.join(root, 'assets/js/pic16f84a.js'));
const PIC16Assembler = require(path.join(root, 'assets/js/assembler.js'));
// simulator.js usa PIC16Assembler.disassemble come globale, come nel browser.
global.PIC16Assembler = PIC16Assembler;
const Simulator = require(path.join(root, 'assets/js/simulator.js'));

/** Assembla e fallisce con gli errori leggibili se l'assemblaggio non riesce. */
function assemble(source) {
    const result = new PIC16Assembler().assemble(source);
    if (!result.success) {
        const errors = result.errors.map(e => `riga ${e.line}: ${e.message}`).join('\n');
        throw new Error('Assemblaggio fallito:\n' + errors);
    }
    return result;
}

/** CPU con il programma caricato. */
function cpuWith(source) {
    const cpu = new PIC16F84A();
    cpu.loadProgram(assemble(source).programMemory);
    return cpu;
}

function steps(cpu, n) {
    for (let i = 0; i < n; i++) cpu.step();
    return cpu;
}

function readExample(name) {
    return fs.readFileSync(path.join(root, 'examples', name), 'utf8');
}

function listExamples() {
    return fs.readdirSync(path.join(root, 'examples')).filter(f => f.endsWith('.asm')).sort();
}

/** Parole in esadecimale a 4 cifre, per confronti leggibili. */
function hexWords(words) {
    return words.map(w => w.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

module.exports = {
    root, PIC16F84A, PIC16Assembler, Simulator,
    assemble, cpuWith, steps, readExample, listExamples, hexWords,
};
