/**
 * Pagina Impostazioni → WebPicSimulator.
 */
const { test, expect } = require( '@playwright/test' );
const { ADMIN_STATE } = require( './helpers' );

test.use( { storageState: ADMIN_STATE } );

test.describe( 'amministrazione', () => {
	test( 'la pagina del plugin si apre dal menu Impostazioni', async ( { page } ) => {
		await page.goto( '/wp-admin/options-general.php?page=webpicsimulator' );
		await expect( page.locator( '.wrap h1' ) ).toContainText( 'WebPicSimulator' );
		await expect( page.locator( 'code', { hasText: '[pic_simulator]' } ).first() ).toBeVisible();
		await expect( page.locator( 'code', { hasText: '[pic_dashboard]' } ).first() ).toBeVisible();
	} );

	test( 'la versione mostrata coincide con quella dell\'header del plugin', async ( { page } ) => {
		await page.goto( '/wp-admin/plugins.php' );
		const row = page.locator( 'tr[data-plugin="pic-simulator/pic-simulator.php"]' );
		await expect( row ).toHaveClass( /active/ );
		const header = ( await row.locator( '.plugin-version-author-uri' ).textContent() ).match( /\d+\.\d+\.\d+/ )[ 0 ];

		await page.goto( '/wp-admin/options-general.php?page=webpicsimulator' );
		await expect( page.locator( '.wrap h1 small' ) ).toHaveText( `v${ header }` );
	} );
} );
