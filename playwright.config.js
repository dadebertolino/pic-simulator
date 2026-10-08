// @ts-check
const { defineConfig, devices } = require( '@playwright/test' );

/**
 * Config Playwright per gli E2E di WebPicSimulator.
 *
 * baseURL punta all'ambiente "development" di wp-env (porta 8888). In locale
 * senza Docker va bene anche WordPress Playground (npm run env:playground),
 * sulla stessa porta.
 */
module.exports = defineConfig( {
	testDir: './tests/e2e',
	fullyParallel: false, // le pagine di prova sono condivise: test sequenziali.
	forbidOnly: !! process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	timeout: 60_000,
	reporter: process.env.CI ? [ [ 'list' ], [ 'html', { open: 'never' } ] ] : 'list',

	use: {
		baseURL: process.env.WP_BASE_URL || 'http://localhost:8888',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},

	projects: [
		// Login admin e pagine di prova (sessione in tests/e2e/.auth/), una volta prima degli spec.
		{
			name: 'setup',
			testMatch: /.*\.setup\.js/,
		},
		{
			name: 'chromium',
			use: { ...devices[ 'Desktop Chrome' ] },
			dependencies: [ 'setup' ],
			testIgnore: /.*\.mobile\.spec\.js/,
		},
		// Gli studenti aprono la pagina anche dal telefono.
		{
			name: 'mobile',
			use: { ...devices[ 'Pixel 7' ] },
			dependencies: [ 'setup' ],
			testMatch: /.*\.mobile\.spec\.js/,
		},
	],
} );
