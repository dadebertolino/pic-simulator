/**
 * Comportamenti dell'interfaccia: stato visibile, breakpoint durante Run,
 * Step Over, Animate, file e tastiera.
 */
const fs = require( 'fs' );
const { test, expect } = require( '@playwright/test' );
const { openSimulator, setSource, button, assemble, cpuState } = require( './helpers' );

const status = ( page ) => page.locator( '#status-text' );

test.describe( 'interfaccia', () => {
	test( 'stato, cicli e tempo sono visibili anche fuori dallo schermo intero', async ( { page } ) => {
		await openSimulator( page );
		await expect( page.locator( '#pic-simulator' ) ).not.toHaveClass( /picsim--fullscreen/ );
		await expect( status( page ) ).toBeVisible();
		await expect( status( page ) ).toHaveText( 'Pronto' );
		await expect( page.locator( '#cycles-count' ) ).toBeVisible();
		await expect( page.locator( '#sim-time' ) ).toBeVisible();
	} );

	test( 'durante Run il ✕ di un breakpoint si clicca', async ( { page } ) => {
		// Regressione: la lista si ricostruiva 60 volte al secondo e il click andava perso.
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    INCF 0x21, F\n    GOTO LOOP\n    NOP' );
		await assemble( page );
		await page.locator( '.picsim__line-num[data-line="4"]' ).click(); // mai raggiunta
		await expect( page.locator( '#breakpoints-list button' ) ).toHaveCount( 1 );

		await button( page, 'run' ).click();
		await expect( status( page ) ).toHaveText( 'In esecuzione...' );
		await page.locator( '#breakpoints-list button[aria-label="Rimuovi il breakpoint a 0x003"]' ).click();
		await expect( page.locator( '#breakpoints-list button' ) ).toHaveCount( 0 );
		await expect( page.locator( '.picsim__line-num--bp' ) ).toHaveCount( 0 );
		await button( page, 'stop' ).click();
	} );

	test( 'Step Over su CALL DELAY arriva alla riga dopo la CALL', async ( { page } ) => {
		// Regressione: si fermava dopo 10.000 cicli, dentro il ritardo.
		await openSimulator( page );
		await assemble( page ); // programma iniziale: MAIN chiama DELAY (~200.000 cicli)

		const main = await page.evaluate( () => window.picSim.simulator.assemblyResult.labels.MAIN );
		while ( ( await cpuState( page ) ).PC !== main + 1 ) {
			await button( page, 'step' ).click();
		}
		await button( page, 'step-over' ).click();
		await expect( status( page ) ).toHaveText( 'Step Over' );

		const state = await cpuState( page );
		expect( state.PC ).toBe( main + 2 );
		expect( state.stackPointer ).toBe( 0 );
		expect( state.cycles ).toBeGreaterThan( 190000 );
		// La velocita' di Run scelta non cambia.
		expect( await page.evaluate( () => window.picSim.simulator.speedFactor ) ).toBe( 1 );
	} );

	test( 'lo slider di Animate cambia ritmo mentre Animate e\' in corso', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: INCF 0x20, F\n    GOTO LOOP' );
		await assemble( page );

		await page.locator( '#speed-slider2' ).fill( '1' ); // 1 istruzione al secondo
		await button( page, 'animate' ).click();
		await page.waitForTimeout( 1200 );
		const slow = ( await cpuState( page ) ).cycles;
		expect( slow ).toBeLessThanOrEqual( 4 );

		await page.locator( '#speed-slider2' ).fill( '5' ); // 100 istruzioni al secondo, senza riavviare
		await expect( page.locator( '#speed-value2' ) ).toHaveText( '100 Hz' );
		await expect( page.locator( '#speed-slider2' ) ).toHaveAttribute( 'aria-valuetext', '100 istruzioni al secondo' );
		await page.waitForTimeout( 1000 );
		expect( ( await cpuState( page ) ).cycles - slow ).toBeGreaterThan( 50 );
		await button( page, 'stop' ).click();
	} );

	test( 'export Intel HEX con il nome del file caricato', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#file-input' ).setInputFiles( {
			name: 'semaforo.asm',
			mimeType: 'text/plain',
			buffer: Buffer.from( '    MOVLW 0x55\n    GOTO 0\n' ),
		} );
		await expect( status( page ) ).toHaveText( 'Caricato: semaforo.asm' );

		const [ download ] = await Promise.all( [
			page.waitForEvent( 'download' ),
			button( page, 'hex' ).click(),
		] );
		expect( download.suggestedFilename() ).toBe( 'semaforo.hex' );
		expect( fs.readFileSync( await download.path(), 'utf8' ) ).toBe( ':04000000553000284F\n:00000001FF\n' );
		await expect( status( page ) ).toHaveText( 'Esportato: semaforo.hex' );

		// Save usa lo stesso nome.
		const [ saved ] = await Promise.all( [
			page.waitForEvent( 'download' ),
			button( page, 'save' ).click(),
		] );
		expect( saved.suggestedFilename() ).toBe( 'semaforo.asm' );
	} );

	test( 'un esempio caricato si salva col suo nome', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#examples-select2' ).selectOption( '05_timer0_interrupt' );
		await expect( status( page ) ).toHaveText( 'Caricato: 05_timer0_interrupt' );
		const [ download ] = await Promise.all( [
			page.waitForEvent( 'download' ),
			button( page, 'save' ).click(),
		] );
		expect( download.suggestedFilename() ).toBe( '05_timer0_interrupt.asm' );
	} );

	test( 'Cmd+S (Mac) salva come Ctrl+S', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#reg-w' ).click(); // focus nel simulatore, fuori dall'editor
		const [ download ] = await Promise.all( [
			page.waitForEvent( 'download' ),
			page.keyboard.press( 'Meta+s' ),
		] );
		expect( download.suggestedFilename() ).toBe( 'programma.asm' );
	} );

	test( 'TMR0 mostra la sorgente del clock in italiano', async ( { page } ) => {
		await openSimulator( page );
		await expect( page.locator( '#tmr0-source' ) ).toHaveText( 'esterna (RA4)' ); // OPTION_REG = 0xFF al reset
		await setSource( page, '    BSF STATUS, RP0\n    CLRF OPTION_REG\n    GOTO $' );
		await assemble( page );
		await button( page, 'step' ).click();
		await button( page, 'step' ).click();
		await expect( page.locator( '#tmr0-source' ) ).toHaveText( 'interna' );
	} );
} );
