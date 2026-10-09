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

		await expect( page.locator( '#pic-simulator-app' ) ).toBeVisible();
		await expect( page.locator( '#status-text' ) ).toHaveText( 'Ready' );
		// Il programma iniziale e' il primo esempio, LED Blink.
		await expect( page.locator( '#code-editor' ) ).toHaveValue( /LED Blink - PIC16F84A/ );
		await expect( page.locator( '#device-select' ) ).toHaveValue( 'PIC16F84A' );
		expect( errors ).toEqual( [] );
	} );

	test( 'CSS e script del plugin caricati, nell\'ordine delle dipendenze', async ( { page } ) => {
		await openSimulator( page );

		await expect( page.locator( 'link#pic-simulator-style-css' ) ).toHaveCount( 1 );
		const scripts = await page.locator( 'script[src*="pic-simulator/assets/js/"]' ).evaluateAll(
			( nodes ) => nodes.map( ( n ) => n.src.match( /assets\/js\/([\w./-]+)\.js/ )[ 1 ] )
		);
		const at = ( name ) => scripts.indexOf( name );
		for ( const name of [ 'core/device-loader', 'core/pic16-peripherals', 'core/peripherals/virtual-bus', 'core/peripherals/mssp',
			'core/pic16-core', 'core/pic16-factory', 'core/assembler', 'core/simulator' ] ) {
			expect( at( name ), name ).toBeGreaterThanOrEqual( 0 );
		}
		expect( at( 'core/device-loader' ) ).toBeLessThan( at( 'core/pic16-core' ) );
		expect( at( 'core/peripherals/virtual-bus' ) ).toBeLessThan( at( 'core/peripherals/mssp' ) );
		expect( at( 'core/pic16-core' ) ).toBeLessThan( at( 'core/pic16-factory' ) );
		expect( at( 'core/assembler' ) ).toBeLessThan( at( 'core/simulator' ) );
	} );

	test( 'una pagina senza shortcode non carica gli asset', async ( { page } ) => {
		await page.goto( pageUrl( 'plain' ) );
		await expect( page.getByText( 'Nessuno shortcode qui.' ) ).toBeVisible();
		await expect( page.locator( 'script[src*="pic-simulator/assets/js/"]' ) ).toHaveCount( 0 );
		await expect( page.locator( 'link#pic-simulator-style-css' ) ).toHaveCount( 0 );
	} );

	test( 'il secondo shortcode nella stessa pagina mostra un avviso', async ( { page } ) => {
		const errors = await openSimulator( page, 'double' );

		await expect( page.locator( '#pic-simulator-app' ) ).toHaveCount( 1 );
		await expect( page.locator( '.picsim-notice' ) ).toContainText( 'un solo simulatore per pagina' );
		expect( errors ).toEqual( [] );
	} );

	test( 'attributi height e fullwidth', async ( { page } ) => {
		await openSimulator( page, 'attributes' );

		const style = await page.locator( '#pic-simulator-app' ).getAttribute( 'style' );
		expect( style ).toContain( 'height: 600px' );
		expect( style ).toContain( 'width: 100vw' );
	} );

	test( 'le schede dei device sono servite dal plugin', async ( { request } ) => {
		const response = await request.get( '/wp-content/plugins/pic-simulator/assets/data/devices/pic16f877a.json' );
		expect( response.ok() ).toBeTruthy();
		expect( ( await response.json() ).device ).toBe( 'PIC16F877A' );
	} );

	test( 'l\'endpoint di stato riporta la versione', async ( { request } ) => {
		const response = await request.get( '/?rest_route=/picsim/v1/status' );
		expect( response.ok() ).toBeTruthy();
		const body = await response.json();
		expect( body.status ).toBe( 'ok' );
		expect( body.version ).toMatch( /^3\.\d+\.\d+$/ );
	} );

	test( 'le pagine di prova esistono', async ( { page } ) => {
		for ( const key of Object.keys( PAGES ) ) {
			const response = await page.goto( pageUrl( key ) );
			expect( response.status(), key ).toBe( 200 );
		}
	} );
} );
