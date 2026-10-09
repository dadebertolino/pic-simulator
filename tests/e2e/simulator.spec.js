/**
 * Il simulatore usato come lo usa uno studente: assembla, esegue, debugga,
 * cambia device, interagisce con i pin.
 */
const { test, expect } = require( '@playwright/test' );
const { openSimulator, setSource, button, status, assemble, loadExample, cpuState, portPins } = require( './helpers' );

test.describe( 'assemblaggio', () => {
	test( 'il programma iniziale si assembla', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await expect( status( page ) ).toHaveText( 'Assembled' );
		await expect( page.locator( '#error-list .error-item' ) ).toHaveCount( 0 );
		await expect( button( page, 'run' ) ).toBeEnabled();
	} );

	test( 'gli errori sono elencati per riga', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    NOP\n    MOVLW FOO\n    BSF PORTB, 9' );
		await assemble( page );

		await expect( status( page ) ).toHaveText( '2 Errors' );
		const rows = page.locator( '#error-list .error-item' );
		await expect( rows ).toHaveCount( 2 );
		await expect( rows.nth( 0 ) ).toContainText( 'Line 2' );
		await expect( rows.nth( 0 ) ).toContainText( 'Simbolo non definito: FOO' );
		await expect( rows.nth( 1 ) ).toContainText( 'Line 3' );
		await expect( button( page, 'run' ) ).toBeDisabled();
	} );

	test( 'un operando con HTML resta testo nel pannello errori', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW <img src=x onerror="window.__picsimXss=1">' );
		await assemble( page );

		await expect( page.locator( '#error-list' ) ).toContainText( '<img src=x' );
		await expect( page.locator( '#error-list img' ) ).toHaveCount( 0 );
		expect( await page.evaluate( () => window.__picsimXss ) ).toBeUndefined();
	} );

	test( 'modificare il sorgente chiede di riassemblare', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await page.locator( '#code-editor' ).press( 'End' );
		await page.locator( '#code-editor' ).pressSequentially( ' ' );
		await expect( status( page ) ).toHaveText( 'Modified' );
		await expect( button( page, 'run' ) ).toBeDisabled();
	} );
} );

test.describe( 'esecuzione e debug', () => {
	test( 'Step esegue un\'istruzione e aggiorna i registri', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 0x3C\n    MOVWF 0x20\n    GOTO $' );
		await assemble( page );

		await button( page, 'step' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '3C' );
		await expect( page.locator( '#reg-pc' ) ).toHaveText( '0001' );
		await expect( page.locator( '#current-instruction' ) ).toHaveText( '001: MOVWF 0x20' );
	} );

	test( 'il flag Z si accende nel pannello registri', async ( { page } ) => {
		// Regressione: setZ(true) azzerava Z.
		await openSimulator( page );
		await setSource( page, '    MOVLW 1\n    ANDLW 0\n    GOTO $' );
		await assemble( page );
		await button( page, 'step' ).click();
		await button( page, 'step' ).click();
		await expect( page.locator( '#bit-z' ) ).toHaveClass( /\bset\b/ );
	} );

	test( 'Run si ferma sul breakpoint', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'LOOP: NOP\n    NOP\n    INCF 0x20, F\n    GOTO LOOP' );
		await assemble( page );
		await page.locator( '.pic-gutter-bp[data-line="3"]' ).click();
		await expect( page.locator( '.pic-gutter-bp[data-line="3"]' ) ).toHaveClass( /bp-active/ );

		await button( page, 'run' ).click();
		await expect( status( page ) ).toHaveText( 'Breakpoint' );
		const s = await cpuState( page );
		expect( s.PC ).toBe( 2 );
		await expect( button( page, 'run' ) ).toBeEnabled();
	} );

	test( 'Run e Stop; il tempo simulato avanza', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect( status( page ) ).toHaveText( 'Running' );
		await expect.poll( async () => ( await cpuState( page ) ).cycles ).toBeGreaterThan( 100000 );
		await button( page, 'stop' ).click();
		await expect( status( page ) ).toHaveText( 'Halted' );

		const cycles = ( await cpuState( page ) ).cycles;
		await page.waitForTimeout( 300 );
		expect( ( await cpuState( page ) ).cycles ).toBe( cycles );
		await expect( page.locator( '#sim-time' ) ).toHaveText( /\d+(\.\d+)? (ms|s)$/ );
	} );

	test( 'in tempo reale il LED Blink cambia stato in meno di un secondo', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect.poll( () => portPins( page, 'B' ), { timeout: 3000 } ).toBe( 1 );
		await expect.poll( () => portPins( page, 'B' ), { timeout: 3000 } ).toBe( 0 );
		await button( page, 'stop' ).click();
	} );

	test( 'la velocita\' di Run si sceglie dal menu', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await page.locator( '#run-speed' ).selectOption( '0.001' );
		expect( await page.evaluate( () => window.picSim.simulator.speedFactor ) ).toBe( 0.001 );

		await button( page, 'run' ).click();
		await page.waitForTimeout( 1000 );
		await button( page, 'stop' ).click();
		const slow = ( await cpuState( page ) ).cycles;
		expect( slow ).toBeGreaterThan( 300 );
		expect( slow ).toBeLessThan( 5000 );

		await page.locator( '#run-speed' ).selectOption( 'max' );
		expect( await page.evaluate( () => window.picSim.simulator.speedFactor ) ).toBe( Infinity );
	} );

	test( 'Step Over su CALL DELAY arriva all\'istruzione dopo la CALL', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page,
			'    CALL DELAY\n    NOP\nL:  GOTO L\n' +
			'DELAY: MOVLW 0xFF\n    MOVWF 0x20\nD1: MOVLW 0xFF\n    MOVWF 0x21\n' +
			'D2: DECFSZ 0x21, F\n    GOTO D2\n    DECFSZ 0x20, F\n    GOTO D1\n    RETURN' );
		await assemble( page );

		await button( page, 'step-over' ).click();
		await expect( status( page ) ).toHaveText( 'Step Over' );
		const s = await cpuState( page );
		expect( s.PC ).toBe( 1 );
		expect( s.stackUsed ).toBe( 0 );
		expect( s.cycles ).toBeGreaterThan( 190000 );
	} );

	test( 'Animate avanza un passo alla volta al ritmo del cursore', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, 'L: INCF 0x20, F\n    GOTO L' );
		await assemble( page );
		await page.locator( '#speed-slider' ).fill( '5' );
		await expect( page.locator( '#speed-value' ) ).toHaveText( '100 Hz' );

		await button( page, 'animate' ).click();
		await expect( status( page ) ).toHaveText( 'Animating' );
		await page.waitForTimeout( 500 );
		await button( page, 'stop' ).click();
		const steps = await page.evaluate( () => window.picSim.simulator.stepCount );
		expect( steps ).toBeGreaterThan( 10 );
		expect( steps ).toBeLessThan( 120 );
	} );

	test( 'Reset riporta PC e cicli a zero e conserva il programma', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    MOVLW 5\n    GOTO $' );
		await assemble( page );
		await button( page, 'step' ).click();
		await button( page, 'reset' ).click();

		const s = await cpuState( page );
		expect( s.PC ).toBe( 0 );
		expect( s.cycles ).toBe( 0 );
		await expect( page.locator( '#cycles' ) ).toHaveText( '0' );
		await button( page, 'step' ).click();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '05' );
	} );
} );

test.describe( 'device, esempi e pin', () => {
	test( 'un esempio per 877A cambia device da solo e si assembla', async ( { page } ) => {
		// Regressione: con il 16F84A selezionato i simboli del 877A erano sconosciuti.
		const errors = await openSimulator( page );
		await loadExample( page, 'Multi-Port I/O' );
		await expect( page.locator( '#device-select' ) ).toHaveValue( 'PIC16F877A' );
		await expect( page.locator( '#pin-D0' ) ).toBeVisible();

		await assemble( page );
		await expect( status( page ) ).toHaveText( 'Assembled' );
		expect( errors ).toEqual( [] );
	} );

	test( 'un ingresso dal pannello porte arriva al programma', async ( { page } ) => {
		await openSimulator( page );
		await loadExample( page, 'Button + LED' );
		await assemble( page );
		await button( page, 'run' ).click();

		await page.locator( '#pin-A0 .pin-input' ).check();
		await expect.poll( () => portPins( page, 'B' ) ).toBe( 1 );
		await page.locator( '#pin-A0 .pin-input' ).uncheck();
		await expect.poll( () => portPins( page, 'B' ) ).toBe( 0 );
		await button( page, 'stop' ).click();
	} );

	test( 'la EEPROM sopravvive al Reset e si cancella riassemblando', async ( { page } ) => {
		await openSimulator( page );
		await loadExample( page, 'EEPROM Read/Write' );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect.poll( () => portPins( page, 'B' ) ).toBe( 0x42 );
		await button( page, 'stop' ).click();

		const eeprom0 = () => page.evaluate( () => window.picSim.simulator.readEEPROM( 0 ) );
		expect( await eeprom0() ).toBe( 0x42 );
		await button( page, 'reset' ).click();
		expect( await eeprom0() ).toBe( 0x42 );

		await assemble( page );
		expect( await eeprom0() ).toBe( 0xFF );
	} );

	test( 'il cambio di device dal menu ricostruisce porte e registri', async ( { page } ) => {
		const errors = await openSimulator( page );
		await page.locator( '#device-select' ).selectOption( 'PIC16F628A' );
		await expect( page.locator( '#messages' ) ).toContainText( 'Switched to PIC16F628A' );
		await expect( page.locator( '#reg-eedata' ) ).toBeVisible();
		await expect( page.locator( '#pin-B7' ) ).toBeVisible();
		await expect( page.locator( '#pin-C0' ) ).toHaveCount( 0 );
		expect( errors ).toEqual( [] );
	} );
} );
