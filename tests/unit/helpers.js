/**
 * Carica il simulatore in Node come lo carica il browser: gli script di
 * assets/js in un unico contesto, nell'ordine delle dipendenze di
 * pic-simulator.php, con un fetch che legge i JSON dei device dal disco.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const js = (rel) => path.join(root, 'assets/js', rel);

const DEVICE_FILES = [
    'i2c-24c02', 'i2c-lm75', 'i2c-pcf8574', 'i2c-mcp23017', 'i2c-ds1307', 'i2c-bmp280', 'i2c-sht21',
    'i2c-ds3231', 'i2c-mcp9808', 'i2c-tmp102', 'i2c-stts751', 'i2c-pcf8563', 'i2c-ssd1306',
    'spi-74hc595', 'spi-mcp3008', 'spi-max7219', 'ow-ds18b20',
    'gpio-servo', 'gpio-hcsr04', 'gpio-ws2812', 'gpio-ks0108', 'gpio-l293d', 'gpio-buzzer', 'gpio-keypad', 'gpio-rgb-led',
];

const SCRIPTS = [
    'core/device-loader.js',
    'core/pic16-peripherals.js',
    'core/peripherals/gpio.js', 'core/peripherals/tmr0.js', 'core/peripherals/eeprom.js',
    'core/peripherals/tmr1.js', 'core/peripherals/tmr2.js', 'core/peripherals/ccp.js',
    'core/peripherals/usart.js', 'core/peripherals/adc.js', 'core/peripherals/comparator.js',
    'core/peripherals/virtual-bus.js', 'core/peripherals/onewire-bus.js', 'core/peripherals/virtual-devices.js',
    ...DEVICE_FILES.map((d) => `core/peripherals/devices/${d}.js`),
    'core/peripherals/mssp.js',
    'core/pic16-core.js', 'core/pic16-factory.js', 'core/assembler.js', 'core/simulator.js',
    // Solo per gli esempi integrati (SimulatorUI.prototype._getExamples).
    'ui/ui-manager.js',
];

/** fetch minimale: legge da disco i file sotto assets/. */
function fakeFetch(url) {
    const rel = String(url).replace(/^.*?assets\//, 'assets/');
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404 ' + rel)) });
    }
    const text = fs.readFileSync(file, 'utf8');
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(text)), text: () => Promise.resolve(text) });
}

function createContext() {
    const ctx = {
        console, performance, setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: fakeFetch,
        picSimConfig: { dataPath: '' },
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    for (const rel of SCRIPTS) {
        // Le classi dichiarate con "class X" non diventano proprieta' del
        // contesto: le esponiamo esplicitamente dopo ogni script.
        const source = fs.readFileSync(js(rel), 'utf8');
        const names = [...source.matchAll(/^class\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]);
        const expose = names.map((n) => `globalThis.${n} = ${n};`).join('\n');
        vm.runInContext(`${source}\n;${expose}`, ctx, { filename: rel });
    }
    return ctx;
}

const ctx = createContext();

let loaderPromise = null;
/** DeviceLoader con la famiglia e tutti i device caricati (una volta sola). */
function deviceLoader() {
    if (!loaderPromise) {
        loaderPromise = (async () => {
            const loader = new ctx.DeviceLoader();
            await loader.init('');
            for (const d of loader.getAvailableDevices()) {
                await loader.loadDevice(d.id);
            }
            return loader;
        })();
    }
    return loaderPromise;
}

/** Assemblatore configurato per un device, come fa l'interfaccia. */
async function assemblerFor(deviceId = 'PIC16F84A') {
    const loader = await deviceLoader();
    const asm = new ctx.PIC16Assembler();
    asm._deviceLoader = loader;
    asm.loadDeviceSymbols(deviceId, loader.devices[deviceId]);
    return asm;
}

/** Assembla e fallisce con errori leggibili se l'assemblaggio non riesce. */
async function assemble(source, deviceId = 'PIC16F84A') {
    const result = (await assemblerFor(deviceId)).assemble(source);
    if (!result.success) {
        throw new Error('Assemblaggio fallito:\n' + result.errors.map((e) => `riga ${e.line}: ${e.message}`).join('\n'));
    }
    return result;
}

/** CPU del device, con le periferiche della factory e il programma caricato. */
async function cpuWith(source, deviceId = 'PIC16F84A') {
    const loader = await deviceLoader();
    const { cpu } = new ctx.PIC16Factory(loader).create(deviceId);
    cpu.loadProgram((await assemble(source, deviceId)).programMemory);
    return cpu;
}

/** Simulator completo (CPU + assemblatore) per un device. */
async function simulatorFor(deviceId = 'PIC16F84A') {
    const loader = await deviceLoader();
    const { cpu } = new ctx.PIC16Factory(loader).create(deviceId);
    const sim = new ctx.Simulator(cpu, await assemblerFor(deviceId));
    return sim;
}

function steps(cpu, n) {
    for (let i = 0; i < n; i++) cpu.step();
    return cpu;
}

/** Esempi integrati nell'interfaccia (nome, categoria, device, sorgente). */
function examples() {
    return ctx.SimulatorUI.prototype._getExamples.call({});
}

function hexWords(words) {
    return Array.from(words).map((w) => w.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

module.exports = { root, ctx, deviceLoader, assemblerFor, assemble, cpuWith, simulatorFor, steps, examples, hexWords };
