/**
 * Hardware virtuale aggiunto dall'interfaccia, come indicano gli esempi
 * (">> Add ... in Virtual HW"): i componenti si collegano davvero al bus
 * I2C, SPI o 1-Wire e il programma li legge.
 */
const { test, expect } = require( '@playwright/test' );
const { openSimulator, button, assemble, loadExample, portPins } = require( './helpers' );

/** Aggiunge un componente dal menu Virtual HW, con i campi del dialogo indicati. */
async function addComponent( page, type, fields = {} ) {
	await page.locator( '#vhw-config-select' ).selectOption( type );
	const dialog = page.locator( '.pic-vhw-dialog' );
	if ( await dialog.count() ) {
		for ( const [ key, value ] of Object.entries( fields ) ) {
			const input = dialog.locator( `[data-field="${ key }"]` );
			if ( ( await input.evaluate( ( el ) => el.tagName ) ) === 'SELECT' ) await input.selectOption( value );
			else await input.fill( value );
		}
		await dialog.getByRole( 'button', { name: 'Add' } ).click();
	}
	await expect( page.locator( '.pic-vhw-component' ).last() ).toBeVisible();
}

test.describe( 'hardware virtuale', () => {
	test( 'LM75 (I2C): la temperatura del componente arriva su PORTB', async ( { page } ) => {
		// Regressione: la MSSP non creava i bus e il componente non si collegava.
		const errors = await openSimulator( page );
		await loadExample( page, 'LM75 Read Temp' );
		await addComponent( page, 'lm75', { temp: '31' } );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect.poll( () => portPins( page, 'B' ) ).toBe( 31 );
		await button( page, 'stop' ).click();
		expect( errors ).toEqual( [] );
	} );

	test( '74HC595 (SPI): le uscite del registro seguono lo scorrimento', async ( { page } ) => {
		// Regressione: nessun device SPI veniva selezionato, il latch non scattava.
		await openSimulator( page );
		await loadExample( page, '74HC595 Shift Register' );
		await addComponent( page, '74hc595', { csPort: 'A', csPin: '0' } );
		await assemble( page );
		await page.locator( '#run-speed' ).selectOption( 'max' );
		await button( page, 'run' ).click();

		const latch = () => page.evaluate( () => window.picSim.simulator.cpu.getPeripheral( 'MSSP' ).spiBus.devices[ 0 ].outputLatch );
		const seen = new Set();
		await expect.poll( async () => {
			seen.add( await latch() );
			return seen.size;
		}, { timeout: 10000 } ).toBeGreaterThan( 4 );
		await button( page, 'stop' ).click();
		for ( const v of seen ) expect( [ 0, 1, 2, 4, 8, 16, 32, 64, 128 ] ).toContain( v );
	} );

	test( 'DS18B20 (1-Wire): la temperatura intera arriva su PORTB', async ( { page } ) => {
		// Regressione: il bus spostava i bit letti di una posizione.
		await openSimulator( page );
		await loadExample( page, 'DS18B20 Read Temp' );
		await addComponent( page, 'ds18b20', { port: 'A', pin: '0', temp: '23' } );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect.poll( () => portPins( page, 'B' ), { timeout: 5000 } ).toBe( 23 );
		await button( page, 'stop' ).click();
	} );

	test( 'LCD 8 bit: il testo compare anche in tempo reale', async ( { page } ) => {
		// Regressione: i pin si leggevano a ogni aggiornamento dello schermo
		// e a velocita' reale si perdevano gli impulsi di EN.
		await openSimulator( page );
		await loadExample( page, 'LCD Hello World (8-bit)' );
		await addComponent( page, 'lcd-8bit' );
		await assemble( page );
		await button( page, 'run' ).click();
		const lcd = page.locator( '.pic-vhw-component' ).last();
		await expect( lcd ).toContainText( 'Hello World!', { timeout: 10000 } );
		await expect( lcd ).toContainText( 'PIC16F877A' );
		await button( page, 'stop' ).click();
	} );

	test( 'cambiando device i componenti si ricollegano alla nuova CPU', async ( { page } ) => {
		await openSimulator( page );
		await page.locator( '#device-select' ).selectOption( 'PIC16F877A' );
		await addComponent( page, 'lm75', { temp: '27' } );
		await loadExample( page, 'LM75 Read Temp' ); // stesso device: nessun cambio
		await page.locator( '#device-select' ).selectOption( 'PIC16F876A' );
		await page.locator( '#device-select' ).selectOption( 'PIC16F877A' );
		await expect( page.locator( '.pic-vhw-component' ) ).toHaveCount( 1 );
		await assemble( page );
		await button( page, 'run' ).click();
		await expect.poll( () => portPins( page, 'B' ) ).toBe( 27 );
		await button( page, 'stop' ).click();
	} );

	test( 'LCD I2C: il testo dell\'esempio compare sul display', async ( { page } ) => {
		await openSimulator( page );
		await loadExample( page, 'LCD I²C (PCF8574)' );
		await addComponent( page, 'lcd-i2c' );
		await assemble( page );
		await page.locator( '#run-speed' ).selectOption( 'max' );
		await button( page, 'run' ).click();
		await expect( page.locator( '.pic-vhw-component' ).last() ).toContainText( 'I2C LCD!', { timeout: 10000 } );
		await button( page, 'stop' ).click();
	} );
} );
