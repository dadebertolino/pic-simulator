/**
 * UI Virtual Hardware Module
 * Componenti con pin configurabili, LCD multi-size, HD44780 debug.
 */

class UIVirtualHW {
    constructor(ctx) {
        this.cpu = ctx.cpu;
        this.simulator = ctx.simulator;
        this.ui = ctx.ui;
        this.components = [];
        this._compId = 0;
    }

    init() {
        var self = this;
        var select = document.getElementById('vhw-config-select');
        if (select) {
            select.addEventListener('change', function() {
                if (select.value !== 'none') { self._showConfigDialog(select.value); select.selectedIndex = 0; }
            });
        }
        var clearBtn = document.getElementById('vhw-clear');
        if (clearBtn) clearBtn.addEventListener('click', function() { self.clearAll(); });
    }

    // ================================================================
    //  CONFIG DIALOG
    // ================================================================

    _showConfigDialog(type) {
        var defaults = this._getDefaults(type);
        if (!defaults) { this.addComponent(type, {}); return; }

        // Crea dialog overlay
        var overlay = document.createElement('div');
        overlay.className = 'pic-vhw-overlay';
        var dialog = document.createElement('div');
        dialog.className = 'pic-vhw-dialog';
        dialog.innerHTML = '<div class="pic-vhw-dialog-title">' + defaults.title + '</div>';

        var form = document.createElement('div');
        form.className = 'pic-vhw-dialog-form';

        for (var i = 0; i < defaults.fields.length; i++) {
            var f = defaults.fields[i];
            var row = document.createElement('div');
            row.className = 'pic-vhw-dialog-row';
            row.innerHTML = '<label>' + f.label + '</label>';
            var input;
            if (f.type === 'select') {
                input = document.createElement('select');
                for (var j = 0; j < f.options.length; j++) {
                    var opt = document.createElement('option');
                    opt.value = f.options[j].value;
                    opt.textContent = f.options[j].label;
                    if (f.options[j].value === f.default) opt.selected = true;
                    input.appendChild(opt);
                }
            } else {
                input = document.createElement('input');
                input.type = f.type || 'text';
                input.value = f.default || '';
                if (f.min !== undefined) input.min = f.min;
                if (f.max !== undefined) input.max = f.max;
            }
            input.className = 'pic-vhw-dialog-input';
            input.dataset.field = f.key;
            row.appendChild(input);
            form.appendChild(row);
        }
        dialog.appendChild(form);

        var btns = document.createElement('div');
        btns.className = 'pic-vhw-dialog-btns';
        var self = this;
        var okBtn = document.createElement('button');
        okBtn.className = 'pic-btn pic-btn-primary';
        okBtn.textContent = 'Add';
        var warnShown = false;
        okBtn.addEventListener('click', function() {
            var config = {};
            form.querySelectorAll('.pic-vhw-dialog-input').forEach(function(el) {
                config[el.dataset.field] = el.value;
            });
            // Check conflitto indirizzo I²C (solo primo click)
            if (!warnShown) {
                var addrConflict = self._checkAddrConflict(type, config);
                if (addrConflict) {
                    var warn = dialog.querySelector('.pic-vhw-dialog-warn');
                    if (!warn) {
                        warn = document.createElement('div');
                        warn.className = 'pic-vhw-dialog-warn';
                        form.parentNode.insertBefore(warn, btns);
                    }
                    warn.textContent = '\u26A0 ' + addrConflict + ' — click Add again to confirm';
                    warnShown = true;
                    return;
                }
            }
            overlay.remove();
            self.addComponent(type, config);
        });
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'pic-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', function() { overlay.remove(); });
        btns.appendChild(okBtn);
        btns.appendChild(cancelBtn);
        dialog.appendChild(btns);
        overlay.appendChild(dialog);

        var container = document.getElementById('pic-simulator-app');
        if (container) container.appendChild(overlay);
    }

    _getDefaults(type) {
        var portOpts = [
            { value: 'A', label: 'PORTA' }, { value: 'B', label: 'PORTB' },
            { value: 'C', label: 'PORTC' }, { value: 'D', label: 'PORTD' }, { value: 'E', label: 'PORTE' }
        ];
        switch (type) {
            case '7seg-1': return {
                title: '7-Segment (1 digit)', fields: [
                    { key: 'segPort', label: 'Segments port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'segStart', label: 'Start bit (a)', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'dpBit', label: 'DP bit', type: 'number', default: '7', min: 0, max: 7 },
                    { key: 'type', label: 'Type', type: 'select', options: [
                        { value: 'cc', label: 'Common Cathode' }, { value: 'ca', label: 'Common Anode' }
                    ], default: 'cc' }
                ]
            };
            case '7seg-4': return {
                title: '7-Seg 4-Digit (MUX)', fields: [
                    { key: 'segPort', label: 'Segments port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'selPort', label: 'Digit select port', type: 'select', options: portOpts, default: 'A' },
                    { key: 'selStart', label: 'Select start bit', type: 'number', default: '0', min: 0, max: 4 },
                    { key: 'activeLow', label: 'Select logic', type: 'select', options: [
                        { value: 'low', label: 'Active Low' }, { value: 'high', label: 'Active High' }
                    ], default: 'low' }
                ]
            };
            case 'led-bar': return {
                title: 'LED Bar', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'count', label: 'LED count', type: 'number', default: '8', min: 1, max: 8 },
                    { key: 'color', label: 'Color', type: 'select', options: [
                        { value: 'red', label: 'Red' }, { value: 'green', label: 'Green' },
                        { value: 'yellow', label: 'Yellow' }, { value: 'blue', label: 'Blue' }
                    ], default: 'red' }
                ]
            };
            case 'buttons-4': return {
                title: 'Push Buttons', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'A' },
                    { key: 'count', label: 'Button count', type: 'number', default: '4', min: 1, max: 8 },
                    { key: 'startBit', label: 'Start bit', type: 'number', default: '0', min: 0, max: 7 }
                ]
            };
            case 'dip-8': return {
                title: 'DIP Switch', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'count', label: 'Switch count', type: 'number', default: '8', min: 1, max: 8 }
                ]
            };
            case 'mcp23017': return {
                title: 'MCP23017 16-bit I/O (I²C)', fields: [
                    { key: 'addr', label: 'A2:A1:A0', type: 'select', options: [
                        { value: '0', label: '0x20' }, { value: '1', label: '0x21' },
                        { value: '2', label: '0x22' }, { value: '3', label: '0x23' }
                    ], default: '0' }
                ]
            };
            case '74hc595': return {
                title: '74HC595 Shift Register (SPI)', fields: [
                    { key: 'csPort', label: 'CS port', type: 'select', options: portOpts, default: 'A' },
                    { key: 'csPin', label: 'CS pin', type: 'number', default: '0', min: 0, max: 7 }
                ]
            };
            case 'max7219': return {
                title: 'MAX7219 LED Driver (SPI)', fields: []
            };
            case 'mcp3008': return {
                title: 'MCP3008 10-bit ADC (SPI)', fields: [
                    { key: 'channels', label: 'Channels', type: 'number', default: '8', min: 1, max: 8 }
                ]
            };
            case 'lcd-8bit': return {
                title: 'LCD HD44780 (8-bit)', fields: [
                    { key: 'dataPort', label: 'Data port (D0-D7)', type: 'select', options: portOpts, default: 'B' },
                    { key: 'ctrlPort', label: 'Control port', type: 'select', options: portOpts, default: 'D' },
                    { key: 'rsPin', label: 'RS pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'enPin', label: 'EN pin', type: 'number', default: '2', min: 0, max: 7 },
                    { key: 'cols', label: 'Columns', type: 'number', default: '16', min: 8, max: 40 },
                    { key: 'rows', label: 'Rows', type: 'number', default: '2', min: 1, max: 4 }
                ]
            };
            case 'lcd-4bit': return {
                title: 'LCD HD44780 (4-bit)', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'dataBits', label: 'Data bits (high nibble)', type: 'select', options: [
                        { value: '4', label: 'RBx4-7 (bits 4-7)' }, { value: '0', label: 'RBx0-3 (bits 0-3)' }
                    ], default: '4' },
                    { key: 'rsPin', label: 'RS pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'enPin', label: 'EN pin', type: 'number', default: '2', min: 0, max: 7 },
                    { key: 'cols', label: 'Columns', type: 'number', default: '16', min: 8, max: 40 },
                    { key: 'rows', label: 'Rows', type: 'number', default: '2', min: 1, max: 4 }
                ]
            };
            case 'lcd-i2c': return {
                title: 'LCD I²C (PCF8574)', fields: [
                    { key: 'addr', label: 'I²C Address', type: 'select', options: [
                        { value: '0x27', label: '0x27 (default)' }, { value: '0x3F', label: '0x3F (alt)' }
                    ], default: '0x27' },
                    { key: 'cols', label: 'Columns', type: 'number', default: '16', min: 8, max: 40 },
                    { key: 'rows', label: 'Rows', type: 'number', default: '2', min: 1, max: 4 }
                ]
            };
            case 'rtc-ds1307': return {
                title: 'RTC DS1307 (I²C)', fields: [
                    { key: 'tickRate', label: 'Tick rate (CPU cycles/sec)', type: 'number', default: '1000', min: 100, max: 100000 }
                ]
            };
            case 'eeprom-24c02': return {
                title: 'EEPROM 24C02 (I²C)', fields: [
                    { key: 'addr', label: 'A2:A1:A0', type: 'select', options: [
                        { value: '0', label: '0x50' }, { value: '1', label: '0x51' },
                        { value: '2', label: '0x52' }, { value: '3', label: '0x53' }
                    ], default: '0' }
                ]
            };
            case 'bmp280': return {
                title: 'BMP280 Temp/Pressure (I²C)', fields: [
                    { key: 'addr', label: 'SDO pin', type: 'select', options: [
                        { value: 'low', label: '0x76 (SDO=GND)' }, { value: 'high', label: '0x77 (SDO=VCC)' }
                    ], default: 'low' },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -40, max: 85 },
                    { key: 'press', label: 'Initial press (hPa)', type: 'number', default: '1013', min: 300, max: 1100 }
                ]
            };
            case 'lm75': return {
                title: 'LM75 Temperature (I²C)', fields: [
                    { key: 'addr', label: 'A2:A1:A0', type: 'select', options: [
                        { value: '0', label: '0x48' }, { value: '1', label: '0x49' },
                        { value: '2', label: '0x4A' }, { value: '3', label: '0x4B' }
                    ], default: '0' },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -55, max: 125 }
                ]
            };
            case 'sht21': return {
                title: 'SHT21 Temp/Humidity (I²C)', fields: [
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -40, max: 125 },
                    { key: 'hum', label: 'Initial humidity (%)', type: 'number', default: '50', min: 0, max: 100 }
                ]
            };
            case 'ds3231': return {
                title: 'DS3231 RTC (I²C)', fields: [
                    { key: 'tickRate', label: 'Tick rate (CPU cycles/sec)', type: 'number', default: '1000', min: 100, max: 100000 }
                ]
            };
            case 'mcp9808': return {
                title: 'MCP9808 Temperature (I²C)', fields: [
                    { key: 'addr', label: 'A2:A1:A0', type: 'select', options: [
                        { value: '0', label: '0x18' }, { value: '1', label: '0x19' },
                        { value: '2', label: '0x1A' }, { value: '3', label: '0x1B' }
                    ], default: '0' },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -40, max: 125 }
                ]
            };
            case 'tmp102': return {
                title: 'TMP102 Temperature (I²C)', fields: [
                    { key: 'addr', label: 'A0', type: 'select', options: [
                        { value: '0', label: '0x48' }, { value: '1', label: '0x49' }
                    ], default: '0' },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -55, max: 150 }
                ]
            };
            case 'stts751': return {
                title: 'STTS751 Temperature (I²C)', fields: [
                    { key: 'addr', label: 'Address', type: 'select', options: [
                        { value: '0', label: '0x48' }, { value: '1', label: '0x49' },
                        { value: '2', label: '0x4A' }, { value: '3', label: '0x4B' }
                    ], default: '0' },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -64, max: 127 }
                ]
            };
            case 'pcf8563': return {
                title: 'PCF8563 RTC (I²C)', fields: [
                    { key: 'tickRate', label: 'Tick rate (CPU cycles/sec)', type: 'number', default: '1000', min: 100, max: 100000 }
                ]
            };
            case 'ds18b20': return {
                title: 'DS18B20 Temperature (1-Wire)', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'A' },
                    { key: 'pin', label: 'Pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'temp', label: 'Initial temp (°C)', type: 'number', default: '25', min: -55, max: 125 },
                    { key: 'serial', label: 'Serial (hex 12 chars)', type: 'text', default: '000000000001' }
                ]
            };
            case 'servo': return {
                title: 'RC Servo Motor', fields: [
                    { key: 'port', label: 'Signal port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'pin', label: 'Signal pin', type: 'number', default: '0', min: 0, max: 7 }
                ]
            };
            case 'hcsr04': return {
                title: 'HC-SR04 Ultrasonic Sensor', fields: [
                    { key: 'trigPort', label: 'Trigger port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'trigPin', label: 'Trigger pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'echoPort', label: 'Echo port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'echoPin', label: 'Echo pin', type: 'number', default: '1', min: 0, max: 7 },
                    { key: 'dist', label: 'Initial distance (cm)', type: 'number', default: '20', min: 2, max: 400 }
                ]
            };
            case 'ws2812': return {
                title: 'WS2812B LED Strip (NeoPixel)', fields: [
                    { key: 'port', label: 'DIN port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'pin', label: 'DIN pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'numLeds', label: 'Number of LEDs', type: 'number', default: '8', min: 1, max: 256 },
                    { key: 'ledsPerRow', label: 'LEDs per row (0=auto)', type: 'number', default: '0', min: 0, max: 64 }
                ]
            };
            case 'ssd1306': return {
                title: 'SSD1306 OLED 128x64 (I²C)', fields: [
                    { key: 'addr', label: 'SA0', type: 'select', options: [
                        { value: '0', label: '0x3C (SA0=0)' }, { value: '1', label: '0x3D (SA0=1)' }
                    ], default: '0' },
                    { key: 'scale', label: 'Pixel scale', type: 'number', default: '2', min: 1, max: 3 }
                ]
            };
            case 'ks0108': return {
                title: 'KS0108 GLCD 128x64 (Parallel)', fields: [
                    { key: 'dataPort', label: 'Data port (D0-D7)', type: 'select', options: portOpts, default: 'B' },
                    { key: 'ctrlPort', label: 'Control port', type: 'select', options: portOpts, default: 'D' },
                    { key: 'rsPin', label: 'RS pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'enPin', label: 'EN pin', type: 'number', default: '2', min: 0, max: 7 },
                    { key: 'cs1Pin', label: 'CS1 pin', type: 'number', default: '3', min: 0, max: 7 },
                    { key: 'cs2Pin', label: 'CS2 pin', type: 'number', default: '4', min: 0, max: 7 },
                    { key: 'scale', label: 'Pixel scale', type: 'number', default: '2', min: 1, max: 3 },
                    { key: 'color', label: 'Color', type: 'select', options: [
                        { value: 'green', label: 'Green' }, { value: 'blue', label: 'Blue' }, { value: 'white', label: 'White' }
                    ], default: 'green' }
                ]
            };
            case 'l293d': return {
                title: 'L293D Dual H-Bridge (DC Motors)', fields: [
                    { key: 'enPort', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'en1Pin', label: 'EN1 (Motor A speed)', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'in1aPin', label: 'IN1 (Motor A dir)', type: 'number', default: '1', min: 0, max: 7 },
                    { key: 'in1bPin', label: 'IN2 (Motor A dir)', type: 'number', default: '2', min: 0, max: 7 },
                    { key: 'en2Pin', label: 'EN2 (Motor B speed)', type: 'number', default: '3', min: 0, max: 7 },
                    { key: 'in2aPin', label: 'IN3 (Motor B dir)', type: 'number', default: '4', min: 0, max: 7 },
                    { key: 'in2bPin', label: 'IN4 (Motor B dir)', type: 'number', default: '5', min: 0, max: 7 }
                ]
            };
            case 'buzzer': return {
                title: 'Buzzer / Speaker', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'pin', label: 'Pin', type: 'number', default: '0', min: 0, max: 7 }
                ]
            };
            case 'keypad': return {
                title: 'Keypad 4x4 Matrix', fields: [
                    { key: 'rowPort', label: 'Rows port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'rowStart', label: 'Rows start bit', type: 'number', default: '0', min: 0, max: 4 },
                    { key: 'colPort', label: 'Cols port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'colStart', label: 'Cols start bit', type: 'number', default: '4', min: 0, max: 4 }
                ]
            };
            case 'rgb-led': return {
                title: 'RGB LED', fields: [
                    { key: 'port', label: 'Port', type: 'select', options: portOpts, default: 'B' },
                    { key: 'rPin', label: 'Red pin', type: 'number', default: '0', min: 0, max: 7 },
                    { key: 'gPin', label: 'Green pin', type: 'number', default: '1', min: 0, max: 7 },
                    { key: 'bPin', label: 'Blue pin', type: 'number', default: '2', min: 0, max: 7 }
                ]
            };
            default: return null;
        }
    }

    // ================================================================
    //  ADD / CLEAR COMPONENTS
    // ================================================================

    addComponent(type, config) {
        var area = document.getElementById('vhw-area');
        if (!area) return;
        var id = 'vhw-c' + (this._compId++);
        var comp = null;
        switch (type) {
            case '7seg-1': comp = new VHW7Seg1(this, config, id); break;
            case '7seg-4': comp = new VHW7Seg4(this, config, id); break;
            case 'led-bar': comp = new VHWLedBar(this, config, id); break;
            case 'buttons-4': comp = new VHWButtons(this, config, id); break;
            case 'dip-8': comp = new VHWDipSwitch(this, config, id); break;
            case 'lcd-8bit': comp = new VHWLCD(this, 8, config, id); break;
            case 'lcd-4bit': comp = new VHWLCD(this, 4, config, id); break;
            case 'lcd-i2c': comp = new VHWLCDI2C(this, config, id); break;
            case 'rtc-ds1307': comp = new VHWRTC(this, config, id); break;
            case 'eeprom-24c02': comp = new VHWEepromViewer(this, config, id); break;
            case 'bmp280': comp = new VHWBMP280(this, config, id); break;
            case 'lm75': comp = new VHWLM75(this, config, id); break;
            case 'sht21': comp = new VHWSHT21(this, config, id); break;
            case 'ds3231': comp = new VHWDS3231(this, config, id); break;
            case 'mcp9808': comp = new VHWMCP9808(this, config, id); break;
            case 'tmp102': comp = new VHWTMP102(this, config, id); break;
            case 'stts751': comp = new VHWSTTS751(this, config, id); break;
            case 'pcf8563': comp = new VHWPCF8563(this, config, id); break;
            case 'ds18b20': comp = new VHWDS18B20(this, config, id); break;
            case 'servo': comp = new VHWServo(this, config, id); break;
            case 'hcsr04': comp = new VHWHCSR04(this, config, id); break;
            case 'ws2812': comp = new VHWWS2812(this, config, id); break;
            case 'ssd1306': comp = new VHWSSD1306(this, config, id); break;
            case 'ks0108': comp = new VHWKS0108(this, config, id); break;
            case 'l293d': comp = new VHWL293D(this, config, id); break;
            case 'buzzer': comp = new VHWBuzzer(this, config, id); break;
            case 'keypad': comp = new VHWKeypad(this, config, id); break;
            case 'rgb-led': comp = new VHWRGBLed(this, config, id); break;
            case 'mcp23017': comp = new VHWMCP23017(this, config, id); break;
            case '74hc595': comp = new VHW74HC595(this, config, id); break;
            case 'max7219': comp = new VHWMAX7219(this, config, id); break;
            case 'mcp3008': comp = new VHWMCP3008(this, config, id); break;
        }
        if (!comp) return;
        comp._vhwType = type;
        comp._vhwConfig = config;

        var wrapper = document.createElement('div');
        wrapper.className = 'pic-vhw-component';
        wrapper.id = id;
        var header = document.createElement('div');
        header.className = 'pic-vhw-comp-header';
        header.innerHTML = '<span>' + comp.name + '</span>';

        var btnsDiv = document.createElement('div');
        btnsDiv.className = 'pic-vhw-comp-btns';

        // Duplicate button
        var dupBtn = document.createElement('button');
        dupBtn.className = 'pic-vhw-dup';
        dupBtn.textContent = '+';
        dupBtn.title = 'Duplicate';
        var self = this;
        dupBtn.addEventListener('click', function() {
            self._showConfigDialog(type);
        });
        btnsDiv.appendChild(dupBtn);

        // Remove button
        var removeBtn = document.createElement('button');
        removeBtn.className = 'pic-vhw-remove';
        removeBtn.textContent = '\u00D7';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', function() {
            var idx = self.components.indexOf(comp);
            if (idx >= 0) self.components.splice(idx, 1);
            wrapper.remove();
            if (comp.destroy) comp.destroy();
        });
        btnsDiv.appendChild(removeBtn);

        header.appendChild(btnsDiv);
        wrapper.appendChild(header);
        var body = document.createElement('div');
        body.className = 'pic-vhw-comp-body';
        wrapper.appendChild(body);
        area.appendChild(wrapper);
        comp.render(body);
        this.components.push(comp);
    }

    clearAll() {
        var area = document.getElementById('vhw-area');
        if (area) area.innerHTML = '';
        for (var i = 0; i < this.components.length; i++) {
            if (this.components[i].destroy) this.components[i].destroy();
        }
        this.components = [];
    }

    update() {
        for (var i = 0; i < this.components.length; i++) this.components[i].update();
    }

    setCpu(cpu) { this.cpu = cpu; }

    _checkAddrConflict(type, config) {
        var addr = this._resolveAddr(type, config);
        if (addr === null) return null;
        var mssp = this.cpu.getPeripheral('MSSP');
        if (!mssp || !mssp.i2cBus) return null;
        if (mssp.i2cBus.devices.get(addr)) {
            return 'Address 0x' + addr.toString(16).toUpperCase() + ' already in use';
        }
        // Check other VHW components not yet attached
        for (var i = 0; i < this.components.length; i++) {
            if (this.components[i].i2cAddr === addr) {
                return 'Address 0x' + addr.toString(16).toUpperCase() + ' already used by ' + this.components[i].name;
            }
        }
        return null;
    }

    _resolveAddr(type, config) {
        switch (type) {
            case 'eeprom-24c02': return 0x50 | (parseInt(config.addr) || 0);
            case 'lm75': return 0x48 | (parseInt(config.addr) || 0);
            case 'mcp23017': return 0x20 | (parseInt(config.addr) || 0);
            case 'bmp280': return config.addr === 'high' ? 0x77 : 0x76;
            case 'rtc-ds1307': return 0x68;
            case 'ds3231': return 0x68;
            case 'sht21': return 0x40;
            case 'mcp9808': return 0x18 | (parseInt(config.addr) || 0);
            case 'tmp102': return 0x48 | (parseInt(config.addr) || 0);
            case 'stts751': return 0x48 | (parseInt(config.addr) || 0);
            case 'pcf8563': return 0x51;
            case 'lcd-i2c': return parseInt(config.addr) || 0x27;
            case 'ssd1306': return config.addr === '1' ? 0x3D : 0x3C;
            default: return null;
        }
    }

    getPortByte(letter) {
        var gpio = this.cpu.getPeripheral('GPIO_' + letter);
        if (!gpio) return 0;
        var out = gpio.getOutput();
        return out.data & ~out.tris;
    }

    setPin(port, pin, value) {
        var gpio = this.cpu.getPeripheral('GPIO_' + port);
        if (gpio) gpio.setExternalPin(pin, value ? 1 : 0);
    }

    // ================================================================
    //  SERIALIZE / DESERIALIZE (ASM comment headers)
    // ================================================================

    /**
     * Genera le righe ; @VHW: da inserire nel sorgente ASM.
     * @returns {string[]} Array di righe commento
     */
    serializeToComments() {
        var lines = [];
        for (var i = 0; i < this.components.length; i++) {
            var comp = this.components[i];
            if (comp._vhwType && comp._vhwConfig) {
                lines.push('; @VHW: ' + comp._vhwType + ' ' + JSON.stringify(comp._vhwConfig));
            }
        }
        return lines;
    }

    /**
     * Inserisce i tag @VHW nel sorgente ASM, sostituendo quelli esistenti.
     * @param {string} source - Sorgente ASM
     * @returns {string} Sorgente con tag aggiornati
     */
    injectIntoSource(source) {
        // Rimuovi vecchi tag @VHW
        var lines = source.split('\n');
        var filtered = lines.filter(function(l) { return !l.match(/^\s*;\s*@VHW:/); });

        // Genera nuovi tag
        var vhwLines = this.serializeToComments();
        if (vhwLines.length === 0) return filtered.join('\n');

        // Inserisci dopo l'eventuale header di commenti iniziale
        var insertIdx = 0;
        for (var i = 0; i < filtered.length; i++) {
            if (filtered[i].match(/^\s*;/) || filtered[i].trim() === '') {
                insertIdx = i + 1;
            } else {
                break;
            }
        }

        // Aggiungi riga vuota separatore se necessario
        var block = ['; --- Virtual Hardware Configuration ---'];
        block = block.concat(vhwLines);
        block.push('; --- End VHW ---');
        block.push('');

        filtered.splice(insertIdx, 0, block.join('\n'));
        return filtered.join('\n');
    }

    /**
     * Parsa il sorgente ASM e ricrea i componenti @VHW.
     * @param {string} source - Sorgente ASM
     */
    loadFromSource(source) {
        var lines = source.split('\n');
        var configs = [];
        for (var i = 0; i < lines.length; i++) {
            var match = lines[i].match(/^\s*;\s*@VHW:\s*(\S+)\s+(.*)/);
            if (match) {
                try {
                    var type = match[1];
                    var config = JSON.parse(match[2]);
                    configs.push({ type: type, config: config });
                } catch (e) { /* ignore parse errors */ }
            }
        }
        if (configs.length > 0) {
            this.clearAll();
            for (var j = 0; j < configs.length; j++) {
                this.addComponent(configs[j].type, configs[j].config);
            }
        }
    }

    /**
     * Rimuove i tag @VHW dal sorgente.
     * @param {string} source
     * @returns {string}
     */
    static stripVHWComments(source) {
        return source.split('\n').filter(function(l) {
            return !l.match(/^\s*;\s*@VHW:/) && !l.match(/^\s*;\s*---\s*(Virtual Hardware|End VHW)/);
        }).join('\n');
    }
}
