/**
 * Smoke test: plugin attivo, shortcode reso, asset caricati nell'ordine
 * giusto, nessun errore JavaScript. Se falliscono, gli altri risultati non
 * sono attendibili.
 */
const { test, expect } = require( '@playwright/test' );
const { PAGES, pageUrl, openSimulator } = require( './helpers' );

test.describe( 'infrastruttura', () => {
	test( 'lo shortcode mostra il simulatore senza errori JavaScript', async ( { page } ) => {
		const errors = await openSimulator( page );

		await expect( page.locator( '#pic-simulator' ) ).toBeVisible();
		await expect( page.locator( '#status-text' ) ).toHaveText( 'Pronto' );
		// Il programma iniziale e' il blink LED.
		await expect( page.locator( '#code-editor' ) ).toHaveValue( /Blink LED su RB0/ );
		expect( errors ).toEqual( [] );
	} );

	test( 'CSS e script del plugin caricati, nell\'ordine delle dipendenze', async ( { page } ) => {
		await openSimulator( page );

		await expect( page.locator( 'link#picsim-style-css' ) ).toHaveCount( 1 );
		const scripts = await page.locator( 'script[src*="pic-simulator/assets/js/"]' ).evaluateAll(
			( nodes ) => nodes.map( ( n ) => n.src.match( /assets\/js\/([\w.]+)\.js/ )[ 1 ] )
		);
		expect( scripts ).toEqual( [ 'pic16f84a', 'assembler', 'simulator', 'ui' ] );
	} );

	test( 'una pagina senza shortcode non carica gli asset', async ( { page } ) => {
		await page.goto( pageUrl( 'plain' ) );
		await expect( page.getByText( 'Nessuno shortcode qui.' ) ).toBeVisible();
		await expect( page.locator( 'script[src*="pic-simulator/assets/js/"]' ) ).toHaveCount( 0 );
		await expect( page.locator( 'link#picsim-style-css' ) ).toHaveCount( 0 );
	} );

	test( 'il secondo shortcode nella stessa pagina mostra un avviso', async ( { page } ) => {
		const errors = await openSimulator( page, 'double' );

		await expect( page.locator( '#pic-simulator' ) ).toHaveCount( 1 );
		await expect( page.locator( '.picsim-notice' ) ).toContainText( 'un solo simulatore per pagina' );
		expect( errors ).toEqual( [] );
	} );

	test( 'attributi height e fullwidth', async ( { page } ) => {
		await openSimulator( page, 'attributes' );

		const style = await page.locator( '#pic-simulator' ).getAttribute( 'style' );
		expect( style ).toContain( 'height: 600px' );
		expect( style ).toContain( 'width: 100vw' );
	} );

	test( 'gli esempi sono serviti dal plugin', async ( { request } ) => {
		const response = await request.get( '/wp-content/plugins/pic-simulator/examples/01_blink_led.asm' );
		expect( response.ok() ).toBeTruthy();
		expect( await response.text() ).toContain( 'BLINK LED' );
	} );

	test( 'le pagine di prova esistono', async ( { page } ) => {
		for ( const key of Object.keys( PAGES ) ) {
			const response = await page.goto( pageUrl( key ) );
			expect( response.status(), key ).toBe( 200 );
		}
	} );
} );
