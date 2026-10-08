/**
 * PIC16 Device Factory
 * Legge la specifica JSON di un device e istanzia PIC16Core con le periferiche corrette.
 * 
 * Uso:
 *   var factory = new PIC16Factory(deviceLoader);
 *   var cpu = factory.create('PIC16F84A');
 *   // cpu ha gia' GPIO, TMR0, EEPROM registrati
 *   
 *   // Cambio device:
 *   var newCpu = factory.create('PIC16F877A');
 */

class PIC16Factory {
    /**
     * @param {DeviceLoader} deviceLoader - Loader con database dispositivi caricato
     */
    constructor(deviceLoader) {
        this.deviceLoader = deviceLoader;
    }

    /**
     * Crea un PIC16Core configurato per il device specificato.
     * Registra automaticamente tutte le periferiche supportate.
     * 
     * @param {string} deviceId - Es. 'PIC16F84A', 'PIC16F628A', 'PIC16F877A'
     * @param {object} [deviceData] - JSON device gia' caricato (opzionale, se non passato usa deviceLoader.devices)
     * @returns {{ cpu: PIC16Core, peripheralList: string[], deviceId: string, warnings: string[] }}
     */
    create(deviceId, deviceData) {
        var warnings = [];
        var spec = deviceData || null;
        
        // Prova a ottenere spec dalla cache del deviceLoader
        if (!spec && this.deviceLoader && this.deviceLoader.devices) {
            spec = this.deviceLoader.devices[deviceId] || null;
        }
        
        // Config core dalla spec o default PIC16F84A
        var config;
        if (spec) {
            var banks = this._getFromSpec(spec, 'memory.ram.banks', 2);
            var ramTotal = this._getFromSpec(spec, 'memory.ram.total', 68);
            // RAM deve coprire tutti i bank: 2 bank=256, 4 bank=512
            var ramSize = banks >= 4 ? 512 : 256;
            
            config = {
                programSize: this._getFromSpec(spec, 'memory.program.size', 1024),
                ramSize: ramSize,
                eepromSize: this._getFromSpec(spec, 'memory.eeprom.size', 64),
                stackDepth: 8,
                banks: banks
            };
        } else {
            config = { programSize: 1024, ramSize: 256, eepromSize: 64, stackDepth: 8, banks: 2 };
            warnings.push('Device spec not found, using PIC16F84A defaults');
        }
        
        var cpu = new PIC16Core(config);
        var peripheralList = [];

        // === GPIO ===
        if (spec && spec.ports) {
            this._createGPIO(cpu, spec, peripheralList, warnings);
        } else {
            // Default PIC16F84A GPIO
            this._createDefaultGPIO(cpu, peripheralList);
        }

        // === TMR0 (tutti i PIC16 mid-range lo hanno) ===
        if (typeof PIC16TMR0 !== 'undefined') {
            cpu.addPeripheral(new PIC16TMR0(cpu));
            peripheralList.push('TMR0');
        }

        // === EEPROM ===
        if (typeof PIC16EEPROM !== 'undefined') {
            var eepSize = config.eepromSize;
            cpu.addPeripheral(new PIC16EEPROM(cpu, { size: eepSize }));
            peripheralList.push('EEPROM(' + eepSize + ')');
        }

        // === Periferiche avanzate (quando i moduli saranno disponibili) ===
        if (spec && spec.peripherals) {
            this._createAdvancedPeripherals(cpu, spec, peripheralList, warnings);
        }

        return {
            cpu: cpu,
            peripheralList: peripheralList,
            deviceId: deviceId,
            warnings: warnings
        };
    }

    // ================================================================
    //  GPIO CREATION
    // ================================================================

    _createGPIO(cpu, spec, peripheralList, warnings) {
        if (typeof PIC16GPIO === 'undefined') {
            warnings.push('PIC16GPIO not loaded');
            return;
        }

        for (var portName in spec.ports) {
            if (!spec.ports.hasOwnProperty(portName)) continue;
            
            var portSpec = spec.ports[portName];
            var letter = portName.replace('PORT', '');
            var dataAddr = parseInt(portSpec.dataReg, 16);
            var trisAddr = parseInt(portSpec.trisReg, 16);
            
            // Controlla conflitti indirizzi con EEPROM (877A: PORTD=0x08, PORTE=0x09)
            // Per ora supportiamo solo bank 0/1, quindi PORTD/E del 877A avranno conflitto
            // con EEDATA/EEADR. Li creiamo comunque ma segnaliamo il warning.
            var conflict = false;
            if (dataAddr === 0x08 || dataAddr === 0x09) {
                // Conflitto potenziale con EEDATA/EEADR - ok se il device ha 4 bank
                // Per ora segnaliamo
                if (spec.memory && spec.memory.ram && spec.memory.ram.banks > 2) {
                    warnings.push(portName + ' at ' + portSpec.dataReg + ' (4-bank device, limited support)');
                }
            }
            
            // Cerca funzioni speciali sui pin
            var hasT0CKI = false;
            var t0ckiPin = 4;
            var intPin = -1;
            var iocPins = [];
            
            if (portSpec.pins) {
                for (var i = 0; i < portSpec.pins.length; i++) {
                    var pin = portSpec.pins[i];
                    if (pin.altFunc) {
                        if (pin.altFunc.indexOf('T0CKI') !== -1) {
                            hasT0CKI = true;
                            t0ckiPin = pin.pin;
                        }
                        if (pin.altFunc.indexOf('INT') !== -1) {
                            intPin = pin.pin;
                        }
                    }
                    if (pin.ioc) {
                        iocPins.push(pin.pin);
                    }
                }
            }
            
            // IOC da features
            if (portSpec.features && portSpec.features.interruptOnChange) {
                iocPins = portSpec.features.interruptOnChange;
            }
            
            var gpioConfig = {
                width: portSpec.width,
                dataAddr: dataAddr,
                trisAddr: trisAddr,
                bitmask: parseInt(portSpec.bitmask, 16),
                hasT0CKI: hasT0CKI,
                t0ckiPin: t0ckiPin,
                intPin: intPin,
                iocPins: iocPins
            };
            
            cpu.addPeripheral(new PIC16GPIO(letter, cpu, gpioConfig));
            peripheralList.push('GPIO_' + letter + '(' + portSpec.width + ')');
        }
    }

    _createDefaultGPIO(cpu, peripheralList) {
        if (typeof PIC16GPIO === 'undefined') return;
        
        cpu.addPeripheral(new PIC16GPIO('A', cpu, {
            width: 5, dataAddr: 0x05, trisAddr: 0x85, bitmask: 0x1F,
            hasT0CKI: true, t0ckiPin: 4
        }));
        cpu.addPeripheral(new PIC16GPIO('B', cpu, {
            width: 8, dataAddr: 0x06, trisAddr: 0x86, bitmask: 0xFF,
            intPin: 0, iocPins: [4, 5, 6, 7]
        }));
        peripheralList.push('GPIO_A(5)', 'GPIO_B(8)');
    }

    // ================================================================
    //  ADVANCED PERIPHERALS (stub per sviluppo futuro)
    // ================================================================

    _createAdvancedPeripherals(cpu, spec, peripheralList, warnings) {
        var periphSpec = spec.peripherals;
        
        // TMR1
        if (periphSpec.TMR1 && typeof PIC16TMR1 !== 'undefined') {
            cpu.addPeripheral(new PIC16TMR1(cpu, periphSpec.TMR1));
            peripheralList.push('TMR1');
        } else if (periphSpec.TMR1) {
            warnings.push('TMR1: module not loaded');
        }

        // TMR2
        if (periphSpec.TMR2 && typeof PIC16TMR2 !== 'undefined') {
            cpu.addPeripheral(new PIC16TMR2(cpu, periphSpec.TMR2));
            peripheralList.push('TMR2');
        } else if (periphSpec.TMR2) {
            warnings.push('TMR2: module not loaded');
        }

        // CCP1
        if (periphSpec.CCP1 && typeof PIC16CCP !== 'undefined') {
            cpu.addPeripheral(new PIC16CCP('CCP1', cpu, periphSpec.CCP1));
            peripheralList.push('CCP1');
        } else if (periphSpec.CCP1) {
            warnings.push('CCP1: module not loaded');
        }

        // CCP2
        if (periphSpec.CCP2 && typeof PIC16CCP !== 'undefined') {
            cpu.addPeripheral(new PIC16CCP('CCP2', cpu, periphSpec.CCP2));
            peripheralList.push('CCP2');
        } else if (periphSpec.CCP2) {
            warnings.push('CCP2: module not loaded');
        }

        // USART
        if (periphSpec.USART && typeof PIC16USART !== 'undefined') {
            cpu.addPeripheral(new PIC16USART(cpu, periphSpec.USART));
            peripheralList.push('USART');
        } else if (periphSpec.USART) {
            warnings.push('USART: module not loaded');
        }

        // ADC
        if (periphSpec.ADC && typeof PIC16ADC !== 'undefined') {
            cpu.addPeripheral(new PIC16ADC(cpu, periphSpec.ADC));
            peripheralList.push('ADC');
        } else if (periphSpec.ADC) {
            warnings.push('ADC: module not loaded');
        }

        // MSSP (SPI/I2C)
        if (periphSpec.MSSP && typeof PIC16MSSP !== 'undefined') {
            cpu.addPeripheral(new PIC16MSSP(cpu, periphSpec.MSSP));
            peripheralList.push('MSSP');
        } else if (periphSpec.MSSP) {
            warnings.push('MSSP: module not loaded');
        }

        // COMPARATOR
        if (periphSpec.COMPARATOR && typeof PIC16Comparator !== 'undefined') {
            cpu.addPeripheral(new PIC16Comparator(cpu, periphSpec.COMPARATOR));
            peripheralList.push('COMPARATOR');
        } else if (periphSpec.COMPARATOR) {
            warnings.push('COMPARATOR: module not loaded');
        }
    }

    // ================================================================
    //  UTILITY
    // ================================================================

    /**
     * Accesso sicuro a path nested in un oggetto.
     */
    _getFromSpec(obj, path, defaultVal) {
        var parts = path.split('.');
        var current = obj;
        for (var i = 0; i < parts.length; i++) {
            if (current === null || current === undefined) return defaultVal;
            current = current[parts[i]];
        }
        return current !== undefined && current !== null ? current : defaultVal;
    }

    /**
     * Lista dispositivi disponibili.
     * @returns {string[]}
     */
    getAvailableDevices() {
        if (!this.deviceLoader) return ['PIC16F84A'];
        var list = this.deviceLoader.getAvailableDevices();
        return list.map(function(d) { return d.id; });
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PIC16Factory;
}
