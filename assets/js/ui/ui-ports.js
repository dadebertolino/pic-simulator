/**
 * UI Ports Module
 * Visualizzazione GPIO: LED, switch, direzione pin, funzioni alternative.
 */
class UIPorts {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        // Mappa pin info dal device JSON: { 'A0': { name:'RA0', altFunc:['AN0'] }, ... }
        this.pinInfo = {};
    }

    init() {
        // L'init base crea le porte di default (PIC16F84A)
        // rebuildPortsUI viene chiamato dal manager con i dati del device
    }

    /**
     * Ricostruisce tutta la UI porte dal JSON device.
     * @param {object} deviceData - JSON device (o null per fallback)
     */
    rebuildPortsUI(deviceData) {
        var container = document.getElementById('ports-container');
        if (!container) return;
        container.innerHTML = '';
        this.pinInfo = {};

        var ports = this._extractPorts(deviceData);

        for (var j = 0; j < ports.length; j++) {
            var port = ports[j];

            var section = document.createElement('div');
            section.className = 'pic-port-section';

            var header = document.createElement('div');
            header.className = 'pic-port-label';
            header.textContent = port.name;
            // Badge con numero pin
            var badge = document.createElement('span');
            badge.className = 'pic-port-badge';
            badge.textContent = port.width + '-bit';
            header.appendChild(badge);
            section.appendChild(header);

            var pinsDiv = document.createElement('div');
            pinsDiv.className = 'pic-port-pins';
            pinsDiv.id = port.name.toLowerCase() + '-pins';
            section.appendChild(pinsDiv);

            container.appendChild(section);

            // Crea i pin con info dal JSON
            for (var i = 0; i < port.width; i++) {
                var pinData = (port.pins && port.pins[i]) ? port.pins[i] : null;
                pinsDiv.appendChild(this._createPin(port.letter, i, pinData));
            }
        }
    }

    /**
     * Estrae la lista porte dal deviceData o dalle periferiche registrate.
     */
    _extractPorts(deviceData) {
        var ports = [];
        if (deviceData && deviceData.ports) {
            for (var portName in deviceData.ports) {
                if (!deviceData.ports.hasOwnProperty(portName)) continue;
                var p = deviceData.ports[portName];
                ports.push({
                    name: portName,
                    letter: portName.replace('PORT', ''),
                    width: p.width,
                    pins: p.pins || []
                });
            }
        } else {
            // Fallback: periferiche GPIO registrate
            var gpioNames = this.cpu.peripherals.list().filter(function(n) {
                return n.indexOf('GPIO_') === 0;
            });
            for (var i = 0; i < gpioNames.length; i++) {
                var gpio = this.cpu.peripherals.get(gpioNames[i]);
                ports.push({
                    name: 'PORT' + gpio.portLetter,
                    letter: gpio.portLetter,
                    width: gpio.width,
                    pins: []
                });
            }
        }
        return ports;
    }

    /**
     * Crea un singolo pin element con LED, label, tooltip, input switch.
     * @param {string} port - Lettera porta
     * @param {number} index - Numero pin
     * @param {object|null} pinData - Dati pin dal JSON: { pin, name, altFunc, ioc }
     */
    _createPin(port, index, pinData) {
        var self = this;

        // Nome base del pin
        var pinName = pinData && pinData.name ? pinData.name : ('R' + port + index);
        var altFuncs = (pinData && pinData.altFunc) ? pinData.altFunc : [];
        var hasIOC = pinData && pinData.ioc;

        // Salva info per uso futuro
        var key = port + index;
        this.pinInfo[key] = { name: pinName, altFunc: altFuncs, ioc: hasIOC };

        // Tooltip dettagliato
        var tooltip = pinName;
        if (altFuncs.length > 0) {
            tooltip += ' / ' + altFuncs.join(' / ');
        }
        if (hasIOC) {
            tooltip += ' [IOC]';
        }

        // Container
        var container = document.createElement('div');
        container.className = 'pin-container';
        container.id = 'pin-' + port + index;
        container.title = tooltip;

        // LED
        var led = document.createElement('div');
        led.className = 'led';
        container.appendChild(led);

        // Label
        var label = document.createElement('span');
        label.className = 'pin-label';
        label.textContent = pinName;
        container.appendChild(label);

        // Alt functions badge (se presenti)
        if (altFuncs.length > 0) {
            var altBadge = document.createElement('span');
            altBadge.className = 'pin-alt';
            altBadge.textContent = altFuncs[0]; // Mostra la prima funzione alternativa
            container.appendChild(altBadge);
        }

        // Input checkbox
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'pin-input';
        input.title = 'Toggle external input';
        input.addEventListener('change', function() {
            self.simulator.setPin(port, index, input.checked);
        });
        container.appendChild(input);

        // Direction indicator
        var direction = document.createElement('span');
        direction.className = 'pin-direction';
        direction.textContent = 'I';
        container.appendChild(direction);

        return container;
    }

    /**
     * Aggiorna la visualizzazione di una porta.
     */
    updatePort(port) {
        var state = this.simulator.getPortState(port);
        if (!state) return;
        var gpio = this.cpu.getPeripheral('GPIO_' + port);
        var count = gpio ? gpio.width : (port === 'A' ? 5 : 8);

        for (var i = 0; i < count; i++) {
            var el = document.getElementById('pin-' + port + i);
            if (!el) continue;

            var led = el.querySelector('.led');
            var direction = el.querySelector('.pin-direction');
            var isOutput = !(state.tris & (1 << i));
            var value = isOutput ?
                (state.data & (1 << i)) :
                (this.cpu.getExternalValue(port) & (1 << i));

            led.classList.toggle('on', value !== 0);
            led.classList.toggle('output', isOutput);
            direction.textContent = isOutput ? 'O' : 'I';
            el.classList.toggle('output-mode', isOutput);
        }
    }

    update() {
        var peripheralNames = this.cpu.peripherals.list();
        for (var i = 0; i < peripheralNames.length; i++) {
            var name = peripheralNames[i];
            if (name.indexOf('GPIO_') === 0) {
                this.updatePort(name.charAt(5));
            }
        }
    }

    setCpu(cpu) { this.cpu = cpu; }
}
