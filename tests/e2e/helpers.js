/**
 * Utilità condivise dagli spec E2E.
 */
const path = require( 'path' );
const { expect } = require( '@playwright/test' );

const AUTH_DIR = path.join( __dirname, '.auth' );
const ADMIN_STATE = path.join( AUTH_DIR, 'admin.json' );

/**
 * Pagine di prova, create (o riallineate) da auth.setup.js. Si aprono con
 * ?pagename= per non dipendere dalla struttura dei permalink.
 */
const PAGES = {
	simulator: { slug: 'picsim-e2e', title: 'Simulatore PIC', content: '[pic_simulator]' },
	double: { slug: 'picsim-e2e-doppio', title: 'Due simulatori', content: '[pic_simulator]\n\n[pic_simulator]' },
	attributes: { slug: 'picsim-e2e-attributi', title: 'Simulatore 600px', content: '[pic_simulator height="600px" fullwidth="yes"]' },
	plain: { slug: 'picsim-e2e-senza', title: 'Pagina senza simulatore', content: '<p>Nessuno shortcode qui.</p>' },
	dashboard: { slug: 'picsim-e2e-dashboard', title: 'Dashboard progetti', content: '[pic_dashboard]' },
};

/**
 * Utenti della parte didattica: il docente e' un autore (ha le capability
 * picsim_* aggiunte all'attivazione), gli studenti sono iscritti.
 */
const USERS = {
	teacher: { username: 'picsim_docente', role: 'author' },
	student: { username: 'picsim_studente', role: 'subscriber' },
	other: { username: 'picsim_studente2', role: 'subscriber' },
	colleague: { username: 'picsim_collega', role: 'author' },
};
const PASSWORD = 'picsim-e2e-Password1!';
const stateFile = ( key ) => path.join( AUTH_DIR, `${ key }.json` );

const pageUrl = ( key ) => `/?pagename=${ PAGES[ key ].slug }`;

/**
 * Apre la pagina del simulatore e aspetta che sia inizializzato. Raccoglie
 * gli errori JavaScript: un errore in console e' quasi sempre un bug.
 */
async function openSimulator( page, key = 'simulator' ) {
	const errors = [];
	page.on( 'pageerror', ( err ) => errors.push( err.message ) );
	page.on( 'console', ( msg ) => {
		if ( msg.type() === 'error' ) errors.push( msg.text() );
	} );

	await page.goto( pageUrl( key ) );
	await page.waitForFunction( () => window.picSim && window.picSim.ui );
	return errors;
}

/** Sostituisce il sorgente nell'editor come farebbe un utente che incolla. */
async function setSource( page, source ) {
	await page.locator( '#code-editor' ).fill( source );
}

const button = ( page, name ) => page.locator( `#btn-${ name }` );
const status = ( page ) => page.locator( '#status-text' );

/** Assembla e aspetta l'esito (il cambio di device prima e' asincrono). */
async function assemble( page ) {
	await button( page, 'assemble' ).click();
	await expect( status( page ) ).toHaveText( /^(Assembled|\d+ Errors?)$/ );
}

/** Carica un esempio dal menu, per nome. */
async function loadExample( page, name ) {
	const value = await page.locator( '#examples-select option', { hasText: name } ).first().getAttribute( 'value' );
	await page.locator( '#examples-select' ).selectOption( value );
	await expect( page.locator( '#messages' ) ).toContainText( `Loaded: ${ name }` );
}

/**
 * Stato della CPU corrente. window.picSim.cpu resta quella iniziale: al
 * cambio di device la CPU nuova e' in simulator.cpu.
 */
function cpuState( page ) {
	return page.evaluate( () => window.picSim.simulator.cpu.getState() );
}

/** Pin di una porta come li vede lo studente (latch sulle uscite, esterno sugli ingressi). */
function portPins( page, port ) {
	return page.evaluate( ( p ) => window.picSim.simulator.cpu.getPeripheral( 'GPIO_' + p )._readPort(), port );
}

/**
 * Client REST per l'utente della sessione: il nonce si chiede ad
 * admin-ajax (action=rest-nonce), che lo da' a qualunque utente loggato.
 */
async function restClient( request ) {
	const res = await request.get( '/wp-admin/admin-ajax.php?action=rest-nonce' );
	expect( res.ok(), 'nonce REST' ).toBeTruthy();
	const nonce = ( await res.text() ).trim();
	const call = async ( method, route, data ) => {
		// Con ?rest_route= i parametri della rotta si accodano con &
		const r = await request.fetch( `/?rest_route=/picsim/v1${ route.replace( '?', '&' ) }`, {
			method,
			headers: { 'X-WP-Nonce': nonce },
			data,
		} );
		let body = null;
		try {
			body = await r.json();
		} catch {
			body = null;
		}
		return { status: r.status(), body };
	};
	return {
		get: ( route ) => call( 'GET', route ),
		post: ( route, data ) => call( 'POST', route, data || {} ),
		put: ( route, data ) => call( 'PUT', route, data || {} ),
		del: ( route ) => call( 'DELETE', route ),
	};
}

module.exports = {
	ADMIN_STATE, PAGES, USERS, PASSWORD, stateFile, pageUrl,
	openSimulator, setSource, button, status, assemble, loadExample, cpuState, portPins, restClient,
};
