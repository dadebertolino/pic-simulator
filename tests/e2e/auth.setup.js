/**
 * Login admin e pagine di prova.
 *
 * Le pagine si creano via REST e non con wp-cli, cosi' il setup funziona
 * uguale su wp-env (CI) e su WordPress Playground (locale senza Docker).
 * Idempotente: una pagina gia' presente viene riallineata al contenuto atteso.
 */
const { test: setup, expect } = require( '@playwright/test' );
const { ADMIN_STATE, PAGES } = require( './helpers' );

setup( 'login admin e pagine di prova', async ( { page } ) => {
	// Login con una POST diretta e non dal form: il click (e a volte anche
	// Invio) va perso se arriva prima che gli script di wp-login.php siano
	// pronti. page.request condivide i cookie con il browser.
	await page.request.get( '/wp-login.php' ); // imposta wordpress_test_cookie
	const login = await page.request.post( '/wp-login.php', {
		form: {
			log: process.env.WP_USERNAME || 'admin',
			pwd: process.env.WP_PASSWORD || 'password',
			testcookie: '1',
			redirect_to: '/wp-admin/',
		},
		maxRedirects: 0,
	} );
	expect( login.status(), 'login rifiutato: controlla utente e password' ).toBe( 302 );

	// domcontentloaded: l'evento load della bacheca dipende da risorse
	// esterne (Gravatar, feed delle notizie) e puo' non arrivare mai.
	await page.goto( '/wp-admin/', { waitUntil: 'domcontentloaded' } );
	await expect( page.locator( '#wpadminbar' ) ).toBeVisible();

	// Nonce REST dell'utente loggato: la bacheca carica wp-api-request, che lo
	// espone in wpApiSettings.
	const nonce = await page.evaluate( () => window.wpApiSettings && window.wpApiSettings.nonce );
	expect( nonce ).toMatch( /^[a-f0-9]{10}$/ );
	const headers = { 'X-WP-Nonce': nonce };

	for ( const { slug, title, content } of Object.values( PAGES ) ) {
		const found = await page.request.get( `/?rest_route=/wp/v2/pages&slug=${ slug }&status=publish,draft`, { headers } );
		expect( found.ok() ).toBeTruthy();
		const [ existing ] = await found.json();

		const route = existing ? `/?rest_route=/wp/v2/pages/${ existing.id }` : '/?rest_route=/wp/v2/pages';
		const saved = await page.request.post( route, {
			headers,
			data: { slug, title, content, status: 'publish' },
		} );
		expect( saved.ok(), `pagina ${ slug }: ${ await saved.text() }` ).toBeTruthy();
	}

	await page.context().storageState( { path: ADMIN_STATE } );
} );
