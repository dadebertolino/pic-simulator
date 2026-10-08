# Test & CI — WebPicSimulator

Su GitHub Actions `.github/workflows/ci.yml` gira a ogni push su un branch e a ogni
PR, `.github/workflows/nightly.yml` ogni notte. Gli E2E stanno in un workflow
riutilizzabile (`.github/workflows/e2e.yml`) chiamato da entrambi.

## I job della CI

| Job | Cosa verifica | Quando |
|-----|---------------|--------|
| **php** | `php -l`, PHP 7.4–8.5 | ogni push/PR |
| **phpcs** | WordPress Coding Standards + PHPCompatibilityWP 7.4+ (`phpcs.xml.dist`) | ogni push/PR |
| **javascript** | `node --check` su `assets/js` e sugli script inline dei PHP; unit test di CPU, assemblatore, motore ed esempi | ogni push/PR |
| **e2e** | Browser reale su wp-env con Playwright, desktop e telefono (Pixel 7) | dopo php, phpcs, javascript |

Non ci sono unit test PHP né integration test con la test suite di WordPress: il PHP
del plugin si limita a registrare asset, shortcode e pagina admin, e gli E2E lo
esercitano su un WordPress vero. La logica sta nel JavaScript, coperto dagli unit test.

## Rilascio

`release.yml` parte con un tag `vX.Y.Z`:

1. esegue l'intera CI (`ci.yml`, E2E compresi);
2. verifica che tag, header `Version`, `PICSIM_VERSION` e `**Versione:**` del
   README coincidano e che il README abbia la voce di changelog `### X.Y.Z`;
3. costruisce `pic-simulator-X.Y.Z.zip` con `git archive` (cartella radice
   `pic-simulator/`) e controlla che contenga il plugin e nessun file di sviluppo;
4. pubblica la Release con lo ZIP e, come descrizione, la voce del changelog.

L'updater (`inc/class-updater.php`) propone l'aggiornamento ai siti leggendo
l'ultima Release.

```bash
# dopo aver aggiornato le tre versioni e il changelog nel README
git tag v1.1.0
git push origin v1.1.0
```

## Run notturna

`nightly.yml` gira ogni notte alle 04:37 UTC (e a mano da *Actions → Nightly → Run
workflow*):

| Variante | Perché |
|----------|--------|
| E2E su WordPress trunk (PHP 8.3) | accorgersi prima che una nuova versione di WordPress rompa il plugin |
| E2E su PHP 8.4 | la CI normale esegue gli E2E su 8.1 |

GitHub sospende i workflow pianificati dopo 60 giorni senza attività nel repository.

## Eseguire i test in locale

### Unit (solo Node, nessuna dipendenza)

```bash
npm test
```

Stanno in `tests/unit/` e usano `node:test`. `helpers.js` carica le classi di
`assets/js` come moduli CommonJS: ogni file termina con un `module.exports`
condizionale proprio per questo.

- `cpu.test.js`: istruzioni, flag, banchi, indirizzamento indiretto, stack,
  Timer0, interrupt, EEPROM;
- `assembler.test.js`: codifica, etichette, `#define`, espressioni, letterali,
  direttive, controlli di intervallo, Intel HEX;
- `simulator.test.js`: caricamento, breakpoint, Reset, undo;
- `examples.test.js`: ogni esempio di `examples/` fa quello che dichiara
  nell'intestazione (sequenza osservata su PORTB).

I difetti noti ancora da correggere sono test marcati `todo`: girano, non fanno
fallire la suite e compaiono nel riepilogo. Quando un `todo` passa, il difetto è
risolto e il marcatore va tolto.

### E2E con wp-env (Docker, Node 22)

```bash
npm ci
npx playwright install chromium
npx wp-env start
npm run env:setup
npx playwright test
```

### E2E con WordPress Playground (senza Docker)

```bash
npm ci
npx playwright install chromium
npm run env:playground     # in un altro terminale; resta in primo piano
npx playwright test
```

Playground gira in Node (PHP compilato in WebAssembly) e risponde sulla stessa
porta di wp-env (8888) con utente `admin` / `password`. È più lento e si azzera a
ogni avvio, ma non richiede Docker.

`accessibilita.spec.js` e il progetto telefono eseguono axe-core (WCAG 2.1 AA) sul
simulatore in più stati: un controllo nuovo senza nome accessibile, o un colore con
contrasto insufficiente, fa fallire la CI.

`npx playwright test --project=chromium` o `--project=mobile` per un solo progetto,
`npm run test:e2e:headed` per vedere il browser.

### Come sono fatti gli E2E

`auth.setup.js` fa il login e crea (o riallinea) via REST le pagine di prova:
simulatore, due shortcode nella stessa pagina, attributi `height`/`fullwidth`,
pagina senza shortcode. Le pagine si aprono con `?pagename=`, quindi non
dipendono dai permalink. Login e pagine passano da richieste HTTP e non dal form
o da wp-cli, così lo stesso setup funziona su wp-env e su Playground.

Negli spec (`tests/e2e/`), `helpers.js` espone `openSimulator()` (apre la pagina,
aspetta l'inizializzazione e raccoglie gli errori JavaScript), `setSource()`,
`button()` e `cpuState()`. Fuori dallo schermo intero è visibile solo la
mini-toolbar, i cui pulsanti hanno il suffisso `2` (`#btn-run2`): gli spec
cliccano quello che vede l'utente. I file `*.mobile.spec.js` girano solo nel
progetto telefono. `infra.spec.js` e `infra.mobile.spec.js` sono gli smoke test:
se falliscono, gli altri risultati non sono attendibili.

## Lo ZIP di release

Lo ZIP nasce da `git archive`: tutto ciò che è sviluppo (test, workflow,
configurazioni di Composer, npm, wp-env e Playwright, questo documento) è escluso
con `export-ignore` in `.gitattributes`. Un file nuovo di sviluppo va aggiunto lì;
se ce ne si dimentica, il controllo del contenuto in `release.yml` blocca il
rilascio.
