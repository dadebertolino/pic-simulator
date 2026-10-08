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
		await expect( page.locator( '#status-text' ) ).toHaveText( /^Assemblato/ );

		await button( page, 'step' ).tap();
		await expect( page.locator( '#reg-w' ) ).toHaveText( '2A' );
		expect( errors ).toEqual( [] );
	} );

	test( 'la pagina non scorre in orizzontale', async ( { page } ) => {
		await openSimulator( page );
		const overflow = await page.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
		expect( overflow ).toBeLessThanOrEqual( 0 );
	} );

	test( 'editor, pannelli e stato stanno tutti nel simulatore', async ( { page } ) => {
		// Regressione: l'editor cresceva col sorgente e spingeva i pannelli
		// fuori dal contenitore, che li nascondeva (altezza 0).
		await openSimulator( page );
		const boxes = await page.evaluate( () => {
			const box = ( sel ) => document.querySelector( sel ).getBoundingClientRect();
			const c = box( '#pic-simulator' );
			return [ '.picsim__editor-panel', '.picsim__panels', '#reg-w', '#status-text' ].map( ( sel ) => {
				const r = box( sel );
				return { sel, height: r.height, inside: r.top >= c.top && r.bottom <= c.bottom + 1 };
			} );
		} );
		for ( const b of boxes ) {
			expect( b.inside, `${ b.sel } dentro il simulatore` ).toBe( true );
			expect( b.height, `${ b.sel } visibile` ).toBeGreaterThan( 0 );
		}
		expect( boxes[ 1 ].height ).toBeGreaterThan( 150 );
	} );

	test( 'nessun problema di accessibilita\' (axe)', async ( { page } ) => {
		await openSimulator( page );
		const results = await new AxeBuilder( { page } )
			.include( '#pic-simulator' )
			.withTags( [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ] )
			.analyze();
		expect( results.violations.map( ( v ) => v.id ) ).toEqual( [] );
	} );
} );
