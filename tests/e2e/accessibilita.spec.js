/**
 * Accessibilita' (WCAG 2.1 AA) verificata con axe-core sul simulatore, negli
 * stati in cui lo vede uno studente: appena aperto, con errori di
 * assemblaggio, in esecuzione con i LED accesi, a schermo intero.
 */
const { test, expect } = require( '@playwright/test' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { openSimulator, setSource, button, assemble } = require( './helpers' );

async function violations( page ) {
	const results = await new AxeBuilder( { page } )
		.include( '#pic-simulator' )
		.withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ] )
		.analyze();
	return results.violations.map( ( v ) => `${ v.id }: ${ v.nodes.map( ( n ) => n.target.join( ' ' ) ).join( ', ' ) }` );
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
		await expect( page.locator( '#error-panel .picsim__error' ) ).toHaveCount( 2 );
		expect( await violations( page ) ).toEqual( [] );
	} );

	test( 'in esecuzione, con LED accesi e bit di STATUS impostati', async ( { page } ) => {
		await openSimulator( page );
		await setSource( page, '    BSF STATUS, RP0\n    CLRF TRISB\n    BCF STATUS, RP0\n    MOVLW 0x55\n    MOVWF PORTB\n    CLRW\n    GOTO $' );
		await assemble( page );
		for ( let i = 0; i < 6; i++ ) await button( page, 'step' ).click();
		await page.locator( '.picsim__line-num[data-line="7"]' ).click(); // un breakpoint in elenco
		expect( await violations( page ) ).toEqual( [] );
	} );

	test( 'a schermo intero, con la toolbar completa', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#btn-fullscreen2' ).click();
		await expect( page.locator( '#btn-run' ) ).toBeVisible();
		expect( await violations( page ) ).toEqual( [] );
	} );
} );
