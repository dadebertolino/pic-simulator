# Test & CI — WebPicSimulator

Su GitHub Actions `.github/workflows/ci.yml` gira a ogni push su un branch e a ogni
PR, `.github/workflows/nightly.yml` ogni notte. Gli E2E stanno in un workflow
riutilizzabile (`.github/workflows/e2e.yml`) chiamato da entrambi.

## I job della CI

| Job | Cosa verifica | Quando |
|-----|---------------|--------|
| **php** | `php -l`, PHP 7.4–8.5 | ogni push/PR |
| **phpcs** | WordPress Coding Standards + PHPCompatibilityWP 7.4+ (`phpcs.xml.dist`) | ogni push/PR |
| **javascript** | `node --check` su `assets/js` e sugli script inline dei PHP; unit test di CPU, periferiche, assemblatore, motore e di tutti gli esempi | ogni push/PR |
| **e2e** | Browser reale su wp-env con Playwright, desktop e telefono (Pixel 7) | dopo php, phpcs, javascript |

Non ci sono unit test PHP né integration test con la test suite di WordPress. Il
simulatore è tutto JavaScript, coperto dagli unit test; il PHP (asset, shortcode, API
REST di classi, consegne e progetti, tabelle) lo esercitano gli E2E su un WordPress
vero, con utenti docente e studente.

## Rilascio

`release.yml` parte con un tag `vX.Y.Z`:

1. esegue l'intera CI (`ci.yml`, E2E compresi);
2. verifica che tag, header `Version`, `PIC_SIM_VERSION` e `**Versione:**` del
   README coincidano e che il README abbia la voce di changelog `### X.Y.Z`;
3. costruisce `pic-simulator-X.Y.Z.zip` con `git archive` (cartella radice
   `pic-simulator/`) e controlla che contenga il plugin e nessun file di sviluppo;
4. pubblica la Release con lo ZIP e, come descrizione, la voce del changelog.

L'updater (`includes/class-updater.php`) propone l'aggiornamento ai siti leggendo
l'ultima Release.

```bash
# dopo aver aggiornato le tre versioni e il changelog nel README
git tag v3.2.0
git push origin v3.2.0
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

Stanno in `tests/unit/` e usano `node:test`. `helpers.js` carica gli script di
`assets/js` in un contesto `vm`, nell'ordine in cui li accoda `pic-simulator.php`, con
un `fetch` finto che legge da disco le schede JSON dei device; espone `newCpu()`,
`cpuWith()` (CPU della factory con un programma), `assemble()`, `simulatorFor()`,
`pins()` ed `examples()`.

- `cpu.test.js`: istruzioni e flag, mappa della memoria e banchi, Timer0, interrupt di
  INTCON e di periferica, EEPROM, SLEEP, su 16F84A, 16F628A e 16F877A;
- `assembler.test.js`: codifica, etichette, `#define`, espressioni, direttive, controlli
  di intervallo, Intel HEX, simboli per device, `BANKSEL` a 4 banchi, `LIST P=`;
- `simulator.test.js`: programmazione e Reset, breakpoint, undo, Run a tempo, Step Over;
- `examples.test.js`: ognuno dei 53 esempi fa quello che dichiara nell'intestazione,
  osservato sulle porte, sul terminale seriale o sull'hardware virtuale indicato.

`vhw.js` collega ai pin i modelli dei device del core come fanno i componenti
dell'interfaccia (sensore a ultrasuoni, bus 1-Wire, tastierino, LCD) e contiene un
decodificatore HD44780 minimo per leggere il testo degli LCD.

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

`auth.setup.js` fa il login come admin e crea (o riallinea) via REST le pagine di
prova (simulatore, due shortcode nella stessa pagina, attributi `height`/`fullwidth`,
pagina senza shortcode, dashboard) e gli utenti della parte didattica: un docente e un
collega con ruolo Autore, due studenti iscritti. Salva la sessione di ciascuno in
`tests/e2e/.auth/`. Le pagine si aprono con `?pagename=`, quindi non dipendono dai
permalink; login, pagine e utenti passano da richieste HTTP e non dal form o da
wp-cli, così lo stesso setup funziona su wp-env e su Playground.

Negli spec (`tests/e2e/`), `helpers.js` espone `openSimulator()` (apre la pagina,
aspetta l'inizializzazione e raccoglie gli errori JavaScript), `setSource()`,
`assemble()` (aspetta l'esito, anche dopo un cambio di device), `loadExample()`,
`cpuState()`, `portPins()` e `restClient()`, un client delle API `picsim/v1` con il
nonce dell'utente della sessione (da `admin-ajax.php?action=rest-nonce`).

| Spec | Cosa copre |
|------|------------|
| `infra.spec.js` | Smoke test: shortcode, ordine degli script, asset solo dove serve, secondo simulatore, schede dei device, endpoint di stato |
| `simulator.spec.js` | Assemblaggio ed errori, Step, Run, breakpoint, velocità, Step Over, Animate, Reset, cambio di device, pin, EEPROM |
| `vhw.spec.js` | Hardware virtuale aggiunto dall'interfaccia: I²C, SPI, 1-Wire, LCD, cambio di device |
| `accessibilita.spec.js` | axe in più stati, con i pannelli delle periferiche aperti |
| `didattica.spec.js` | Classi, consegne e progetti via REST con docente, collega e studenti, e i permessi a ogni passo; dashboard |
| `admin.spec.js` | Pagina Impostazioni → WebPicSimulator |
| `infra.mobile.spec.js` | Telefono: uso, nessuno scorrimento orizzontale, axe |

I file `*.mobile.spec.js` girano solo nel progetto telefono. `infra.spec.js` e
`infra.mobile.spec.js` sono gli smoke test: se falliscono, gli altri risultati non
sono attendibili. `didattica.spec.js` è seriale: i passi usano la classe, la consegna
e il progetto creati da quelli precedenti.

## Lo ZIP di release

Lo ZIP nasce da `git archive`: tutto ciò che è sviluppo (test, workflow,
configurazioni di Composer, npm, wp-env e Playwright, questo documento) è escluso
con `export-ignore` in `.gitattributes`. Un file nuovo di sviluppo va aggiunto lì;
se ce ne si dimentica, il controllo del contenuto in `release.yml` blocca il
rilascio.
