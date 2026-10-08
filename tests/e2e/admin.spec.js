/**
 * Pagina Impostazioni → WebPicSimulator e caricamento mirato del design system.
 */
const { test, expect } = require( '@playwright/test' );
const { ADMIN_STATE } = require( './helpers' );

test.use( { storageState: ADMIN_STATE } );

test.describe( 'amministrazione', () => {
	test( 'la pagina del plugin si apre dal menu Impostazioni', async ( { page } ) => {
		await page.goto( '/wp-admin/options-general.php?page=webpicsimulator' );

		await expect( page.locator( '.db-ui-page-header h1' ) ).toHaveText( 'WebPicSimulator' );
		await expect( page.locator( '.db-ui-badge' ) ).toHaveText( /^v\d+\.\d+\.\d+$/ );
		await expect( page.locator( 'code', { hasText: '[pic_simulator]' } ).first() ).toBeVisible();
		await expect( page.locator( 'link#db-admin-ui-css' ) ).toHaveCount( 1 );
	} );

	test( 'il design system non viene caricato nelle altre pagine admin', async ( { page } ) => {
		await page.goto( '/wp-admin/options-general.php' );
		await expect( page.locator( '#wpadminbar' ) ).toBeVisible();
		await expect( page.locator( 'link#db-admin-ui-css' ) ).toHaveCount( 0 );
	} );

	test( 'la versione mostrata coincide con quella dell\'header del plugin', async ( { page } ) => {
		await page.goto( '/wp-admin/plugins.php' );
		const row = page.locator( 'tr[data-plugin="pic-simulator/pic-simulator.php"]' );
		await expect( row ).toHaveClass( /active/ );
		const header = ( await row.locator( '.plugin-version-author-uri' ).textContent() ).match( /\d+\.\d+\.\d+/ )[ 0 ];

		await page.goto( '/wp-admin/options-general.php?page=webpicsimulator' );
		await expect( page.locator( '.db-ui-badge' ) ).toHaveText( `v${ header }` );
	} );
} );
