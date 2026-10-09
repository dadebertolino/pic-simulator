/**
 * Telefono (Pixel 7): il simulatore si carica e si usa senza errori.
 */
const { test, expect } = require( '@playwright/test' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { openSimulator, setSource, button, assemble } = require( './helpers' );

test.describe( 'telefono', () => {
	test( 'si carica, si assembla e si esegue passo passo', async ( { page } ) => {
		const errors = await openSimulator( page );
		await setSource( page, '    MOVLW 0x2A\n    GOTO $' );
		await assemble( page );
		await expect( page.locator( '#status-text' ) ).toHaveText( 'Assembled' );

		await button( page, 'step' ).tap();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '2A' );
		expect( errors ).toEqual( [] );
	} );

	test( 'ne\' la pagina ne\' il simulatore scorrono in orizzontale', async ( { page } ) => {
		// Regressione: la testata sbordava di ~420 px e copriva l'interfaccia.
		await openSimulator( page );
		const overflow = await page.evaluate( () => {
			const app = document.getElementById( 'pic-simulator-app' );
			return {
				page: document.documentElement.scrollWidth - window.innerWidth,
				app: app.scrollWidth - app.clientWidth,
				header: document.querySelector( '.pic-header' ).scrollWidth - app.clientWidth,
			};
		} );
		expect( overflow.page ).toBeLessThanOrEqual( 0 );
		expect( overflow.app ).toBeLessThanOrEqual( 0 );
		expect( overflow.header ).toBeLessThanOrEqual( 0 );
	} );

	test( 'testata, editor, registri e stato sono visibili', async ( { page } ) => {
		await openSimulator( page );
		for ( const sel of [ '#device-select', '#run-speed', '#btn-assemble', '#code-editor', '#reg-w', '#status-text' ] ) {
			await expect( page.locator( sel ), sel ).toBeVisible();
		}
	} );

	test( 'nessun problema di accessibilita\' (axe)', async ( { page } ) => {
		await openSimulator( page );
		const results = await new AxeBuilder( { page } )
			.include( '#pic-simulator-app' )
			.withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ] )
			.analyze();
		expect( results.violations.map( ( v ) => v.id ) ).toEqual( [] );
	} );
} );
