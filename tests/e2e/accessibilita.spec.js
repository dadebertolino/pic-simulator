/**
 * Accessibilita' (WCAG 2.1 AA) verificata con axe-core sul simulatore, negli
 * stati in cui lo vede uno studente: appena aperto, con errori di
 * assemblaggio, in esecuzione, con le periferiche e l'hardware virtuale.
 */
const { test, expect } = require( '@playwright/test' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { openSimulator, setSource, button, assemble, loadExample } = require( './helpers' );

async function violations( page ) {
	const results = await new AxeBuilder( { page } )
		.include( '#pic-simulator-app' )
		.withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ] )
		.analyze();
	return results.violations.map( ( v ) => `${ v.id }: ${ v.nodes.map( ( n ) => n.target.join( ' ' ) ).join( ', ' ) }` );
}

/** Apre tutti i pannelli richiudibili, perche' axe veda anche il loro contenuto. */
async function expandPanels( page ) {
	await page.evaluate( () => document.querySelectorAll( '.pic-collapsed, .collapsed' ).forEach( ( e ) => e.classList.remove( 'pic-collapsed', 'collapsed' ) ) );
}

test.describe( 'accessibilita\'', () => {
	test( 'simulatore appena aperto', async ( { page } ) => {
		await openSimulator( page );
		expect( await violations( page ) ).toEqual( [] );
	} );

	test( 'con errori di assemblaggio', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    FOO\n    BAR 1' );
		await assemble( page );
		await expect( page.locator( '#error-list .error-item' ) ).toHaveCount( 2 );
		expect( await violations( page ) ).toEqual( [] );
	} );

	test( 'in esecuzione, con pulsanti abilitati e breakpoint', async ( { page } ) => {
		await openSimulator( page );
		await assemble( page );
		await page.locator( '.pic-gutter-bp.bp-clickable' ).first().click();
		await button( page, 'run' ).click();
		await expandPanels( page );
		expect( await violations( page ) ).toEqual( [] );
		await button( page, 'stop' ).click();
	} );

	for ( const example of [ 'ADC + USART', 'Voltage Comparator', 'LCD I²C (PCF8574)' ] ) {
		test( `pannelli delle periferiche: ${ example }`, async ( { page } ) => {
			await openSimulator( page );
			await loadExample( page, example );
			await assemble( page );
			await button( page, 'run' ).click();
			await page.waitForTimeout( 500 );
			await expandPanels( page );
			expect( await violations( page ) ).toEqual( [] );
			await button( page, 'stop' ).click();
		} );
	}
} );
