/**
 * Il simulatore usato come lo usa uno studente: assembla, esegue, debugga,
 * interagisce con i pin, carica e salva file.
 */
const { test, expect } = require( '@playwright/test' );
const { openSimulator, setSource, button, assemble, cpuState } = require( './helpers' );

const status = ( page ) => page.locator( '#status-text' );

test.describe( 'assemblaggio', () => {
	test( 'il programma iniziale si assembla', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await expect( status( page ) ).toHaveText( /^Assemblato: \d+ parole$/ );
		await expect( page.locator( '#error-panel' ) ).toBeEmpty();
	} );

	test( 'gli errori sono elencati per riga ed evidenziati nell\'editor', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    NOP\n    MOVLW FOO\n    BSF PORTB, 9' );
		await assemble( page );

		await expect( status( page ) ).toHaveText( 'Errori di assemblaggio: 2' );
		const rows = page.locator( '#error-panel .picsim__error' );
		await expect( rows ).toHaveCount( 2 );
		await expect( rows.nth( 0 ) ).toContainText( 'Riga 2' );
		await expect( rows.nth( 0 ) ).toContainText( 'Simbolo non definito: FOO' );
		await expect( rows.nth( 1 ) ).toContainText( 'Riga 3' );
		await expect( page.locator( '.picsim__line-num--error' ) ).toHaveCount( 2 );
	} );

	test( 'un operando con HTML resta testo nel pannello errori', async ( { page } ) => {
		// Regressione XSS: il messaggio era inserito con innerHTML.
		await openSimulator( page );
		await setSource( page, '    MOVLW <img src=x onerror="window.__picsimXss=1">' );
		await assemble( page );

		await expect( page.locator( '#error-panel' ) ).toContainText( '<img src=x' );
		await expect( page.locator( '#error-panel img' ) ).toHaveCount( 0 );
		expect( await page.evaluate( () => window.__picsimXss ) ).toBeUndefined();
	} );

	test( 'modificare il sorgente cancella gli errori', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    FOO' );
		await assemble( page );
		await expect( page.locator( '#error-panel .picsim__error' ) ).toHaveCount( 1 );

		await page.locator( '#code-editor' ).press( 'End' );
		await page.locator( '#code-editor' ).pressSequentially( ' ' );
		await expect( page.locator( '#error-panel .picsim__error' ) ).toHaveCount( 0 );
	} );
} );

test.describe( 'esecuzione e debug', () => {
	test( 'Step esegue un\'istruzione ed evidenzia la riga corrente', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 0x3C\n    MOVWF 0x20\n    GOTO $' );
		await assemble( page );

		await button( page, 'step' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '3C' );
		await expect( page.locator( '#reg-pc' ) ).toHaveText( '001' );
		await expect( page.locator( '.picsim__line-num--current' ) ).toHaveAttribute( 'data-line', '2' );

		await button( page, 'step' ).click();
		expect( ( await page.evaluate( () => window.picSim.cpu.ram[ 0x20 ] ) ) ).toBe( 0x3C );
	} );

	test( 'Step su un programma non ancora assemblato lo assembla', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 7\n    GOTO $' );
		await button( page, 'step' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '07' );
	} );

	test( 'Run si ferma sul breakpoint', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    INCF 0x21, F\n    GOTO LOOP' );
		await assemble( page );

		// Click sul numero della riga 2 (indirizzo 001).
		await page.locator( '.picsim__line-num[data-line="2"]' ).click();
		await expect( page.locator( '.picsim__line-num--bp' ) ).toHaveCount( 1 );
		await expect( page.locator( '#breakpoints-list' ) ).toContainText( '0x001' );

		await button( page, 'run' ).click();
		await expect( status( page ) ).toHaveText( 'Breakpoint a 0x001' );
		const state = await cpuState( page );
		expect( state.PC ).toBe( 1 );
		await expect( button( page, 'run' ) ).toBeEnabled();
		await expect( button( page, 'stop' ) ).toBeDisabled();
	} );

	test( 'Run e Stop', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    GOTO LOOP' );
		await assemble( page );

		await button( page, 'run' ).click();
		await expect( status( page ) ).toHaveText( 'In esecuzione...' );
		await expect( button( page, 'stop' ) ).toBeEnabled();
		await expect.poll( async () => ( await cpuState( page ) ).cycles ).toBeGreaterThan( 50 );

		await button( page, 'stop' ).click();
		await expect( status( page ) ).toHaveText( 'Fermo' );
		const cycles = ( await cpuState( page ) ).cycles;
		await page.waitForTimeout( 300 );
		expect( ( await cpuState( page ) ).cycles ).toBe( cycles );
	} );

	test( 'in tempo reale il LED dell\'esempio 01 lampeggia', async ( { page } ) => {
		// Regressione: a 1000 istruzioni al secondo il LED cambiava ogni 2 minuti.
		await openSimulator( page );
		await page.locator( '#examples-select2' ).selectOption( '01_blink_led' );
		await expect( status( page ) ).toHaveText( 'Caricato: 01_blink_led' );
		await expect( page.locator( '#run-speed2' ) ).toHaveValue( '1' );

		await button( page, 'run' ).click();
		const rb0 = page.locator( '#portb-pins .picsim__pin[data-bit="0"]' );
		await expect( rb0 ).toHaveClass( /picsim__pin--high/, { timeout: 3000 } );
		await expect( rb0 ).toHaveClass( /picsim__pin--low/, { timeout: 3000 } );
		await expect( rb0 ).toHaveClass( /picsim__pin--high/, { timeout: 3000 } );
		await button( page, 'stop' ).click();

		await expect( page.locator( '#sim-time' ) ).toHaveText( /^\d+\.\d (ms)$|^\d+\.\d{3} s$/ );
	} );

	test( 'la velocita\' di Run si sceglie e le due select restano allineate', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    GOTO LOOP' );
		await assemble( page );

		await page.locator( '#run-speed2' ).selectOption( '0.001' );
		await expect( page.locator( '#run-speed' ) ).toHaveValue( '0.001' );
		expect( await page.evaluate( () => window.picSim.simulator.speedFactor ) ).toBe( 0.001 );

		// 1/1000 del tempo reale = 1000 cicli al secondo.
		await button( page, 'run' ).click();
		await page.waitForTimeout( 1000 );
		await button( page, 'stop' ).click();
		const slow = ( await cpuState( page ) ).cycles;
		expect( slow ).toBeGreaterThan( 500 );
		expect( slow ).toBeLessThan( 2000 );

		await page.locator( '#run-speed2' ).selectOption( 'max' );
		expect( await page.evaluate( () => window.picSim.simulator.speedFactor ) ).toBe( Infinity );
	} );

	test( 'Animate avanza un passo alla volta', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    GOTO LOOP' );
		await assemble( page );

		await button( page, 'animate' ).click();
		await expect( status( page ) ).toHaveText( 'Animate in corso...' );
		await expect.poll( async () => ( await cpuState( page ) ).PC !== 0 || ( await cpuState( page ) ).cycles > 0 ).toBe( true );
		await button( page, 'stop' ).click();
		await expect( status( page ) ).toHaveText( 'Fermo' );
	} );

	test( 'Reset riporta PC e registri allo stato iniziale', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 9\n    GOTO $' );
		await assemble( page );
		await button( page, 'step' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '09' );

		await button( page, 'reset' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '00' );
		await expect( page.locator( '#reg-pc' ) ).toHaveText( '000' );
		await expect( page.locator( '#cycles-count' ) ).toHaveText( '0' );
	} );

	test( 'il flag Z si accende nel pannello registri', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    CLRW\n    GOTO $' );
		await assemble( page );
		await expect( page.locator( '#bit-z' ) ).not.toHaveClass( /picsim__bit--set/ );
		await button( page, 'step' ).click();
		await expect( page.locator( '#bit-z' ) ).toHaveClass( /picsim__bit--set/ );
	} );
} );

test.describe( 'porte e pin', () => {
	test( 'esempio 03: premere RB4 accende il LED su RB0', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#examples-select2' ).selectOption( '03_button_led' );
		await expect( status( page ) ).toHaveText( 'Caricato: 03_button_led' );
		await expect( page.locator( '#code-editor' ) ).toHaveValue( /PULSANTE E LED/ );

		await button( page, 'run' ).click();
		const rb0 = page.locator( '#portb-pins .picsim__pin[data-bit="0"]' );
		const rb4 = page.locator( '#portb-pins .picsim__pin[data-bit="4"]' );
		await expect( rb0 ).toHaveClass( /picsim__pin--output/ );
		await expect( rb0 ).toHaveClass( /picsim__pin--low/ );

		await rb4.click();
		await expect( rb4 ).toHaveClass( /picsim__pin--high/ );
		await expect( rb0 ).toHaveClass( /picsim__pin--high/ );

		await rb4.click();
		await expect( rb0 ).toHaveClass( /picsim__pin--low/ );
		await button( page, 'stop' ).click();
	} );

	test( 'un pin di uscita non si commuta dal pannello', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    BSF STATUS, RP0\n    CLRF TRISB\n    GOTO $' );
		await assemble( page );
		await button( page, 'step' ).click();
		await button( page, 'step' ).click();

		await page.locator( '#portb-pins .picsim__pin[data-bit="3"]' ).click();
		await expect( status( page ) ).toHaveText( 'RB3 è configurato come uscita' );
	} );

	test( 'TRIS modificabile dal pannello', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#trisb-value' ).click();
		const input = page.locator( '#trisb-value input' );
		await input.fill( '0F' );
		await input.press( 'Enter' );

		await expect( page.locator( '#trisb-value' ) ).toHaveText( '0F' );
		await expect( page.locator( '#portb-pins .picsim__pin[data-bit="7"]' ) ).toHaveClass( /picsim__pin--output/ );
		await expect( page.locator( '#portb-pins .picsim__pin[data-bit="0"]' ) ).toHaveClass( /picsim__pin--input/ );
	} );
} );

test.describe( 'memoria', () => {
	test( 'una cella RAM si modifica e resta modificata durante Run', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x30, F\n    GOTO LOOP' );
		await assemble( page );

		await page.locator( '.picsim__mem-val[data-type="ram"][data-addr="12"]' ).click(); // 0x0C
		const input = page.locator( '.picsim__mem-input' );
		await input.fill( 'A5' );
		await input.press( 'Enter' );
		await expect( status( page ) ).toHaveText( 'RAM[C] = A5' );
		await expect( page.locator( '.picsim__mem-val[data-addr="12"]' ) ).toHaveText( 'A5' );

		await button( page, 'run' ).click();
		await expect.poll( async () => page.evaluate( () => window.picSim.cpu.ram[ 0x30 ] ) ).toBeGreaterThan( 5 );
		await expect( page.locator( '.picsim__mem-val[data-addr="12"]' ) ).toHaveText( 'A5' );
		await button( page, 'stop' ).click();
	} );

	test( 'esempio 07: la EEPROM sopravvive al Reset e si cancella riassemblando', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#examples-select2' ).selectOption( '07_eeprom' );
		await expect( status( page ) ).toHaveText( 'Caricato: 07_eeprom' );
		await assemble( page );

		const ee0 = () => page.evaluate( () => window.picSim.cpu.eeprom[ 0 ] );
		expect( await ee0() ).toBe( 0xFF ); // appena programmata

		await button( page, 'run' ).click();
		await expect.poll( ee0, { timeout: 5000 } ).toBeLessThan( 0xFF );
		await button( page, 'stop' ).click();
		const saved = await ee0();

		await button( page, 'reset' ).click();
		expect( await ee0() ).toBe( saved );
		await page.locator( '.picsim__memory-tab[data-type="eeprom"]' ).click();
		await expect( page.locator( '.picsim__mem-val[data-type="eeprom"][data-addr="0"]' ) )
			.toHaveText( saved.toString( 16 ).toUpperCase().padStart( 2, '0' ) );

		await assemble( page );
		expect( await ee0() ).toBe( 0xFF );
	} );

	test( 'la vista Prog mostra il disassemblato', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 0x3C\n    GOTO $' );
		await assemble( page );
		await page.locator( '.picsim__memory-tab[data-type="program"]' ).click();

		const first = page.locator( '.picsim__mem-instr' ).first();
		await expect( first ).toContainText( 'MOVLW 0x3C' );
		await expect( first ).toHaveClass( /picsim__mem-instr--current/ );
	} );
} );

test.describe( 'file', () => {
	test( 'Load carica un .asm dal PC', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#file-input' ).setInputFiles( {
			name: 'mio.asm',
			mimeType: 'text/plain',
			buffer: Buffer.from( '; caricato dal PC\n    MOVLW 1\n    GOTO $\n' ),
		} );
		await expect( status( page ) ).toHaveText( 'Caricato: mio.asm' );
		await expect( page.locator( '#code-editor' ) ).toHaveValue( /caricato dal PC/ );
	} );

	test( 'Save scarica il sorgente dell\'editor', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '; da salvare\n    NOP\n' );

		const [ download ] = await Promise.all( [
			page.waitForEvent( 'download' ),
			button( page, 'save' ).click(),
		] );
		expect( download.suggestedFilename() ).toBe( 'programma.asm' );
		const fs = require( 'fs' );
		expect( fs.readFileSync( await download.path(), 'utf8' ) ).toBe( '; da salvare\n    NOP\n' );
	} );

	test( 'New chiede conferma e sostituisce il programma', async ( { page } ) => {
		await openSimulator( page );
		page.once( 'dialog', ( dialog ) => dialog.accept() );
		await button( page, 'new' ).click();
		await expect( page.locator( '#code-editor' ) ).toHaveValue( /Nuovo programma PIC16F84A/ );
		await expect( status( page ) ).toHaveText( 'Nuovo programma' );
	} );

	test( 'New annullato non tocca il programma', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '; il mio lavoro' );
		page.once( 'dialog', ( dialog ) => dialog.dismiss() );
		await button( page, 'new' ).click();
		await expect( page.locator( '#code-editor' ) ).toHaveValue( '; il mio lavoro' );
	} );
} );

test.describe( 'tastiera e schermo intero', () => {
	test( 'le scorciatoie funzionano con il focus nel simulatore', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 5\n    GOTO $' );
		await assemble( page );

		// Click su un'area non focalizzabile del simulatore, poi F8 = Step.
		await page.locator( '#reg-w' ).click();
		await page.keyboard.press( 'F8' );
		await expect( page.locator( '#reg-w' ) ).toHaveText( '05' );
	} );

	test( 'fuori dal simulatore Ctrl+S e F5 restano alla pagina', async ( { page } ) => {
		await openSimulator( page );
		await page.evaluate( () => {
			document.activeElement?.blur();
			window.__picsimPrevented = [];
			document.addEventListener( 'keydown', ( e ) => {
				if ( e.key !== 'Control' ) window.__picsimPrevented.push( e.defaultPrevented );
			} );
		} );
		await page.keyboard.press( 'Control+s' );
		await page.keyboard.press( 'F8' );
		expect( await page.evaluate( () => window.__picsimPrevented ) ).toEqual( [ false, false ] );
		await expect( page.locator( '#reg-pc' ) ).toHaveText( '000' );
	} );

	test( 'schermo intero: entra ed esce', async ( { page } ) => {
		await openSimulator( page );
		const container = page.locator( '#pic-simulator' );

		await page.locator( '#btn-fullscreen2' ).click();
		await expect( container ).toHaveClass( /picsim--fullscreen/ );
		// In schermo intero compare la toolbar completa.
		await expect( page.locator( '#btn-run' ) ).toBeVisible();

		await page.locator( '#btn-fullscreen' ).click();
		await expect( container ).not.toHaveClass( /picsim--fullscreen/ );
	} );
} );
