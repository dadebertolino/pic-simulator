/**
 * Login admin, pagine di prova e utenti della parte didattica.
 *
 * Pagine e utenti si creano via REST e non con wp-cli, cosi' il setup
 * funziona uguale su wp-env (CI) e su WordPress Playground (locale senza
 * Docker). Idempotente: cio' che esiste gia' viene riallineato.
 */
const { test: setup, expect } = require( '@playwright/test' );
const { ADMIN_STATE, PAGES, USERS, PASSWORD, stateFile } = require( './helpers' );

/**
 * Login con una POST diretta e non dal form: il click (e a volte anche
 * Invio) va perso se arriva prima che gli script di wp-login.php siano
 * pronti. request condivide i cookie con il browser del contesto.
 */
async function login( request, username, password ) {
	await request.get( '/wp-login.php' ); // imposta wordpress_test_cookie
	const res = await request.post( '/wp-login.php', {
		form: { log: username, pwd: password, testcookie: '1', redirect_to: '/wp-admin/' },
		maxRedirects: 0,
	} );
	expect( res.status(), `login di ${ username } rifiutato` ).toBe( 302 );
}

setup( 'login admin, pagine e utenti di prova', async ( { page, browser } ) => {
	await login( page.request, process.env.WP_USERNAME || 'admin', process.env.WP_PASSWORD || 'password' );

	// domcontentloaded: l'evento load della bacheca dipende da risorse
	// esterne (Gravatar, feed delle notizie) e puo' non arrivare mai.
	await page.goto( '/wp-admin/', { waitUntil: 'domcontentloaded' } );
	await expect( page.locator( '#wpadminbar' ) ).toBeVisible();

	const nonce = await page.evaluate( () => window.wpApiSettings && window.wpApiSettings.nonce );
	expect( nonce ).toMatch( /^[a-f0-9]{10}$/ );
	const headers = { 'X-WP-Nonce': nonce };

	for ( const { slug, title, content } of Object.values( PAGES ) ) {
		const found = await page.request.get( `/?rest_route=/wp/v2/pages&slug=${ slug }&status=publish,draft`, { headers } );
		expect( found.ok() ).toBeTruthy();
		const [ existing ] = await found.json();

		const route = existing ? `/?rest_route=/wp/v2/pages/${ existing.id }` : '/?rest_route=/wp/v2/pages';
		const saved = await page.request.post( route, { headers, data: { slug, title, content, status: 'publish' } } );
		expect( saved.ok(), `pagina ${ slug }: ${ await saved.text() }` ).toBeTruthy();
	}

	for ( const { username, role } of Object.values( USERS ) ) {
		const found = await page.request.get( `/?rest_route=/wp/v2/users&search=${ username }&context=edit`, { headers } );
		expect( found.ok() ).toBeTruthy();
		const existing = ( await found.json() ).find( ( u ) => u.username === username );

		const route = existing ? `/?rest_route=/wp/v2/users/${ existing.id }` : '/?rest_route=/wp/v2/users';
		const data = { username, password: PASSWORD, email: `${ username }@example.org`, roles: [ role ], name: username };
		const saved = await page.request.post( route, { headers, data } );
		expect( saved.ok(), `utente ${ username }: ${ await saved.text() }` ).toBeTruthy();
	}

	await page.context().storageState( { path: ADMIN_STATE } );

	// Una sessione salvata per ogni utente della parte didattica.
	for ( const [ key, { username } ] of Object.entries( USERS ) ) {
		const context = await browser.newContext();
		await login( context.request, username, PASSWORD );
		await context.storageState( { path: stateFile( key ) } );
		await context.close();
	}
} );
