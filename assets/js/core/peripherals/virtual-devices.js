/**
 * Virtual Devices Registry
 * Le classi device sono caricate dai file individuali in devices/.
 * Questo file serve come punto di riferimento per l'elenco completo.
 *
 * I²C Devices:
 *   - Virtual24C02      (devices/i2c-24c02.js)    EEPROM 256B
 *   - VirtualLM75       (devices/i2c-lm75.js)     Temperature
 *   - VirtualPCF8574    (devices/i2c-pcf8574.js)  8-bit I/O
 *   - VirtualMCP23017   (devices/i2c-mcp23017.js) 16-bit I/O
 *   - VirtualDS1307     (devices/i2c-ds1307.js)   RTC
 *   - VirtualBMP280     (devices/i2c-bmp280.js)   Temp+Press
 *   - VirtualSHT21      (devices/i2c-sht21.js)    Temp+Hum
 *
 * SPI Devices:
 *   - Virtual74HC595    (devices/spi-74hc595.js)  Shift Register
 *   - VirtualMCP3008    (devices/spi-mcp3008.js)  10-bit ADC
 *   - VirtualMAX7219    (devices/spi-max7219.js)  LED Driver
 */

// Registry globale (popolato automaticamente dal caricamento dei file)
window.VirtualDeviceRegistry = {
    i2c: {},
    spi: {},

    register: function(type, name, cls) {
        this[type][name] = cls;
    },

    getI2C: function(name) { return this.i2c[name]; },
    getSPI: function(name) { return this.spi[name]; },

    list: function() {
        var all = [];
        for (var k in this.i2c) all.push({ bus: 'I2C', name: k, cls: this.i2c[k] });
        for (var k2 in this.spi) all.push({ bus: 'SPI', name: k2, cls: this.spi[k2] });
        return all;
    }
};
