#!/usr/bin/env node
/**
 * Controllo di sintassi JavaScript: file in assets/js e script inline dei file PHP.
 * Negli script inline i blocchi <?php … ?> diventano 0, così un apostrofo non
 * escapato in una traduzione o una parentesi mancante fanno fallire il controllo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'picsim-js-'));
let failures = 0;

function walk(dir, ext, skip = []) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (skip.some((s) => full.includes(s))) return [];
        if (entry.isDirectory()) return walk(full, ext, skip);
        return full.endsWith(ext) ? [full] : [];
    });
}

function check(file, label) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (e) {
        failures++;
        console.error(`✗ ${label}\n${e.stderr.toString()}`);
    }
}

for (const file of walk(path.join(root, 'assets/js'), '.js', ['/vendor/'])) {
    check(file, path.relative(root, file));
}

const phpFiles = [
    ...walk(path.join(root, 'includes'), '.php', ['/lib/']),
    ...walk(path.join(root, 'templates'), '.php'),
    path.join(root, 'pic-simulator.php'),
];
for (const file of phpFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const scripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    scripts.forEach((match, i) => {
        const line = source.slice(0, match.index).split('\n').length;
        const js = match[1].replace(/<\?php[\s\S]*?\?>/g, '0');
        const out = path.join(tmp, `${path.basename(file)}-${i}.js`);
        fs.writeFileSync(out, js);
        check(out, `${path.relative(root, file)}:${line} (script inline)`);
    });
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) {
    console.error(`${failures} errori di sintassi JavaScript`);
    process.exit(1);
}
console.log('JavaScript OK');
