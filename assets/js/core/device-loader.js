/**
 * DeviceLoader - Carica e gestisce le specifiche dei dispositivi PIC16
 * WebPicSimulator by Prof. D.Bertolino
 */

class DeviceLoader {
    constructor() {
        this.family = null;          // Dati famiglia (istruzioni, simboli comuni)
        this.devices = {};           // Cache dispositivi caricati
        this.currentDevice = null;   // Dispositivo corrente
        this.currentDeviceId = null;
        this.basePath = '';
        this.loaded = false;
    }

    /**
     * Inizializza il loader caricando i dati famiglia
     * @param {string} basePath - Percorso base (es: plugin_url)
     * @returns {Promise<boolean>}
     */
    async init(basePath = '') {
        this.basePath = basePath.endsWith('/') ? basePath : basePath + '/';
        
        try {
            await this.loadFamily();
            this.loaded = true;
            console.log('DeviceLoader: Family data loaded');
            return true;
        } catch (error) {
            console.error('DeviceLoader: Failed to initialize', error);
            return false;
        }
    }

    /**
     * Carica i dati comuni della famiglia PIC16
     */
    async loadFamily() {
        const url = this.basePath + 'assets/data/pic16-family.json';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load family data: ${response.status}`);
        }
        
        this.family = await response.json();
        return this.family;
    }

    /**
     * Carica le specifiche di un dispositivo
     * @param {string} deviceId - ID dispositivo (es: "PIC16F84A")
     * @returns {Promise<Object>}
     */
    async loadDevice(deviceId) {
        // Normalizza ID (lowercase per filename)
        const filename = deviceId.toLowerCase();
        
        // Controlla cache
        if (this.devices[deviceId]) {
            return this.devices[deviceId];
        }
        
        const url = this.basePath + `assets/data/devices/${filename}.json`;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Device not found: ${deviceId}`);
            }
            
            const deviceData = await response.json();
            this.devices[deviceId] = deviceData;
            
            console.log(`DeviceLoader: Loaded ${deviceId}`);
            return deviceData;
            
        } catch (error) {
            console.error(`DeviceLoader: Failed to load ${deviceId}`, error);
            throw error;
        }
    }

    /**
     * Seleziona e carica un dispositivo come corrente
     * @param {string} deviceId
     * @returns {Promise<Object>}
     */
    async selectDevice(deviceId) {
        const device = await this.loadDevice(deviceId);
        this.currentDevice = device;
        this.currentDeviceId = deviceId;
        return device;
    }

    /**
     * Ottiene lista dispositivi disponibili
     * @returns {Array<{id: string, name: string, pins: number, program: string, ram: string}>}
     */
    getAvailableDevices() {
        return [
            // 18-pin basic
            { id: 'PIC16F83',   name: 'PIC16F83',   pins: 18, program: '512',  ram: '36B' },
            { id: 'PIC16F84',   name: 'PIC16F84',   pins: 18, program: '1K',   ram: '68B' },
            { id: 'PIC16F84A',  name: 'PIC16F84A',  pins: 18, program: '1K',   ram: '68B' },
            // 18-pin with USART/CCP
            { id: 'PIC16F627A', name: 'PIC16F627A', pins: 18, program: '1K',   ram: '224B' },
            { id: 'PIC16F628A', name: 'PIC16F628A', pins: 18, program: '2K',   ram: '224B' },
            { id: 'PIC16F648A', name: 'PIC16F648A', pins: 18, program: '4K',   ram: '256B' },
            // 18-pin with ADC/MSSP
            { id: 'PIC16F818',  name: 'PIC16F818',  pins: 18, program: '1K',   ram: '128B' },
            { id: 'PIC16F819',  name: 'PIC16F819',  pins: 18, program: '2K',   ram: '256B' },
            // 18-pin enhanced
            { id: 'PIC16F1847', name: 'PIC16F1847', pins: 18, program: '8K',   ram: '1KB' },
            // 20-pin
            { id: 'PIC16F690',  name: 'PIC16F690',  pins: 20, program: '4K',   ram: '256B' },
            // 28-pin
            { id: 'PIC16F870',  name: 'PIC16F870',  pins: 28, program: '2K',   ram: '128B' },
            { id: 'PIC16F872',  name: 'PIC16F872',  pins: 28, program: '2K',   ram: '128B' },
            { id: 'PIC16F873A', name: 'PIC16F873A', pins: 28, program: '4K',   ram: '192B' },
            { id: 'PIC16F876A', name: 'PIC16F876A', pins: 28, program: '8K',   ram: '368B' },
            { id: 'PIC16F882',  name: 'PIC16F882',  pins: 28, program: '2K',   ram: '128B' },
            { id: 'PIC16F883',  name: 'PIC16F883',  pins: 28, program: '4K',   ram: '256B' },
            { id: 'PIC16F886',  name: 'PIC16F886',  pins: 28, program: '8K',   ram: '368B' },
            // 40-pin
            { id: 'PIC16F871',  name: 'PIC16F871',  pins: 40, program: '2K',   ram: '128B' },
            { id: 'PIC16F874A', name: 'PIC16F874A', pins: 40, program: '4K',   ram: '192B' },
            { id: 'PIC16F877A', name: 'PIC16F877A', pins: 40, program: '8K',   ram: '368B' },
            { id: 'PIC16F884',  name: 'PIC16F884',  pins: 40, program: '4K',   ram: '256B' },
            { id: 'PIC16F887',  name: 'PIC16F887',  pins: 40, program: '8K',   ram: '368B' }
        ];
    }

    // ============================================================
    // FAMILY DATA ACCESSORS
    // ============================================================

    /**
     * Ottiene il set di istruzioni
     */
    getInstructionSet() {
        return this.family?.instructionSet || null;
    }

    /**
     * Ottiene tutte le istruzioni in un array piatto
     */
    getAllInstructions() {
        const instrSet = this.getInstructionSet();
        if (!instrSet) return [];
        
        return [
            ...(instrSet.byteOriented || []),
            ...(instrSet.bitOriented || []),
            ...(instrSet.literal || []),
            ...(instrSet.control || [])
        ];
    }

    /**
     * Cerca un'istruzione per mnemonic
     * @param {string} mnemonic
     * @returns {Object|undefined}
     */
    getInstruction(mnemonic) {
        const upper = mnemonic.toUpperCase();
        return this.getAllInstructions().find(i => i.mnemonic === upper);
    }

    /**
     * Ottiene i bit del registro STATUS
     */
    getStatusBits() {
        return this.family?.statusBits || {};
    }

    /**
     * Ottiene i bit del registro INTCON
     */
    getIntconBits() {
        return this.family?.intconBits || {};
    }

    /**
     * Ottiene i bit del registro OPTION
     */
    getOptionBits() {
        return this.family?.optionBits || {};
    }

    /**
     * Ottiene le direttive assembler supportate
     */
    getDirectives() {
        return this.family?.directives || [];
    }

    /**
     * Ottiene i registri comuni a tutti i dispositivi
     */
    getCommonRegisters() {
        return this.family?.commonRegisters || {};
    }

    /**
     * Ottiene vettore reset
     */
    getResetVector() {
        return parseInt(this.family?.resetVector, 16) || 0x0000;
    }

    /**
     * Ottiene vettore interrupt
     */
    getInterruptVector() {
        return parseInt(this.family?.interruptVector, 16) || 0x0004;
    }

    // ============================================================
    // DEVICE DATA ACCESSORS
    // ============================================================

    /**
     * Ottiene il dispositivo corrente
     */
    getCurrentDevice() {
        return this.currentDevice;
    }

    /**
     * Ottiene ID dispositivo corrente
     */
    getCurrentDeviceId() {
        return this.currentDeviceId;
    }

    /**
     * Ottiene configurazione memoria
     */
    getMemoryConfig(device = null) {
        const dev = device || this.currentDevice;
        return dev?.memory || null;
    }

    /**
     * Ottiene dimensione memoria programma
     */
    getProgramSize(device = null) {
        return this.getMemoryConfig(device)?.program?.size || 1024;
    }

    /**
     * Ottiene numero di bank RAM
     */
    getRAMBanks(device = null) {
        return this.getMemoryConfig(device)?.ram?.banks || 2;
    }

    /**
     * Ottiene dimensione totale RAM
     */
    getRAMSize(device = null) {
        return this.getMemoryConfig(device)?.ram?.total || 68;
    }

    /**
     * Ottiene configurazione GPR (General Purpose Registers)
     */
    getGPRConfig(device = null) {
        return this.getMemoryConfig(device)?.ram?.gpr || {};
    }

    /**
     * Ottiene dimensione EEPROM
     */
    getEEPROMSize(device = null) {
        return this.getMemoryConfig(device)?.eeprom?.size || 64;
    }

    /**
     * Ottiene configurazione porte I/O
     */
    getPorts(device = null) {
        const dev = device || this.currentDevice;
        return dev?.ports || {};
    }

    /**
     * Ottiene nomi porte disponibili
     */
    getPortNames(device = null) {
        return Object.keys(this.getPorts(device));
    }

    /**
     * Ottiene configurazione di una porta specifica
     */
    getPort(portName, device = null) {
        return this.getPorts(device)[portName] || null;
    }

    /**
     * Ottiene larghezza porta (numero pin)
     */
    getPortWidth(portName, device = null) {
        const port = this.getPort(portName, device);
        return port?.width || 8;
    }

    /**
     * Ottiene periferiche disponibili
     */
    getPeripherals(device = null) {
        const dev = device || this.currentDevice;
        return dev?.peripherals || {};
    }

    /**
     * Verifica se il dispositivo ha una periferica
     * @param {string} name - Nome periferica (TMR0, TMR1, ADC, USART, etc.)
     */
    hasPeripheral(name, device = null) {
        return name in this.getPeripherals(device);
    }

    /**
     * Ottiene configurazione periferica specifica
     */
    getPeripheral(name, device = null) {
        return this.getPeripherals(device)[name] || null;
    }

    /**
     * Ottiene configurazione interrupt
     */
    getInterruptConfig(device = null) {
        const dev = device || this.currentDevice;
        return dev?.interrupts || null;
    }

    /**
     * Ottiene tutti i registri SFR
     * @returns {Object} - Mappa indirizzo -> {name, reset, bank, address}
     */
    getSFRs(device = null) {
        const dev = device || this.currentDevice;
        const sfr = dev?.sfr || {};
        
        // Unisci tutti i bank in una mappa piatta
        const allSFR = {};
        for (const [bank, regs] of Object.entries(sfr)) {
            for (const [addr, info] of Object.entries(regs)) {
                const numAddr = parseInt(addr, 16);
                allSFR[numAddr] = { ...info, bank, address: numAddr };
            }
        }
        return allSFR;
    }

    /**
     * Ottiene SFR per nome
     * @param {string} name - Nome registro (es: STATUS, TMR0)
     */
    getSFRByName(name, device = null) {
        const sfrs = this.getSFRs(device);
        return Object.values(sfrs).find(sfr => sfr.name === name) || null;
    }

    /**
     * Ottiene indirizzo di un SFR per nome
     */
    getSFRAddress(name, device = null) {
        const sfr = this.getSFRByName(name, device);
        return sfr ? sfr.address : null;
    }

    /**
     * Ottiene valore reset di un SFR
     */
    getSFRResetValue(name, device = null) {
        const sfr = this.getSFRByName(name, device);
        if (!sfr || !sfr.reset) return 0;
        return parseInt(sfr.reset, 16);
    }

    // ============================================================
    // SYMBOL MAP BUILDER (per Assembler)
    // ============================================================

    /**
     * Costruisce la mappa simboli completa per l'assembler
     * @returns {Object} - {PORTA: 5, STATUS: 3, C: 0, ...}
     */
    buildSymbolMap(device = null) {
        const symbols = {};
        const dev = device || this.currentDevice;
        
        // 1. Registri comuni dalla famiglia
        const commonRegs = this.getCommonRegisters();
        for (const [name, info] of Object.entries(commonRegs)) {
            symbols[name] = parseInt(info.address, 16);
        }
        
        // 2. Bit STATUS
        for (const [name, info] of Object.entries(this.getStatusBits())) {
            symbols[name] = info.bit;
        }
        
        // 3. Bit INTCON
        for (const [name, info] of Object.entries(this.getIntconBits())) {
            symbols[name] = info.bit;
        }
        
        // 4. Bit OPTION
        for (const [name, info] of Object.entries(this.getOptionBits())) {
            symbols[name] = info.bit;
        }
        
        // 5. SFR del dispositivo specifico
        if (dev) {
            const sfrs = this.getSFRs(dev);
            for (const sfr of Object.values(sfrs)) {
                if (!sfr.mirror) {  // Non duplicare i mirror
                    symbols[sfr.name] = sfr.address;
                }
            }
            
            // 6. Registri TRIS dalle porte
            const ports = this.getPorts(dev);
            for (const [portName, portConfig] of Object.entries(ports)) {
                if (portConfig.dataReg) {
                    symbols[portName] = parseInt(portConfig.dataReg, 16);
                }
                if (portConfig.trisReg) {
                    const trisName = 'TRIS' + portName.slice(-1);  // TRISA, TRISB, etc.
                    symbols[trisName] = parseInt(portConfig.trisReg, 16);
                }
            }
        }
        
        // 7. Costanti comuni
        symbols['W'] = 0;
        symbols['F'] = 1;
        
        return symbols;
    }

    /**
     * Genera definizioni EQU per inclusione in sorgente ASM
     * @returns {string} - Contenuto file .inc
     */
    generateIncludeFile(device = null) {
        const dev = device || this.currentDevice;
        const lines = [];
        const deviceName = dev?.device || 'PIC16';
        
        lines.push(`;=====================================================`);
        lines.push(`; ${deviceName} Register Definitions`);
        lines.push(`; Generated by WebPicSimulator`);
        lines.push(`; Prof. D.Bertolino`);
        lines.push(`;=====================================================`);
        lines.push('');
        
        // SFR
        lines.push('; === Special Function Registers ===');
        const sfrs = this.getSFRs(dev);
        const sortedSFRs = Object.values(sfrs)
            .filter(s => !s.mirror)
            .sort((a, b) => a.address - b.address);
        
        for (const sfr of sortedSFRs) {
            const addr = '0x' + sfr.address.toString(16).toUpperCase().padStart(2, '0');
            lines.push(`${sfr.name.padEnd(12)} EQU ${addr}`);
        }
        
        lines.push('');
        lines.push('; === STATUS Bits ===');
        for (const [name, info] of Object.entries(this.getStatusBits())) {
            lines.push(`${name.padEnd(12)} EQU ${info.bit}`);
        }
        
        lines.push('');
        lines.push('; === INTCON Bits ===');
        for (const [name, info] of Object.entries(this.getIntconBits())) {
            lines.push(`${name.padEnd(12)} EQU ${info.bit}`);
        }
        
        lines.push('');
        lines.push('; === OPTION_REG Bits ===');
        for (const [name, info] of Object.entries(this.getOptionBits())) {
            lines.push(`${name.padEnd(12)} EQU ${info.bit}`);
        }
        
        lines.push('');
        lines.push('; === General ===');
        lines.push('W            EQU 0');
        lines.push('F            EQU 1');
        
        return lines.join('\n');
    }

    // ============================================================
    // UTILITY
    // ============================================================

    /**
     * Verifica se due dispositivi sono compatibili (stesse istruzioni)
     */
    areCompatible(deviceId1, deviceId2) {
        // Tutti i PIC16 mid-range sono compatibili a livello istruzioni
        return deviceId1.startsWith('PIC16') && deviceId2.startsWith('PIC16');
    }

    /**
     * Ottiene un sommario del dispositivo
     */
    getDeviceSummary(device = null) {
        const dev = device || this.currentDevice;
        if (!dev) return null;
        
        return {
            name: dev.device,
            description: dev.description,
            programSize: this.getProgramSize(dev),
            ramSize: this.getRAMSize(dev),
            eepromSize: this.getEEPROMSize(dev),
            ports: this.getPortNames(dev),
            peripherals: Object.keys(this.getPeripherals(dev)),
            package: dev.package
        };
    }

    /**
     * Debug: stampa info dispositivo corrente
     */
    debugInfo() {
        if (!this.currentDevice) {
            console.log('DeviceLoader: No device selected');
            return;
        }
        
        const summary = this.getDeviceSummary();
        console.log('=== Device Info ===');
        console.log(`Name: ${summary.name}`);
        console.log(`Program: ${summary.programSize} words`);
        console.log(`RAM: ${summary.ramSize} bytes`);
        console.log(`EEPROM: ${summary.eepromSize} bytes`);
        console.log(`Ports: ${summary.ports.join(', ')}`);
        console.log(`Peripherals: ${summary.peripherals.join(', ')}`);
    }
}

// Export per uso globale
if (typeof window !== 'undefined') {
    window.DeviceLoader = DeviceLoader;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeviceLoader;
}
