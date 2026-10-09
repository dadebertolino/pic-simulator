<?php
/**
 * Template simulatore PIC per WordPress
 * Variabili disponibili: $atts (shortcode attributes)
 */
defined('ABSPATH') || exit;

$height = esc_attr($atts['height']);
$width = esc_attr($atts['width']);
$max_width = esc_attr($atts['max_width']);
$theme = esc_attr($atts['theme']);
$is_fullwidth = ($atts['fullwidth'] === 'yes' || $atts['fullwidth'] === 'true' || $atts['fullwidth'] === '1');

$style = "height: {$height}; width: {$width}; max-width: {$max_width};";
if ($is_fullwidth) {
    $style .= " margin-left: calc(-50vw + 50%); margin-right: calc(-50vw + 50%); position: relative;";
}
?>

<div id="pic-simulator-app" class="pic-sim-container pic-sim-<?php echo esc_attr($theme); ?><?php echo $is_fullwidth ? ' pic-sim-fullwidth' : ''; ?>" style="<?php echo esc_attr($style); ?>">
    <div class="pic-sim-wrapper">
        <!-- Header -->
        <header class="pic-header">
            <div class="pic-logo">
                <svg viewBox="0 0 32 32" width="28" height="28">
                    <rect x="4" y="8" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                    <circle cx="10" cy="16" r="2"/>
                    <circle cx="16" cy="16" r="2"/>
                    <circle cx="22" cy="16" r="2"/>
                    <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" stroke-width="2"/>
                    <line x1="14" y1="4" x2="14" y2="8" stroke="currentColor" stroke-width="2"/>
                    <line x1="20" y1="4" x2="20" y2="8" stroke="currentColor" stroke-width="2"/>
                    <line x1="8" y1="24" x2="8" y2="28" stroke="currentColor" stroke-width="2"/>
                    <line x1="14" y1="24" x2="14" y2="28" stroke="currentColor" stroke-width="2"/>
                    <line x1="20" y1="24" x2="20" y2="28" stroke="currentColor" stroke-width="2"/>
                </svg>
                <h2>WebPicSimulator</h2>
                <span class="pic-author">by Prof. D.Bertolino</span>
            </div>
            <div class="pic-device-selector">
                <label for="device-select">Device:</label>
                <select id="device-select">
                    <option value="PIC16F84A" selected>PIC16F84A</option>
                    <!-- Altri dispositivi caricati dinamicamente -->
                </select>
                <span id="device-info" class="pic-device-info" title="Click for details">1K / 68B / 2 ports</span>
            </div>
            <div class="pic-speed-control">
                <label for="run-speed">Run:</label>
                <select id="run-speed" class="pic-select" title="Run speed compared to the real chip at 4 MHz">
                    <option value="1" selected>Real time</option>
                    <option value="0.1">1/10</option>
                    <option value="0.01">1/100</option>
                    <option value="0.001">1/1000</option>
                    <option value="max">Max</option>
                </select>
                <label for="speed-slider">Animate:</label>
                <input type="range" id="speed-slider" min="1" max="5" step="1" value="3" title="Animate speed (instructions per second)" aria-valuetext="10 instructions per second">
                <span id="speed-value">10 Hz</span>
            </div>
        </header>

        <!-- Main Content -->
        <div class="pic-main">
            <!-- Left: Editor -->
            <div class="pic-editor-area">
                <!-- Toolbar -->
                <div class="pic-toolbar">
                    <!-- Build -->
                    <div class="pic-toolbar-group">
                        <button class="pic-btn pic-btn-primary" id="btn-assemble" title="Assemble (F5)">
                            &#9654; Assemble
                        </button>
                        <button class="pic-btn pic-btn-download" id="btn-export-hex" disabled title="Download HEX file">&#11015; .hex</button>
                        <button class="pic-btn pic-btn-download" id="btn-export-map" disabled title="Download MAP file">&#11015; .map</button>
                    </div>
                    <!-- Execution -->
                    <div class="pic-toolbar-group">
                        <button class="pic-btn pic-btn-success" id="btn-run" disabled title="Run (Ctrl+F5)">&#9654; Run</button>
                        <button class="pic-btn pic-btn-animate" id="btn-animate" disabled title="Animate (F6)">&#9199; Animate</button>
                        <button class="pic-btn pic-btn-danger" id="btn-stop" disabled title="Stop (Esc)">&#9632; Stop</button>
                    </div>
                    <!-- Debug -->
                    <div class="pic-toolbar-group">
                        <button class="pic-btn" id="btn-step" disabled title="Step Into (F8)">&#11189; Step</button>
                        <button class="pic-btn" id="btn-step-over" disabled title="Step Over (F10)">&#10809; Over</button>
                        <button class="pic-btn" id="btn-step-out" disabled title="Step Out (Shift+F8)">&#10810; Out</button>
                        <button class="pic-btn" id="btn-reset" disabled title="Reset">&#8634; Reset</button>
                    </div>
                    <!-- File -->
                    <div class="pic-toolbar-group">
                        <button class="pic-btn" id="btn-load-asm" title="Load ASM file">&#128196; Load</button>
                        <button class="pic-btn" id="btn-save" title="Save Project">&#128190; Save</button>
                        <button class="pic-btn" id="btn-export-asm" title="Export ASM with VHW config">&#11015; .asm</button>
                        <select class="pic-select pic-select-examples" id="examples-select" title="Load example">
                            <option value="">-- Examples --</option>
                        </select>
                    </div>
                </div>

                <!-- Editor -->
                <div class="pic-editor-container">
                    <div class="pic-gutter" id="editor-gutter"></div>
                    <div class="pic-editor-wrapper">
                        <div class="pic-line-highlight" id="line-highlight"></div>
                        <textarea id="code-editor" spellcheck="false" placeholder="; Write your PIC assembly code here..."></textarea>
                    </div>
                </div>
                
                <!-- Error Panel (sotto l'editor) -->
                <div id="error-list" class="pic-error-panel"></div>
                
                <input type="file" id="asm-file-input" accept=".asm,.txt,.inc" style="display: none;">
            </div>

            <!-- Right: Panels -->
            <aside class="pic-sidebar">
                <!-- Registers -->
                <div class="pic-panel pic-collapsible" data-panel="registers">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>Registers</span>
                        <span class="pic-panel-device" id="reg-device-name">PIC16F84A</span>
                    </div>
                    <div class="pic-panel-content pic-panel-scroll pic-collapse-body" id="registers-container">
                    </div>
                </div>

                <!-- Interrupts -->
                <div class="pic-panel pic-collapsible pic-collapsed" data-panel="interrupts" id="interrupts-panel">
                    <div class="pic-panel-header pic-collapse-toggle">Interrupts</div>
                    <div class="pic-panel-content pic-collapse-body" id="interrupts-container"></div>
                </div>

                <!-- I/O Ports -->
                <div class="pic-panel pic-collapsible" data-panel="ports">
                    <div class="pic-panel-header pic-collapse-toggle">I/O Ports</div>
                    <div class="pic-panel-content pic-collapse-body" id="ports-container">
                        <div class="pic-port-section">
                            <div class="pic-port-label">PORTA</div>
                            <div class="pic-port-pins" id="porta-pins"></div>
                        </div>
                        <div class="pic-port-section">
                            <div class="pic-port-label">PORTB</div>
                            <div class="pic-port-pins" id="portb-pins"></div>
                        </div>
                    </div>
                </div>

                <!-- Timers -->
                <div class="pic-panel pic-collapsible" data-panel="timers" id="timers-panel">
                    <div class="pic-panel-header pic-collapse-toggle">Timers</div>
                    <div class="pic-panel-content pic-collapse-body" id="timers-container"></div>
                </div>

                <!-- Serial Terminal -->
                <div class="pic-panel pic-collapsible" data-panel="terminal" id="terminal-panel">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>Serial Terminal</span>
                        <span class="pic-term-badge" id="term-enabled-badge">USART</span>
                    </div>
                    <div class="pic-panel-content pic-collapse-body" id="terminal-container"></div>
                </div>

                <!-- CCP/PWM -->
                <div class="pic-panel pic-collapsible" data-panel="ccp" id="ccp-panel">
                    <div class="pic-panel-header pic-collapse-toggle">CCP / PWM</div>
                    <div class="pic-panel-content pic-collapse-body" id="ccp-container"></div>
                </div>

                <!-- ADC -->
                <div class="pic-panel pic-collapsible" data-panel="adc" id="adc-panel">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>ADC</span>
                        <span class="pic-panel-device" id="adc-ch-count"></span>
                    </div>
                    <div class="pic-panel-content pic-collapse-body" id="adc-container"></div>
                </div>

                <!-- Comparator -->
                <div class="pic-panel pic-collapsible" data-panel="comparator" id="comparator-panel">
                    <div class="pic-panel-header pic-collapse-toggle">Comparator</div>
                    <div class="pic-panel-content pic-collapse-body" id="comparator-container"></div>
                </div>

                <!-- MSSP -->
                <div class="pic-panel pic-collapsible" data-panel="mssp" id="mssp-panel">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>MSSP</span>
                        <span class="pic-panel-device">SPI / I&sup2;C</span>
                    </div>
                    <div class="pic-panel-content pic-collapse-body" id="mssp-container"></div>
                </div>

                <!-- Virtual Hardware -->
                <div class="pic-panel pic-collapsible" data-panel="virtual-hw" id="virtual-hw-panel">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>Virtual Hardware</span>
                    </div>
                    <div class="pic-panel-content pic-collapse-body" id="virtual-hw-container">
                        <div class="pic-vhw-toolbar">
                            <select class="pic-select pic-select-vhw" id="vhw-config-select" aria-label="Add virtual component">
                                <option value="none">-- Add Component --</option>
                                <option value="7seg-1">7-Seg (1 digit, PORTB)</option>
                                <option value="7seg-4">7-Seg (4 digit, mux)</option>
                                <option value="lcd-8bit">LCD 16x2 (8-bit)</option>
                                <option value="lcd-4bit">LCD 16x2 (4-bit)</option>
                                <option value="lcd-i2c">LCD 16x2 (I²C PCF8574)</option>
                                <option value="rtc-ds1307">RTC DS1307 (I²C)</option>
                                <option value="eeprom-24c02">EEPROM 24C02 (I²C)</option>
                                <option value="bmp280">BMP280 Temp/Press (I²C)</option>
                                <option value="lm75">LM75 Temp (I²C)</option>
                                <option value="sht21">SHT21 Temp/Humidity (I²C)</option>
                                <option value="ds3231">DS3231 RTC (I²C)</option>
                                <option value="mcp9808">MCP9808 Temp Alert (I²C)</option>
                                <option value="tmp102">TMP102 Temp (I²C)</option>
                                <option value="stts751">STTS751 Temp (I²C)</option>
                                <option value="pcf8563">PCF8563 RTC (I²C)</option>
                                <option value="ds18b20">DS18B20 Temp (1-Wire)</option>
                                <option value="servo">RC Servo Motor</option>
                                <option value="hcsr04">HC-SR04 Ultrasonic</option>
                                <option value="ws2812">WS2812B LED Strip</option>
                                <option value="ssd1306">SSD1306 OLED 128x64 (I²C)</option>
                                <option value="ks0108">KS0108 GLCD 128x64 (Parallel)</option>
                                <option value="l293d">L293D DC Motors</option>
                                <option value="buzzer">Buzzer / Speaker</option>
                                <option value="keypad">Keypad 4x4</option>
                                <option value="rgb-led">RGB LED</option>
                                <option value="led-bar">LED Bar (8, PORTB)</option>
                                <option value="buttons-4">4 Buttons (PORTA)</option>
                                <option value="dip-8">DIP Switch 8 (PORTB)</option>
                                <option value="mcp23017">MCP23017 16-I/O (I²C)</option>
                                <option value="74hc595">74HC595 Shift Reg (SPI)</option>
                                <option value="max7219">MAX7219 8-Digit (SPI)</option>
                                <option value="mcp3008">MCP3008 ADC 8ch (SPI)</option>
                            </select>
                            <button class="pic-btn pic-btn-sm" id="vhw-clear" title="Remove all">Clear</button>
                        </div>
                        <div class="pic-vhw-area" id="vhw-area"></div>
                    </div>
                </div>

                <!-- Memory -->
                <div class="pic-panel pic-collapsible" data-panel="memory">
                    <div class="pic-panel-header pic-collapse-toggle">Memory</div>
                    <div class="pic-panel-content pic-collapse-body">
                        <div class="pic-memory-tabs">
                            <button class="pic-memory-tab active" data-type="ram">RAM</button>
                            <button class="pic-memory-tab" data-type="program">Program</button>
                            <button class="pic-memory-tab" data-type="eeprom">EEPROM</button>
                            <button class="pic-memory-tab" data-type="variables">Variables</button>
                        </div>
                        <div id="memory-content" tabindex="0" role="region" aria-label="Memory contents"></div>
                    </div>
                </div>

                <!-- Stack -->
                <div class="pic-panel pic-collapsible" data-panel="stack">
                    <div class="pic-panel-header pic-collapse-toggle">Stack</div>
                    <div class="pic-panel-content pic-collapse-body">
                        <div id="stack-view"></div>
                    </div>
                </div>

                <!-- Breakpoints -->
                <div class="pic-panel pic-collapsible pic-collapsed" data-panel="breakpoints">
                    <div class="pic-panel-header pic-collapse-toggle">
                        <span>Breakpoints</span>
                        <button class="pic-btn-icon" id="btn-clear-breakpoints" title="Clear all">&#10006;</button>
                    </div>
                    <div class="pic-panel-content pic-collapse-body">
                        <div class="pic-breakpoints-hint">Click line numbers to toggle</div>
                        <div id="breakpoints-list"></div>
                    </div>
                </div>

                <!-- Watch -->
                <div class="pic-panel pic-collapsible pic-collapsed" data-panel="watches">
                    <div class="pic-panel-header pic-collapse-toggle">Watch</div>
                    <div class="pic-panel-content pic-collapse-body">
                        <div class="pic-watch-input">
                            <input type="text" id="watch-input" placeholder="Variable or address">
                            <button class="pic-btn" id="btn-add-watch">+</button>
                        </div>
                        <div id="watches-list"></div>
                    </div>
                </div>
            </aside>
        </div>

        <!-- Footer -->
        <footer class="pic-footer">
            <div class="pic-status" id="sim-status">
                <div class="pic-status-indicator" id="status-indicator"></div>
                <span id="status-text">Ready</span>
            </div>
            <span class="pic-status-sep">|</span>
            <span>Cycles: <strong id="cycles">0</strong></span>
            <span class="pic-status-sep">|</span>
            <span title="Time elapsed on the simulated chip at 4 MHz">Time: <strong id="sim-time">0 µs</strong></span>
            <span class="pic-status-sep">|</span>
            <span id="current-instruction" class="pic-current-instr">-</span>
            <div id="messages" class="pic-messages"></div>
        </footer>
    </div>

    <!-- Project Dialog -->
    <div id="project-dialog" class="pic-dialog-overlay" style="display: none;">
        <div class="pic-dialog">
            <div class="pic-dialog-header">
                <h3 id="dialog-title">Projects</h3>
                <button class="pic-dialog-close" onclick="picSimCloseDialog()">&times;</button>
            </div>
            <div class="pic-dialog-content">
                <div id="dialog-save" style="display: none;">
                    <label>Project Name:</label>
                    <input type="text" id="project-name" placeholder="my_project">
                    <button class="pic-btn pic-btn-primary" onclick="picSimSaveProject()">Save</button>
                </div>
                <div id="dialog-load" style="display: none;">
                    <div id="projects-list"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
// Inizializzazione simulatore
document.addEventListener('DOMContentLoaded', async function() {
    // Verifica che le classi siano caricate
    if (typeof PIC16Core === 'undefined') {
        console.error('PIC Simulator: Scripts not loaded');
        return;
    }
    
    const container = document.getElementById('pic-simulator-app');
    if (!container) return;
    
    // Carica database dispositivi
    let deviceLoader = null;
    if (typeof DeviceLoader !== 'undefined') {
        deviceLoader = new DeviceLoader();
        await deviceLoader.init(picSimConfig.dataPath || '');
        
        // Popola dropdown dispositivi
        populateDeviceSelect(deviceLoader);
    }
    
    // Crea factory dispositivi
    var factory = new PIC16Factory(deviceLoader);
    
    // Carica device iniziale (PIC16F84A default)
    var defaultDevice = 'PIC16F84A';
    if (deviceLoader) {
        await deviceLoader.loadDevice(defaultDevice).catch(function() {});
    }
    
    // Crea CPU con periferiche dal factory
    var result = factory.create(defaultDevice);
    var cpu = result.cpu;
    if (result.warnings.length > 0) {
        console.warn('Factory warnings:', result.warnings);
    }
    console.log('Peripherals:', result.peripheralList.join(', '));
    
    const assembler = new PIC16Assembler();
    const simulator = new Simulator(cpu, assembler);
    const ui = new SimulatorUI(simulator);
    
    // Passa device loader e factory all'UI
    ui.deviceLoader = deviceLoader;
    ui.factory = factory;
    
    ui.init();
    
    // Storage WordPress
    if (typeof PICStorageWP !== 'undefined') {
        const storage = new PICStorageWP(ui);
        storage.init();
        window.picSimStorage = storage;
    }
    
    // Event listener cambio dispositivo
    document.getElementById('device-select')?.addEventListener('change', async (e) => {
        var deviceId = e.target.value;
        
        // Carica spec device se non in cache
        if (deviceLoader) {
            try {
                await deviceLoader.loadDevice(deviceId);
            } catch (err) {
                console.error('Failed to load device:', deviceId, err);
            }
        }
        
        ui.changeDevice(deviceId);
    });
    
    window.picSim = { cpu, assembler, simulator, ui, deviceLoader, factory };
    
    console.log('WebPicSimulator initialized');
});

// Popola dropdown dispositivi
function populateDeviceSelect(loader) {
    const select = document.getElementById('device-select');
    if (!select || !loader) return;
    
    const devices = loader.getAvailableDevices();
    select.innerHTML = '';
    
    devices.forEach(function(device) {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name + ' (' + device.pins + '-pin, ' + device.program + ')';
        select.appendChild(option);
    });
    
    // Seleziona default
    select.value = 'PIC16F84A';
}

// Aggiorna info dispositivo
function updateDeviceInfo(deviceId, loader) {
    const info = document.getElementById('device-info');
    if (!info || !loader) return;
    
    const device = loader.devices[deviceId];
    if (device) {
        var mem = device.memory || {};
        var progSize = (mem.program && mem.program.size) || 1024;
        var ramSize = (mem.ram && mem.ram.total) || 68;
        var portNames = device.ports ? Object.keys(device.ports) : [];
        var periphNames = device.peripherals ? Object.keys(device.peripherals) : [];
        var progStr = progSize >= 1024 ? (progSize / 1024) + 'K' : String(progSize);
        info.textContent = progStr + ' / ' + ramSize + 'B / ' + portNames.length + ' ports';
        info.title = (device.description || deviceId) + '\nPorts: ' + portNames.join(', ') + '\nPeripherals: ' + periphNames.join(', ');
    }
}

// Global functions per dialog
function picSimCloseDialog() {
    document.getElementById('project-dialog').style.display = 'none';
}

function picSimSaveProject() {
    if (window.picSimStorage) {
        window.picSimStorage.saveProject();
    }
}
</script>
