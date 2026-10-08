/**
 * Telefono (Pixel 7): il simulatore si carica e si usa senza errori.
 */
const { test, expect } = require( '@playwright/test' );
const { openSimulator, setSource, button, assemble } = require( './helpers' );

test.describe( 'telefono', () => {
	test( 'si carica, si assembla e si esegue passo passo', async ( { page } ) => {
		const errors = await openSimulator( page );
		await setSource( page, '    MOVLW 0x2A\n    GOTO $' );
		await assemble( page );
		await expect( page.locator( '#status-text' ) ).toHaveText( /^Assembled/ );

		await button( page, 'step' ).tap();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '2A' );
		expect( errors ).toEqual( [] );
	} );

	test( 'la pagina non scorre in orizzontale', async ( { page } ) => {
		await openSimulator( page );
		const overflow = await page.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
		expect( overflow ).toBeLessThanOrEqual( 0 );
	} );
} );
