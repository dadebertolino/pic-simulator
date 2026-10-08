/**
 * Utilità condivise dagli spec E2E.
 */
const path = require( 'path' );
const { expect } = require( '@playwright/test' );

const ADMIN_STATE = path.join( __dirname, '.auth', 'admin.json' );

/**
 * Pagine di prova, create (o riallineate) da auth.setup.js. Si aprono con
 * ?pagename= per non dipendere dalla struttura dei permalink.
 */
const PAGES = {
	simulator: { slug: 'picsim-e2e', title: 'Simulatore PIC', content: '[pic_simulator]' },
	double: { slug: 'picsim-e2e-doppio', title: 'Due simulatori', content: '[pic_simulator]\n\n[pic_simulator]' },
	attributes: { slug: 'picsim-e2e-attributi', title: 'Simulatore 600px', content: '[pic_simulator height="600px" fullwidth="yes"]' },
	plain: { slug: 'picsim-e2e-senza', title: 'Pagina senza simulatore', content: '<p>Nessuno shortcode qui.</p>' },
};

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
	// "Pronto" e' gia' nel markup: l'inizializzazione si riconosce da window.picSim.
	await page.waitForFunction( () => window.picSim && window.picSim.ui );
	return errors;
}

/** Sostituisce il sorgente nell'editor come farebbe un utente che incolla. */
async function setSource( page, source ) {
	await page.locator( '#code-editor' ).fill( source );
}

/**
 * Fuori dallo schermo intero e' visibile solo la mini-toolbar (id con
 * suffisso 2): gli spec cliccano quello che vede l'utente.
 */
const button = ( page, name ) => page.locator( `#btn-${ name }2` );

async function assemble( page ) {
	await button( page, 'assemble' ).click();
}

/** Stato della CPU letto dall'oggetto di debug esposto dal template. */
function cpuState( page ) {
	return page.evaluate( () => window.picSim.cpu.getState() );
}

module.exports = { ADMIN_STATE, PAGES, pageUrl, openSimulator, setSource, button, assemble, cpuState };
