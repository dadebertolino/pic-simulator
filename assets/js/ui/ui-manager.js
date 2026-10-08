/**
 * UI Manager
 * Coordinatore dei moduli UI. Sostituisce il monolite SimulatorUI.
 * Espone la stessa interfaccia pubblica per compatibilita' con
 * simulator.php, storage-wp.js e altri consumer esterni.
 */

class SimulatorUI {
    constructor(simulator) {
        this.simulator = simulator;
        this.cpu = simulator.cpu;

        // External refs (set from template)
        this.deviceLoader = null;
        this.factory = null;
        this.currentDeviceId = 'PIC16F84A';
        this.darkMode = true;

        // Context condiviso con tutti i moduli
        var ctx = { cpu: this.cpu, simulator: this.simulator, ui: this };

        // Moduli
        this.editorModule = new UIEditor(ctx);
        this.toolbarModule = new UIToolbar(ctx);
        this.registersModule = new UIRegisters(ctx);
        this.portsModule = new UIPorts(ctx);
        this.memoryModule = new UIMemory(ctx);
        this.breakpointsModule = new UIBreakpoints(ctx);
        this.watchesModule = new UIWatches(ctx);
        this.messagesModule = new UIMessages(ctx);
        this.timersModule = typeof UITimers !== 'undefined' ? new UITimers(ctx) : null;
        this.terminalModule = typeof UITerminal !== 'undefined' ? new UITerminal(ctx) : null;
        this.ccpModule = typeof UICCP !== 'undefined' ? new UICCP(ctx) : null;
        this.adcModule = typeof UIADC !== 'undefined' ? new UIADC(ctx) : null;
        this.comparatorModule = typeof UIComparator !== 'undefined' ? new UIComparator(ctx) : null;
        this.msspModule = typeof UIMSSP !== 'undefined' ? new UIMSSP(ctx) : null;
        this.interruptsModule = typeof UIInterrupts !== 'undefined' ? new UIInterrupts(ctx) : null;
        this.virtualHWModule = typeof UIVirtualHW !== 'undefined' ? new UIVirtualHW(ctx) : null;

        // Bind callbacks dal simulator/cpu
        var self = this;
        this.simulator.onUpdate = function() { self.update(); };
        this.simulator.onBreakpoint = function(addr) { self.onBreakpoint(addr); };
        this.simulator.onError = function(msg) { self.showError(msg); };
        this.cpu.onPortChange = function(port, value) { self.updatePort(port); };
        this.cpu.onRegisterChange = function(name, value) { self.updateRegister(name, value); };
        this.cpu.onStackOverflow = function(depth, type) { self.onStackWarning(depth, type); };
    }

    init() {
        this.initCollapsiblePanels();
        this.editorModule.init();
        this.toolbarModule.init();
        this.registersModule.rebuildRegistersUI();
        if (this.interruptsModule) this.interruptsModule.rebuild();
        
        // Rebuild porte con dati device iniziale
        var deviceData = (this.deviceLoader && this.deviceLoader.devices)
            ? this.deviceLoader.devices[this.currentDeviceId] : null;
        this.portsModule.rebuildPortsUI(deviceData);
        if (this.timersModule) this.timersModule.rebuild();
        if (this.terminalModule) this.terminalModule.rebuild();
        if (this.ccpModule) this.ccpModule.rebuild();
        if (this.adcModule) this.adcModule.rebuild();
        if (this.comparatorModule) this.comparatorModule.rebuild();
        if (this.msspModule) this.msspModule.rebuild();
        if (this.virtualHWModule) this.virtualHWModule.init();
        
        this.memoryModule.init();
        this.watchesModule.init();
        this.initExamples();
        this.update();
    }

    // ================================================================
    //  COLLAPSIBLE PANELS
    // ================================================================

    initCollapsiblePanels() {
        var panels = document.querySelectorAll('.pic-collapsible');
        panels.forEach(function(panel) {
            var toggle = panel.querySelector('.pic-collapse-toggle');
            if (!toggle) return;

            toggle.addEventListener('click', function(e) {
                // Non collassare se click su un bottone figlio (es. btn-clear-breakpoints)
                if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
                panel.classList.toggle('pic-collapsed');
            });
        });
    }

    // ================================================================
    //  DELEGHE A MODULI (interfaccia pubblica)
    // ================================================================

    // Editor
    getSource() { return this.editorModule.getSource(); }
    setSource(code) {
        this.editorModule.setSource(code);
        // Auto-load Virtual Hardware from @VHW comments
        if (this.virtualHWModule && code.indexOf('@VHW:') !== -1) {
            this.virtualHWModule.loadFromSource(code);
        }
    }
    goToLine(line) { this.editorModule.goToLine(line); }

    // Messages
    showMessage(text, type) { this.messagesModule.showMessage(text, type); }
    showError(text) { this.messagesModule.showError(text); }
    setStatusBar(state, text) { this.messagesModule.setStatusBar(state, text); }

    // Toolbar / Build state
    onSourceChanged() { this.toolbarModule.onSourceChanged(); }
    updateSimulationButtons() { this.toolbarModule.updateSimulationButtons(); }

    // Breakpoints
    toggleBreakpointAtLine(line) { this.breakpointsModule.toggleBreakpointAtLine(line); }
    clearAllBreakpoints() { this.breakpointsModule.clearAllBreakpoints(); }

    // Ports
    updatePort(port) { this.portsModule.updatePort(port); }

    // Registers
    updateRegister(name, value) { this.registersModule.updateRegister(name, value); }

    // Watches (accesso diretto per storage-wp compat)
    get watches() { return this.watchesModule.watches; }
    set watches(val) { this.watchesModule.watches = val; }
    updateWatches() { this.watchesModule.updateWatches(); }

    // ================================================================
    //  ASSEMBLY (coordinato tra editor, toolbar, report)
    // ================================================================

    assemble() {
        // Carica simboli device nell'assembler prima di assemblare
        var assembler = this.simulator.assembler;
        assembler._deviceLoader = this.deviceLoader;
        if (this.deviceLoader && this.deviceLoader.devices) {
            var dd = this.deviceLoader.devices[this.currentDeviceId];
            if (dd) assembler.loadDeviceSymbols(this.currentDeviceId, dd);
        }
        
        var source = this.getSource();
        var result = this.simulator.loadSource(source);

        this.editorModule.clearErrorLines();

        if (result.success) {
            this.toolbarModule.onAssemblySuccess();

            // Report memoria
            var report = this.simulator.assembler.getMemoryReport(
                this.deviceLoader && this.deviceLoader.devices ? this.deviceLoader.devices[this.currentDeviceId] : null
            );
            this.showMemoryReport(report);

            this.memoryModule.updateProgramMemory();
            this.setStatusBar('assembled', 'Assembled');
            this.update();
        } else {
            this.toolbarModule.onAssemblyFail();
            this.editorModule.setErrorLines(result.errors.map(function(e) { return e.line; }));
            this.showErrorsPanel(result.errors);
            this.hideMemoryReport();
            if (result.errors.length > 0) this.editorModule.highlightLine(result.errors[0].line);
            this.setStatusBar('error', result.errors.length + ' Error' + (result.errors.length > 1 ? 's' : ''));
        }
    }

    // ================================================================
    //  ERRORS PANEL
    // ================================================================

    showErrorsPanel(errors) {
        var errorList = document.getElementById('error-list');
        if (!errorList) return;
        errorList.innerHTML = '';
        var header = document.createElement('div');
        header.className = 'error-header';
        header.innerHTML = '<span>&#9888; ' + errors.length + ' Error' + (errors.length > 1 ? 's' : '') + '</span>';
        errorList.appendChild(header);
        var self = this;
        errors.forEach(function(error) {
            var item = document.createElement('div');
            item.className = 'error-item';
            item.innerHTML = '<span class="error-line">Line ' + error.line + '</span><span class="error-msg">' + self.escapeHtml(error.message) + '</span>';
            item.addEventListener('click', function() { self.goToLine(error.line); });
            errorList.appendChild(item);
        });
        errorList.classList.add('has-errors');
    }

    clearErrors() {
        this.editorModule.clearErrorLines();
        var errorList = document.getElementById('error-list');
        if (errorList) { errorList.innerHTML = ''; errorList.classList.remove('has-errors'); }
    }

    escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ================================================================
    //  MEMORY REPORT
    // ================================================================

    showMemoryReport(report) {
        var old = document.getElementById('build-toast');
        if (old) old.remove();

        var bar = function(used, total, percent, overflow) {
            var level = overflow ? 'overflow' : (percent > 90 ? 'critical' : (percent > 70 ? 'warning' : 'ok'));
            return '<div class="pic-mem-bar"><div class="pic-mem-fill pic-mem-' + level + '" style="width:' + Math.min(percent, 100) + '%"></div></div>';
        };

        var toast = document.createElement('div');
        toast.id = 'build-toast';
        toast.className = 'pic-build-toast' + (report.hasOverflow ? ' pic-toast-overflow' : '');

        var header = report.hasOverflow
            ? '<span class="pic-report-warn">&#9888; Assembly OK &mdash; OVERFLOW</span>'
            : '<span class="pic-report-ok">&#10004; Assembly OK</span>';

        toast.innerHTML =
            '<div class="pic-toast-close" title="Close">&times;</div>' +
            '<div class="pic-report-header">' + header +
            '<span class="pic-report-stats">' + (report.deviceName || '') + ' &mdash; ' + report.labels + ' labels, ' + report.constants + ' constants</span></div>' +
            '<div class="pic-report-grid">' +
            '<div class="pic-report-item' + (report.flash.overflow ? ' pic-report-overflow' : '') + '"><div class="pic-report-label">Flash</div><div class="pic-report-value">' + report.flash.used + ' / ' + report.flash.total + '</div>' + bar(report.flash.used, report.flash.total, report.flash.percent, report.flash.overflow) + '</div>' +
            '<div class="pic-report-item' + (report.ram.overflow ? ' pic-report-overflow' : '') + '"><div class="pic-report-label">RAM</div><div class="pic-report-value">' + report.ram.used + ' / ' + report.ram.total + '</div>' + bar(report.ram.used, report.ram.total, report.ram.percent, report.ram.overflow) + '</div>' +
            '<div class="pic-report-item' + (report.eeprom.overflow ? ' pic-report-overflow' : '') + '"><div class="pic-report-label">EEPROM</div><div class="pic-report-value">' + report.eeprom.used + ' / ' + report.eeprom.total + '</div>' + bar(report.eeprom.used, report.eeprom.total, report.eeprom.percent, report.eeprom.overflow) + '</div>' +
            '<div class="pic-report-item' + (report.stack.overflow ? ' pic-report-overflow' : '') + '"><div class="pic-report-label">Stack</div><div class="pic-report-value">' + report.stack.depth + ' / ' + report.stack.max + '</div>' + bar(report.stack.depth, report.stack.max, report.stack.depth / report.stack.max * 100, report.stack.overflow) + '</div></div>' +
            (report.config ? '<div class="pic-report-config">CONFIG: <span class="pic-report-config-val">' + report.config.hex + '</span></div>' : '') +
            (report.warnings.length > 0 ? '<div class="pic-report-warnings">' + report.warnings.join('<br>') + '</div>' : '');

        var container = document.getElementById('pic-simulator-app');
        if (container) container.appendChild(toast);

        toast.querySelector('.pic-toast-close').addEventListener('click', function() { toast.remove(); });

        var delay = report.hasOverflow ? 10000 : 5000;
        setTimeout(function() {
            if (toast.parentNode) {
                toast.classList.add('pic-toast-fade');
                setTimeout(function() { if (toast.parentNode) toast.remove(); }, 500);
            }
        }, delay);
    }

    hideMemoryReport() {
        var toast = document.getElementById('build-toast');
        if (toast) toast.remove();
    }

    // ================================================================
    //  DEVICE MANAGEMENT
    // ================================================================

    changeDevice(deviceId) {
        this.toolbarModule.stop();
        if (!this.factory) { this.showError('Device factory not available'); return; }

        var result = this.factory.create(deviceId);
        this.currentDeviceId = deviceId;
        this.cpu = result.cpu;
        this.simulator.cpu = this.cpu;

        // Aggiorna contesto in tutti i moduli
        var modules = [this.editorModule, this.toolbarModule, this.registersModule,
                       this.portsModule, this.memoryModule, this.breakpointsModule, this.watchesModule];
        for (var i = 0; i < modules.length; i++) {
            modules[i].cpu = this.cpu;
        }

        // Ricollega callbacks
        var self = this;
        this.cpu.onPortChange = function(port, value) { self.updatePort(port); };
        this.cpu.onRegisterChange = function(name, value) { self.updateRegister(name, value); };
        this.cpu.onStackOverflow = function(depth, type) { self.onStackWarning(depth, type); };

        // Aggiorna UI
        var deviceData = (this.deviceLoader && this.deviceLoader.devices) ? this.deviceLoader.devices[deviceId] : null;
        this.updateDeviceInfoDisplay(deviceId, deviceData);
        this.registersModule.rebuildRegistersUI();
        if (this.interruptsModule) { this.interruptsModule.setCpu(this.cpu); this.interruptsModule.rebuild(); }
        this.portsModule.rebuildPortsUI(deviceData);
        if (this.timersModule) { this.timersModule.setCpu(this.cpu); this.timersModule.rebuild(); }
        if (this.terminalModule) { this.terminalModule.setCpu(this.cpu); this.terminalModule.rebuild(); }
        if (this.ccpModule) { this.ccpModule.setCpu(this.cpu); this.ccpModule.rebuild(); }
        if (this.adcModule) { this.adcModule.setCpu(this.cpu); this.adcModule.rebuild(); }
        if (this.comparatorModule) { this.comparatorModule.setCpu(this.cpu); this.comparatorModule.rebuild(); }
        if (this.msspModule) { this.msspModule.setCpu(this.cpu); this.msspModule.rebuild(); }
        if (this.virtualHWModule) { this.virtualHWModule.setCpu(this.cpu); }

        // Invalida assembly
        this.toolbarModule.assembled = false;
        this.toolbarModule.sourceModified = false;
        this.toolbarModule.updateSimulationButtons();
        this.setStatusBar('ready', 'Ready');
        this.update();

        var msg = 'Switched to ' + deviceId + ': ' + result.peripheralList.join(', ');
        if (result.warnings.length > 0) msg += ' | Warnings: ' + result.warnings.join('; ');
        this.showMessage(msg, result.warnings.length > 0 ? 'warning' : 'success');
    }

    updateDeviceInfoDisplay(deviceId, deviceData) {
        var info = document.getElementById('device-info');
        if (!info) return;
        if (deviceData) {
            var mem = deviceData.memory || {};
            var progSize = (mem.program && mem.program.size) || 1024;
            var ramSize = (mem.ram && mem.ram.total) || 68;
            var eepSize = (mem.eeprom && mem.eeprom.size) || 64;
            var portNames = deviceData.ports ? Object.keys(deviceData.ports) : [];
            var periphNames = deviceData.peripherals ? Object.keys(deviceData.peripherals) : [];
            var progStr = progSize >= 1024 ? (progSize / 1024) + 'K' : String(progSize);
            info.textContent = progStr + ' / ' + ramSize + 'B / ' + portNames.length + ' ports';
            info.title = [deviceData.description || deviceId, 'Program: ' + progSize + ' words',
                'RAM: ' + ramSize + ' bytes', 'EEPROM: ' + eepSize + ' bytes',
                'Ports: ' + portNames.join(', '), 'Peripherals: ' + periphNames.join(', ')].join('\n');
        } else {
            info.textContent = deviceId;
            info.title = deviceId;
        }
    }

    // ================================================================
    //  EXPORT / IMPORT
    // ================================================================

    exportHex() {
        if (!this.toolbarModule.assembled) { this.showMessage('Assemble first', 'warning'); return; }
        var hex = this.simulator.exportHex();
        if (hex) { this.downloadFile('program.hex', hex); this.showMessage('HEX downloaded', 'success'); }
    }

    exportMap() {
        if (!this.toolbarModule.assembled) { this.showMessage('Assemble first', 'warning'); return; }
        var deviceData = (this.deviceLoader && this.deviceLoader.devices) ? this.deviceLoader.devices[this.currentDeviceId] : null;
        var map = this.simulator.assembler.toMapFile(this.currentDeviceId, this.simulator.clockFrequency, deviceData);
        if (map) { this.downloadFile('program.map', map); this.showMessage('MAP downloaded', 'success'); }
    }

    saveProject() {
        var source = this.getSource();
        // Inietta configurazione VHW nel sorgente
        if (this.virtualHWModule && this.virtualHWModule.components.length > 0) {
            source = this.virtualHWModule.injectIntoSource(source);
        }
        var data = { source: source, breakpoints: this.simulator.getBreakpoints(), watches: this.watches };
        this.downloadFile('project.json', JSON.stringify(data, null, 2));
    }

    exportASM() {
        var source = this.getSource();
        if (this.virtualHWModule && this.virtualHWModule.components.length > 0) {
            source = this.virtualHWModule.injectIntoSource(source);
        }
        this.downloadFile('program.asm', source);
        this.showMessage('ASM downloaded', 'success');
    }

    loadProject() {
        var self = this;
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,.asm';
        input.onchange = function(e) {
            var file = e.target.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                if (file.name.endsWith('.json')) {
                    var data = JSON.parse(ev.target.result);
                    if (data.source) self.setSource(data.source);
                    if (data.watches) { self.watches = data.watches; self.updateWatches(); }
                } else {
                    self.setSource(ev.target.result);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    downloadFile(filename, content) {
        var blob = new Blob([content], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    // ================================================================
    //  BREAKPOINT CALLBACK
    // ================================================================

    onBreakpoint(addr) {
        this.toolbarModule.setRunningState(false);
        var line = this.simulator.getLineForAddress(addr);
        if (line) this.editorModule.highlightLine(line);
        this.setStatusBar('assembled', 'Breakpoint');
        this.showMessage('Breakpoint at 0x' + addr.toString(16).toUpperCase(), 'info');
    }

    // ================================================================
    //  SAMPLE CODE
    // ================================================================

    // ================================================================
    //  RUNTIME WARNINGS
    // ================================================================

    onStackWarning(depth, type) {
        if (type === 'overflow') {
            this.showMessage('⚠ STACK OVERFLOW at PC=0x' + this.cpu.PC.toString(16).toUpperCase().padStart(3, '0') +
                ' — CALL depth > ' + this.cpu.config.stackDepth + '. Return addresses lost!', 'error');
            // Stop animazione se in corso
            if (this.toolbarModule.animating) {
                this.toolbarModule.stopAnimate();
                this.setStatusBar('error', 'Stack Overflow');
                this.update();
            }
        } else if (type === 'underflow') {
            this.showMessage('⚠ STACK UNDERFLOW at PC=0x' + this.cpu.PC.toString(16).toUpperCase().padStart(3, '0') +
                ' — RETURN without matching CALL!', 'error');
        }
    }

    // ================================================================
    //  EXAMPLES
    // ================================================================

    initExamples() {
        var select = document.getElementById('examples-select');
        if (!select) return;
        var self = this;
        var examples = this._getExamples();

        // Raggruppa per categoria
        var categories = {};
        for (var i = 0; i < examples.length; i++) {
            var cat = examples[i].category || 'General';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(examples[i]);
        }

        for (var catName in categories) {
            var group = document.createElement('optgroup');
            group.label = catName;
            for (var j = 0; j < categories[catName].length; j++) {
                var ex = categories[catName][j];
                var opt = document.createElement('option');
                opt.value = String(j + '_' + catName);
                opt.textContent = ex.name;
                opt.title = ex.description || '';
                opt._example = ex;
                group.appendChild(opt);
            }
            select.appendChild(group);
        }

        select.addEventListener('change', function() {
            var opt = select.options[select.selectedIndex];
            if (opt && opt._example) {
                self.setSource(opt._example.source);
                self.toolbarModule.assembled = false;
                self.toolbarModule.sourceModified = false;
                self.toolbarModule.updateSimulationButtons();
                self.showMessage('Loaded: ' + opt._example.name, 'success');
            }
            select.selectedIndex = 0;
        });

        // Carica primo esempio
        if (examples.length > 0) this.setSource(examples[0].source);
    }

    _getExamples() {
        return [
            // === BASIC ===
            {
                category: 'Basic', name: 'LED Blink',
                description: 'Toggle RB0 LED with delay loop',
                source:
'; LED Blink - PIC16F84A\n\
; Toggle RB0 LED with delay\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    COUNT1\n\
    COUNT2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB          ; PORTB all output\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
MAIN:\n\
    BSF PORTB, 0        ; LED on\n\
    CALL DELAY\n\
    BCF PORTB, 0        ; LED off\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0xFF\n\
    MOVWF COUNT1\n\
LOOP1:\n\
    MOVLW 0xFF\n\
    MOVWF COUNT2\n\
LOOP2:\n\
    DECFSZ COUNT2, F\n\
    GOTO LOOP2\n\
    DECFSZ COUNT1, F\n\
    GOTO LOOP1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Basic', name: 'Knight Rider',
                description: 'LED chaser pattern on PORTB',
                source:
'; Knight Rider - PIC16F84A\n\
; LED chaser on PORTB\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    DELAY1\n\
    DELAY2\n\
    PATTERN\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x01\n\
    MOVWF PATTERN\n\
\n\
SHIFT_LEFT:\n\
    MOVF PATTERN, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    BCF STATUS, C\n\
    RLF PATTERN, F\n\
    BTFSS PATTERN, 7\n\
    GOTO SHIFT_LEFT\n\
\n\
    MOVF PATTERN, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
\n\
SHIFT_RIGHT:\n\
    BCF STATUS, C\n\
    RRF PATTERN, F\n\
    MOVF PATTERN, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    BTFSS PATTERN, 0\n\
    GOTO SHIFT_RIGHT\n\
    GOTO SHIFT_LEFT\n\
\n\
DELAY:\n\
    MOVLW 0x80\n\
    MOVWF DELAY1\n\
DL1:\n\
    MOVLW 0xFF\n\
    MOVWF DELAY2\n\
DL2:\n\
    DECFSZ DELAY2, F\n\
    GOTO DL2\n\
    DECFSZ DELAY1, F\n\
    GOTO DL1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Basic', name: 'Binary Counter',
                description: '8-bit counter on PORTB LEDs',
                source:
'; Binary Counter - PIC16F84A\n\
; Count 0-255 on PORTB\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    COUNT\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF COUNT\n\
\n\
MAIN:\n\
    MOVF COUNT, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    INCF COUNT, F\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            // === INPUT/OUTPUT ===
            {
                category: 'I/O', name: 'Button + LED',
                description: 'Read RA0 button, control RB0 LED',
                source:
'; Button + LED - PIC16F84A\n\
; RA0 = input button, RB0 = output LED\n\
\n\
    LIST P=16F84A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0xFF\n\
    MOVWF TRISA          ; PORTA all input\n\
    CLRF TRISB           ; PORTB all output\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
MAIN:\n\
    BTFSC PORTA, 0       ; Test RA0\n\
    GOTO LED_ON\n\
    BCF PORTB, 0         ; LED off\n\
    GOTO MAIN\n\
LED_ON:\n\
    BSF PORTB, 0         ; LED on\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === INTERRUPTS ===
            {
                category: 'Interrupts', name: 'TMR0 Interrupt',
                description: 'Toggle LED using Timer0 overflow interrupt',
                source:
'; TMR0 Interrupt - PIC16F84A\n\
; Toggle RB0 on Timer0 overflow\n\
\n\
    LIST P=16F84A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
\n\
    ORG 0x04              ; Interrupt vector\n\
ISR:\n\
    BCF INTCON, T0IF      ; Clear flag\n\
    MOVLW 0x01\n\
    XORWF PORTB, F        ; Toggle RB0\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x07            ; Prescaler 1:256\n\
    MOVWF OPTION_REG\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
    CLRF TMR0\n\
    BCF INTCON, T0IF\n\
    BSF INTCON, T0IE      ; Enable TMR0 int\n\
    BSF INTCON, GIE       ; Global enable\n\
\n\
MAIN:\n\
    NOP\n\
    GOTO MAIN             ; Wait for interrupt\n\
\n\
    END'
            },
            // === EEPROM ===
            {
                category: 'EEPROM', name: 'EEPROM Read/Write',
                description: 'Write and read back EEPROM data',
                source:
'; EEPROM Read/Write - PIC16F84A\n\
; Write 0x42 to addr 0x00, read back to PORTB\n\
\n\
    LIST P=16F84A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BSF EECON1, 2         ; WREN enable\n\
    BCF STATUS, RP0\n\
\n\
; Write 0x42 to EEPROM addr 0x00\n\
    CLRF EEADR\n\
    MOVLW 0x42\n\
    MOVWF EEDATA\n\
    BSF STATUS, RP0\n\
    MOVLW 0x55\n\
    MOVWF EECON2\n\
    MOVLW 0xAA\n\
    MOVWF EECON2\n\
    BSF EECON1, 1         ; WR start\n\
    BCF STATUS, RP0\n\
\n\
; Read back\n\
    CLRF EEADR\n\
    BSF STATUS, RP0\n\
    BSF EECON1, 0         ; RD\n\
    BCF STATUS, RP0\n\
    MOVF EEDATA, W\n\
    MOVWF PORTB           ; Show on LEDs\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
    END'
            },
            // === ARITHMETIC ===
            {
                category: 'Arithmetic', name: '8-bit Addition',
                description: 'Add two 8-bit numbers with carry',
                source:
'; 8-bit Addition - PIC16F84A\n\
; Add NUM1 + NUM2, result in SUM\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    NUM1\n\
    NUM2\n\
    SUM\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x37\n\
    MOVWF NUM1\n\
    MOVLW 0x4A\n\
    MOVWF NUM2\n\
\n\
    MOVF NUM1, W\n\
    ADDWF NUM2, W\n\
    MOVWF SUM\n\
    MOVWF PORTB           ; Display result\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
    END'
            },
            {
                category: 'Arithmetic', name: 'Multiply 8x8',
                description: 'Multiply two 8-bit numbers (shift-and-add)',
                source:
'; 8x8 Multiply - PIC16F84A\n\
; Result = NUM1 * NUM2 (16-bit result)\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    NUM1\n\
    NUM2\n\
    RES_L\n\
    RES_H\n\
    COUNT\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x07            ; 7\n\
    MOVWF NUM1\n\
    MOVLW 0x06            ; x 6 = 42\n\
    MOVWF NUM2\n\
    CLRF RES_L\n\
    CLRF RES_H\n\
    MOVLW 0x08\n\
    MOVWF COUNT\n\
\n\
MULT_LOOP:\n\
    BCF STATUS, C\n\
    RRF NUM2, F\n\
    BTFSS STATUS, C\n\
    GOTO NO_ADD\n\
    MOVF NUM1, W\n\
    ADDWF RES_L, F\n\
    BTFSC STATUS, C\n\
    INCF RES_H, F\n\
NO_ADD:\n\
    BCF STATUS, C\n\
    RLF NUM1, F\n\
    DECFSZ COUNT, F\n\
    GOTO MULT_LOOP\n\
\n\
    MOVF RES_L, W\n\
    MOVWF PORTB\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
    END'
            },
            // === ADVANCED ===
            {
                category: 'Advanced', name: 'Lookup Table',
                description: 'Use RETLW table for 7-segment display patterns',
                source:
'; Lookup Table - PIC16F84A\n\
; 7-segment display patterns via RETLW table\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    DIGIT\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; 7-seg table: 0-9 (common cathode, a=bit0)\n\
SEGMENT_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0x3F            ; 0\n\
    RETLW 0x06            ; 1\n\
    RETLW 0x5B            ; 2\n\
    RETLW 0x4F            ; 3\n\
    RETLW 0x66            ; 4\n\
    RETLW 0x6D            ; 5\n\
    RETLW 0x7D            ; 6\n\
    RETLW 0x07            ; 7\n\
    RETLW 0x7F            ; 8\n\
    RETLW 0x6F            ; 9\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF DIGIT\n\
\n\
MAIN:\n\
    MOVF DIGIT, W\n\
    CALL SEGMENT_TABLE\n\
    MOVWF PORTB           ; Output pattern\n\
    CALL DELAY\n\
    INCF DIGIT, F\n\
    MOVLW 0x0A\n\
    SUBWF DIGIT, W\n\
    BTFSC STATUS, Z\n\
    CLRF DIGIT            ; Reset at 10\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0x60\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Advanced', name: 'Stack Demo',
                description: 'Nested CALL to demonstrate stack operation',
                source:
'; Stack Demo - PIC16F84A\n\
; Nested subroutines to show stack depth\n\
\n\
    LIST P=16F84A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
    CALL LEVEL1           ; Watch the stack!\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
LEVEL1:\n\
    BSF PORTB, 0\n\
    CALL LEVEL2\n\
    BCF PORTB, 0\n\
    RETURN\n\
\n\
LEVEL2:\n\
    BSF PORTB, 1\n\
    CALL LEVEL3\n\
    BCF PORTB, 1\n\
    RETURN\n\
\n\
LEVEL3:\n\
    BSF PORTB, 2\n\
    CALL LEVEL4\n\
    BCF PORTB, 2\n\
    RETURN\n\
\n\
LEVEL4:\n\
    BSF PORTB, 3          ; Deepest level\n\
    NOP\n\
    BCF PORTB, 3\n\
    RETURN\n\
\n\
    END'
            },
            // === USART (PIC16F628A) ===
            {
                category: 'USART', name: 'Serial Hello World',
                description: 'Send "Hello!" via USART TX (PIC16F628A)',
                source:
'; Serial Hello World - PIC16F628A\n\
; Sends "Hello!" on USART TX at 9600 baud\n\
; Open Serial Terminal panel to see output\n\
\n\
    LIST P=16F628A\n\
\n\
    CBLOCK 0x20\n\
    TEMP\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x19            ; 9600 baud @ 4MHz\n\
    MOVWF SPBRG\n\
    MOVLW 0x24            ; TXEN=1, BRGH=1\n\
    MOVWF TXSTA\n\
    BCF STATUS, RP0\n\
    MOVLW 0x90            ; SPEN=1, CREN=1\n\
    MOVWF RCSTA\n\
\n\
MAIN:\n\
    MOVLW \'H\'\n\
    CALL SEND_CHAR\n\
    MOVLW \'e\'\n\
    CALL SEND_CHAR\n\
    MOVLW \'l\'\n\
    CALL SEND_CHAR\n\
    MOVLW \'l\'\n\
    CALL SEND_CHAR\n\
    MOVLW \'o\'\n\
    CALL SEND_CHAR\n\
    MOVLW \'!\'\n\
    CALL SEND_CHAR\n\
    MOVLW 0x0D            ; CR\n\
    CALL SEND_CHAR\n\
    MOVLW 0x0A            ; LF\n\
    CALL SEND_CHAR\n\
    GOTO MAIN\n\
\n\
SEND_CHAR:\n\
    MOVWF TXREG\n\
TX_WAIT:\n\
    BSF STATUS, RP0\n\
    BTFSS TXSTA, 1        ; Wait TRMT=1\n\
    GOTO TX_WAIT\n\
    BCF STATUS, RP0\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'USART', name: 'Serial Echo',
                description: 'Echo received characters back (PIC16F628A)',
                source:
'; Serial Echo - PIC16F628A\n\
; Receives a character and echoes it back\n\
; Type in Serial Terminal to test\n\
\n\
    LIST P=16F628A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0x19\n\
    MOVWF SPBRG\n\
    MOVLW 0x24\n\
    MOVWF TXSTA\n\
    BCF STATUS, RP0\n\
    MOVLW 0x90\n\
    MOVWF RCSTA\n\
\n\
MAIN:\n\
    BTFSS PIR1, RCIF      ; Wait for RX\n\
    GOTO MAIN\n\
    MOVF RCREG, W         ; Read received byte\n\
    MOVWF TXREG           ; Echo it back\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === ADC (PIC16F877A) ===
            {
                category: 'ADC', name: 'ADC Read Channel 0',
                description: 'Read AN0 and display on PORTB (PIC16F877A)',
                source:
'; ADC Read - PIC16F877A\n\
; Read AN0 analog value, show high byte on PORTB\n\
; Adjust AN0 slider in ADC panel to change value\n\
\n\
    LIST P=16F877A\n\
\n\
    CBLOCK 0x20\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x0E            ; AN0 analog, rest digital\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x41            ; ADON, Fosc/8, CH0\n\
    MOVWF ADCON0\n\
\n\
MAIN:\n\
    BSF ADCON0, GO        ; Start conversion\n\
WAIT_ADC:\n\
    BTFSC ADCON0, GO      ; Wait done\n\
    GOTO WAIT_ADC\n\
\n\
    MOVF ADRESH, W        ; Read result (8 MSB)\n\
    MOVWF PORTB           ; Show on LEDs\n\
\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0x20\n\
    MOVWF DL1\n\
D1: DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'ADC', name: 'ADC Threshold',
                description: 'LED on when AN0 > 2.5V (PIC16F877A)',
                source:
'; ADC Threshold - PIC16F877A\n\
; RB0 LED on when AN0 voltage > 2.5V (~512/1024)\n\
\n\
    LIST P=16F877A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x0E\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
    MOVLW 0x41\n\
    MOVWF ADCON0\n\
    CLRF PORTB\n\
\n\
MAIN:\n\
    BSF ADCON0, GO\n\
WAIT:\n\
    BTFSC ADCON0, GO\n\
    GOTO WAIT\n\
\n\
    MOVF ADRESH, W\n\
    SUBLW 0x80            ; Compare with 128 (=2.5V)\n\
    BTFSS STATUS, C       ; C=0 means ADRESH > 0x80\n\
    GOTO LED_ON\n\
    BCF PORTB, 0\n\
    GOTO MAIN\n\
LED_ON:\n\
    BSF PORTB, 0\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === CCP/PWM (PIC16F628A) ===
            {
                category: 'CCP/PWM', name: 'PWM LED Dimmer',
                description: 'PWM on CCP1 with variable duty cycle (PIC16F628A)',
                source:
'; PWM LED Dimmer - PIC16F628A\n\
; Generates PWM on RB3/CCP1\n\
; Watch CCP/PWM panel for duty cycle bar\n\
\n\
    LIST P=16F628A\n\
\n\
    CBLOCK 0x20\n\
    DUTY\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0xFF            ; PR2 = 255 (period)\n\
    MOVWF PR2\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x04            ; TMR2 on, prescaler 1:1\n\
    MOVWF T2CON\n\
    MOVLW 0x0C            ; PWM mode\n\
    MOVWF CCP1CON\n\
\n\
    CLRF DUTY\n\
\n\
RAMP_UP:\n\
    MOVF DUTY, W\n\
    MOVWF CCPR1L          ; Set duty cycle\n\
    CALL DELAY\n\
    INCF DUTY, F\n\
    BTFSS STATUS, Z       ; Overflow at 256?\n\
    GOTO RAMP_UP\n\
\n\
RAMP_DOWN:\n\
    DECF DUTY, F\n\
    MOVF DUTY, W\n\
    MOVWF CCPR1L\n\
    CALL DELAY\n\
    MOVF DUTY, W\n\
    BTFSS STATUS, Z\n\
    GOTO RAMP_DOWN\n\
    GOTO RAMP_UP\n\
\n\
DELAY:\n\
    MOVLW 0x10\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            // === TIMER1 (PIC16F628A) ===
            {
                category: 'Timers', name: 'Timer1 Overflow',
                description: 'Toggle LED on Timer1 overflow (PIC16F628A)',
                source:
'; Timer1 Overflow - PIC16F628A\n\
; Toggle RB0 when Timer1 overflows\n\
\n\
    LIST P=16F628A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
\n\
    ORG 0x04\n\
ISR:\n\
    BTFSS PIR1, 0         ; TMR1IF?\n\
    RETFIE\n\
    BCF PIR1, 0           ; Clear TMR1IF\n\
    MOVLW 0x01\n\
    XORWF PORTB, F        ; Toggle RB0\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BSF PIE1, 0           ; Enable TMR1 interrupt\n\
    BCF STATUS, RP0\n\
\n\
    CLRF TMR1L\n\
    CLRF TMR1H\n\
    MOVLW 0x01            ; TMR1ON, internal clock, 1:1\n\
    MOVWF T1CON\n\
\n\
    BSF INTCON, PEIE\n\
    BSF INTCON, GIE\n\
\n\
MAIN:\n\
    NOP\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === COMPARATOR (PIC16F628A) ===
            {
                category: 'Comparator', name: 'Voltage Comparator',
                description: 'Compare AN0 vs AN1, result on RB0 (PIC16F628A)',
                source:
'; Voltage Comparator - PIC16F628A\n\
; Compare AN0 > AN1, RB0 shows C1OUT\n\
; Adjust sliders in Comparator panel\n\
\n\
    LIST P=16F628A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
\n\
    MOVLW 0x02            ; Mode 010: 4-input mux\n\
    MOVWF CMCON           ; C1: VIN- = AN0, VIN+ = AN1\n\
    CLRF PORTB\n\
\n\
MAIN:\n\
    BTFSC CMCON, 6        ; Test C1OUT\n\
    GOTO C1_HIGH\n\
    BCF PORTB, 0\n\
    GOTO MAIN\n\
C1_HIGH:\n\
    BSF PORTB, 0\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === MULTI-PORT (PIC16F877A) ===
            {
                category: '877A', name: 'Multi-Port I/O',
                description: 'Use PORTA input, PORTB/C/D output (PIC16F877A)',
                source:
'; Multi-Port I/O - PIC16F877A\n\
; Read PORTA switches, show on PORTB/C/D\n\
\n\
    LIST P=16F877A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0xFF\n\
    MOVWF TRISA           ; PORTA all input\n\
    CLRF TRISB            ; PORTB all output\n\
    CLRF TRISC            ; PORTC all output\n\
    CLRF TRISD            ; PORTD all output\n\
    MOVLW 0x06\n\
    MOVWF ADCON1          ; All digital\n\
    BCF STATUS, RP0\n\
\n\
MAIN:\n\
    MOVF PORTA, W\n\
    MOVWF PORTB           ; Copy to PORTB\n\
    COMF PORTA, W\n\
    MOVWF PORTC           ; Inverted to PORTC\n\
    SWAPF PORTA, W\n\
    MOVWF PORTD           ; Swapped to PORTD\n\
    GOTO MAIN\n\
\n\
    END'
            },
            {
                category: '877A', name: 'ADC + USART',
                description: 'Read ADC, send value via serial (PIC16F877A)',
                source:
'; ADC + USART - PIC16F877A\n\
; Read AN0, send hex value to Serial Terminal\n\
\n\
    LIST P=16F877A\n\
\n\
    CBLOCK 0x20\n\
    ADC_VAL\n\
    TEMP\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x0E\n\
    MOVWF ADCON1\n\
    MOVLW 0x19\n\
    MOVWF SPBRG\n\
    MOVLW 0x24\n\
    MOVWF TXSTA\n\
    BCF STATUS, RP0\n\
    MOVLW 0x90\n\
    MOVWF RCSTA\n\
    MOVLW 0x41\n\
    MOVWF ADCON0\n\
\n\
MAIN:\n\
    BSF ADCON0, GO\n\
WAIT_ADC:\n\
    BTFSC ADCON0, GO\n\
    GOTO WAIT_ADC\n\
\n\
    MOVF ADRESH, W\n\
    MOVWF ADC_VAL\n\
    MOVWF PORTB\n\
\n\
    ; Send high nibble\n\
    SWAPF ADC_VAL, W\n\
    ANDLW 0x0F\n\
    CALL HEX_CHAR\n\
    CALL SEND_CHAR\n\
    ; Send low nibble\n\
    MOVF ADC_VAL, W\n\
    ANDLW 0x0F\n\
    CALL HEX_CHAR\n\
    CALL SEND_CHAR\n\
    ; Send newline\n\
    MOVLW 0x0D\n\
    CALL SEND_CHAR\n\
    MOVLW 0x0A\n\
    CALL SEND_CHAR\n\
    GOTO MAIN\n\
\n\
HEX_CHAR:\n\
    ADDWF PCL, F\n\
    RETLW \'0\'\n\
    RETLW \'1\'\n\
    RETLW \'2\'\n\
    RETLW \'3\'\n\
    RETLW \'4\'\n\
    RETLW \'5\'\n\
    RETLW \'6\'\n\
    RETLW \'7\'\n\
    RETLW \'8\'\n\
    RETLW \'9\'\n\
    RETLW \'A\'\n\
    RETLW \'B\'\n\
    RETLW \'C\'\n\
    RETLW \'D\'\n\
    RETLW \'E\'\n\
    RETLW \'F\'\n\
\n\
SEND_CHAR:\n\
    MOVWF TXREG\n\
TX_WAIT:\n\
    BSF STATUS, RP0\n\
    BTFSS TXSTA, 1\n\
    GOTO TX_WAIT\n\
    BCF STATUS, RP0\n\
    RETURN\n\
\n\
    END'
            },
            // === TMR2 + PWM (PIC16F877A) ===
            {
                category: '877A', name: 'Dual PWM',
                description: 'CCP1 and CCP2 at different duty cycles (PIC16F877A)',
                source:
'; Dual PWM - PIC16F877A\n\
; CCP1 = 25% duty, CCP2 = 75% duty\n\
; Watch CCP/PWM panel for both duty bars\n\
\n\
    LIST P=16F877A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    CLRF TRISC\n\
    MOVLW 0xFF\n\
    MOVWF PR2             ; Period = 255\n\
    BCF STATUS, RP0\n\
\n\
    ; TMR2 on\n\
    MOVLW 0x04\n\
    MOVWF T2CON\n\
\n\
    ; CCP1 = PWM, 25% duty (64/255)\n\
    MOVLW 0x40\n\
    MOVWF CCPR1L\n\
    MOVLW 0x0C\n\
    MOVWF CCP1CON\n\
\n\
    ; CCP2 = PWM, 75% duty (192/255)\n\
    MOVLW 0xC0\n\
    MOVWF CCPR2L\n\
    MOVLW 0x0C\n\
    MOVWF CCP2CON\n\
\n\
MAIN:\n\
    NOP\n\
    GOTO MAIN\n\
\n\
    END'
            },
            // === VIRTUAL HARDWARE EXAMPLES ===
            {
                category: 'Virtual HW', name: '7-Seg Counter',
                description: 'Count 0-9 on 7-segment display (add 7-Seg 1 digit)',
                source:
'; 7-Segment Counter - PIC16F84A\n\
; Counts 0-9 on PORTB 7-segment display\n\
; >> Add "7-Seg (1 digit)" on PORTB in Virtual Hardware\n\
;\n\
; Segment mapping: a=RB0 b=RB1 c=RB2 d=RB3 e=RB4 f=RB5 g=RB6 dp=RB7\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    DIGIT\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; 7-seg lookup: common cathode\n\
;       gfedcba\n\
SEG_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0x3F            ; 0: a,b,c,d,e,f\n\
    RETLW 0x06            ; 1: b,c\n\
    RETLW 0x5B            ; 2: a,b,d,e,g\n\
    RETLW 0x4F            ; 3: a,b,c,d,g\n\
    RETLW 0x66            ; 4: b,c,f,g\n\
    RETLW 0x6D            ; 5: a,c,d,f,g\n\
    RETLW 0x7D            ; 6: a,c,d,e,f,g\n\
    RETLW 0x07            ; 7: a,b,c\n\
    RETLW 0x7F            ; 8: all\n\
    RETLW 0x6F            ; 9: a,b,c,d,f,g\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF DIGIT\n\
\n\
MAIN:\n\
    MOVF DIGIT, W\n\
    CALL SEG_TABLE\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    INCF DIGIT, F\n\
    MOVLW 0x0A\n\
    SUBWF DIGIT, W\n\
    BTFSC STATUS, Z\n\
    CLRF DIGIT\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0x60\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: '7-Seg 4-Digit MUX',
                description: 'Display "1234" on 4 multiplexed 7-seg digits',
                source:
'; 7-Seg 4-Digit Multiplexed - PIC16F84A\n\
; Displays "1234" on 4 digits\n\
; >> Add "7-Seg (4 digit, mux)" in Virtual Hardware\n\
;\n\
; PORTB = segments (a-g, dp)\n\
; PORTA = digit select (active low): RA0=D1, RA1=D2, RA2=D3, RA3=D4\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    DIG_IDX\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
SEG_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0x3F            ; 0\n\
    RETLW 0x06            ; 1\n\
    RETLW 0x5B            ; 2\n\
    RETLW 0x4F            ; 3\n\
    RETLW 0x66            ; 4\n\
    RETLW 0x6D            ; 5\n\
    RETLW 0x7D            ; 6\n\
    RETLW 0x07            ; 7\n\
    RETLW 0x7F            ; 8\n\
    RETLW 0x6F            ; 9\n\
\n\
; Digits to display: 1, 2, 3, 4\n\
DIGIT_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0x01            ; digit 0 shows "1"\n\
    RETLW 0x02            ; digit 1 shows "2"\n\
    RETLW 0x03            ; digit 2 shows "3"\n\
    RETLW 0x04            ; digit 3 shows "4"\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB            ; PORTB output (segments)\n\
    CLRF TRISA            ; PORTA output (digit select)\n\
    BCF STATUS, RP0\n\
\n\
MUX_LOOP:\n\
    CLRF DIG_IDX\n\
\n\
SHOW_DIGIT:\n\
    ; All digits off\n\
    MOVLW 0x0F\n\
    MOVWF PORTA\n\
\n\
    ; Get segment pattern\n\
    MOVF DIG_IDX, W\n\
    CALL DIGIT_TABLE\n\
    CALL SEG_TABLE\n\
    MOVWF PORTB\n\
\n\
    ; Enable current digit (active low)\n\
    MOVLW 0x01\n\
    MOVWF DL1\n\
    MOVF DIG_IDX, W\n\
    BTFSC STATUS, Z\n\
    GOTO SEL_DONE\n\
SHIFT_SEL:\n\
    BCF STATUS, C\n\
    RLF DL1, F\n\
    DECFSZ DIG_IDX, W\n\
    GOTO SHIFT_SEL\n\
SEL_DONE:\n\
    COMF DL1, W\n\
    ANDLW 0x0F\n\
    MOVWF PORTA\n\
\n\
    ; Short delay for persistence\n\
    CALL SHORT_DLY\n\
\n\
    ; Next digit\n\
    INCF DIG_IDX, F\n\
    MOVLW 0x04\n\
    SUBWF DIG_IDX, W\n\
    BTFSS STATUS, Z\n\
    GOTO SHOW_DIGIT\n\
    GOTO MUX_LOOP\n\
\n\
SHORT_DLY:\n\
    MOVLW 0x20\n\
    MOVWF DL1\n\
SD1:\n\
    DECFSZ DL1, F\n\
    GOTO SD1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'LED Bar VU Meter',
                description: 'ADC controls LED bar like a VU meter (877A)',
                source:
'; LED Bar VU Meter - PIC16F877A\n\
; AN0 slider controls LED bar on PORTB\n\
; >> Add "LED Bar" on PORTB (8 LED, green) in Virtual HW\n\
; >> Adjust AN0 slider in ADC panel\n\
\n\
    LIST P=16F877A\n\
\n\
    CBLOCK 0x20\n\
    ADC_VAL\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; Lookup: ADC high byte -> bar pattern\n\
BAR_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0x00            ; 0:   ........\n\
    RETLW 0x01            ; 1:   *.......\n\
    RETLW 0x03            ; 2:   **......\n\
    RETLW 0x07            ; 3:   ***..... \n\
    RETLW 0x0F            ; 4:   ****....\n\
    RETLW 0x1F            ; 5:   *****...\n\
    RETLW 0x3F            ; 6:   ******.. \n\
    RETLW 0x7F            ; 7:   *******.\n\
    RETLW 0xFF            ; 8:   ********\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x0E\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
    MOVLW 0x41\n\
    MOVWF ADCON0\n\
\n\
MAIN:\n\
    BSF ADCON0, GO\n\
WAIT:\n\
    BTFSC ADCON0, GO\n\
    GOTO WAIT\n\
\n\
    ; Scale ADRESH (0-255) to 0-8\n\
    MOVF ADRESH, W\n\
    MOVWF ADC_VAL\n\
    ; Divide by 32: shift right 5 times\n\
    BCF STATUS, C\n\
    RRF ADC_VAL, F\n\
    BCF STATUS, C\n\
    RRF ADC_VAL, F\n\
    BCF STATUS, C\n\
    RRF ADC_VAL, F\n\
    BCF STATUS, C\n\
    RRF ADC_VAL, F\n\
    BCF STATUS, C\n\
    RRF ADC_VAL, F\n\
\n\
    MOVF ADC_VAL, W\n\
    CALL BAR_TABLE\n\
    MOVWF PORTB\n\
    GOTO MAIN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'Buttons + LEDs',
                description: '4 buttons on PORTA control 4 LEDs on PORTB',
                source:
'; Buttons + LEDs - PIC16F84A\n\
; RA0-RA3 buttons toggle RB0-RB3 LEDs\n\
; >> Add "4 Buttons" on PORTA and "LED Bar" on PORTB in Virtual HW\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    PREV\n\
    LEDS\n\
    TEMP\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0xFF\n\
    MOVWF TRISA           ; PORTA input\n\
    CLRF TRISB            ; PORTB output\n\
    BCF STATUS, RP0\n\
    CLRF LEDS\n\
    CLRF PREV\n\
    CLRF PORTB\n\
\n\
MAIN:\n\
    ; Read current buttons\n\
    MOVF PORTA, W\n\
    ANDLW 0x0F\n\
    MOVWF TEMP\n\
\n\
    ; Detect rising edge (new press)\n\
    COMF PREV, W\n\
    ANDWF TEMP, W          ; W = buttons just pressed\n\
\n\
    ; Toggle corresponding LEDs\n\
    XORWF LEDS, F\n\
    MOVF LEDS, W\n\
    MOVWF PORTB\n\
\n\
    ; Save current as previous\n\
    MOVF TEMP, W\n\
    MOVWF PREV\n\
    GOTO MAIN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'DIP Switch + 7-Seg',
                description: 'DIP switch value displayed on 7-segment',
                source:
'; DIP Switch + 7-Seg - PIC16F84A\n\
; Read DIP switch low nibble on PORTA, show hex on PORTB 7-seg\n\
; >> Add "DIP Switch" on PORTA and "7-Seg" on PORTB in Virtual HW\n\
; >> Configure DIP: port=A, count=4\n\
\n\
    LIST P=16F84A\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; Hex 7-seg table (0-F)\n\
HEX_SEG:\n\
    ADDWF PCL, F\n\
    RETLW 0x3F            ; 0\n\
    RETLW 0x06            ; 1\n\
    RETLW 0x5B            ; 2\n\
    RETLW 0x4F            ; 3\n\
    RETLW 0x66            ; 4\n\
    RETLW 0x6D            ; 5\n\
    RETLW 0x7D            ; 6\n\
    RETLW 0x07            ; 7\n\
    RETLW 0x7F            ; 8\n\
    RETLW 0x6F            ; 9\n\
    RETLW 0x77            ; A\n\
    RETLW 0x7C            ; b\n\
    RETLW 0x39            ; C\n\
    RETLW 0x5E            ; d\n\
    RETLW 0x79            ; E\n\
    RETLW 0x71            ; F\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0xFF\n\
    MOVWF TRISA\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
\n\
MAIN:\n\
    MOVF PORTA, W\n\
    ANDLW 0x0F\n\
    CALL HEX_SEG\n\
    MOVWF PORTB\n\
    GOTO MAIN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'LCD Hello World (8-bit)',
                description: 'Display "Hello World!" on LCD 16x2 8-bit mode (877A)',
                source:
'; LCD Hello World (8-bit) - PIC16F877A\n\
; >> Add "LCD 16x2 (8-bit)" Data=PORTB, Ctrl=PORTD, RS=RD0, EN=RD2\n\
;\n\
; PORTB = D0-D7 (data bus)\n\
; PORTD: RD0=RS, RD2=EN\n\
\n\
    LIST P=16F877A\n\
\n\
RS  EQU 0                  ; PORTD bit 0\n\
EN  EQU 2                  ; PORTD bit 2\n\
\n\
    CBLOCK 0x20\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB            ; PORTB output (data)\n\
    CLRF TRISD            ; PORTD output (control)\n\
    MOVLW 0x06\n\
    MOVWF ADCON1          ; All digital\n\
    BCF STATUS, RP0\n\
    CLRF PORTD\n\
\n\
    ; LCD init sequence\n\
    CALL DELAY_5MS\n\
    MOVLW 0x38            ; Function set: 8-bit, 2-line, 5x8\n\
    CALL LCD_CMD\n\
    MOVLW 0x0C            ; Display ON, cursor OFF\n\
    CALL LCD_CMD\n\
    MOVLW 0x06            ; Entry mode: increment, no shift\n\
    CALL LCD_CMD\n\
    MOVLW 0x01            ; Clear display\n\
    CALL LCD_CMD\n\
    CALL DELAY_5MS\n\
\n\
    ; Write "Hello World!"\n\
    MOVLW \'H\'\n\
    CALL LCD_DATA\n\
    MOVLW \'e\'\n\
    CALL LCD_DATA\n\
    MOVLW \'l\'\n\
    CALL LCD_DATA\n\
    MOVLW \'l\'\n\
    CALL LCD_DATA\n\
    MOVLW \'o\'\n\
    CALL LCD_DATA\n\
    MOVLW \' \'\n\
    CALL LCD_DATA\n\
    MOVLW \'W\'\n\
    CALL LCD_DATA\n\
    MOVLW \'o\'\n\
    CALL LCD_DATA\n\
    MOVLW \'r\'\n\
    CALL LCD_DATA\n\
    MOVLW \'l\'\n\
    CALL LCD_DATA\n\
    MOVLW \'d\'\n\
    CALL LCD_DATA\n\
    MOVLW \'!\'\n\
    CALL LCD_DATA\n\
\n\
    ; Move to line 2\n\
    MOVLW 0xC0            ; Set DDRAM addr to 0x40 (line 2)\n\
    CALL LCD_CMD\n\
\n\
    MOVLW \'P\'\n\
    CALL LCD_DATA\n\
    MOVLW \'I\'\n\
    CALL LCD_DATA\n\
    MOVLW \'C\'\n\
    CALL LCD_DATA\n\
    MOVLW \'1\'\n\
    CALL LCD_DATA\n\
    MOVLW \'6\'\n\
    CALL LCD_DATA\n\
    MOVLW \'F\'\n\
    CALL LCD_DATA\n\
    MOVLW \'8\'\n\
    CALL LCD_DATA\n\
    MOVLW \'7\'\n\
    CALL LCD_DATA\n\
    MOVLW \'7\'\n\
    CALL LCD_DATA\n\
    MOVLW \'A\'\n\
    CALL LCD_DATA\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; === LCD ROUTINES ===\n\
LCD_CMD:\n\
    MOVWF PORTB           ; Data on bus\n\
    BCF PORTD, RS         ; RS=0 (command)\n\
    BSF PORTD, EN         ; EN=1\n\
    NOP\n\
    BCF PORTD, EN         ; EN=0 (latch)\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
LCD_DATA:\n\
    MOVWF PORTB\n\
    BSF PORTD, RS         ; RS=1 (data)\n\
    BSF PORTD, EN\n\
    NOP\n\
    BCF PORTD, EN\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
DELAY_1MS:\n\
    MOVLW 0x10\n\
    MOVWF DL1\n\
D1: DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
DELAY_5MS:\n\
    MOVLW 0x05\n\
    MOVWF DL2\n\
D5: CALL DELAY_1MS\n\
    DECFSZ DL2, F\n\
    GOTO D5\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'LCD 4-bit Mode',
                description: 'LCD 16x2 in 4-bit mode, single port (PIC16F84A)',
                source:
'; LCD 4-bit Mode - PIC16F84A\n\
; >> Add "LCD 16x2 (4-bit)" Port=B, data bits 4-7, RS=RB0, EN=RB2\n\
;\n\
; PORTB: RB0=RS, RB2=EN, RB4-RB7=D4-D7\n\
\n\
    LIST P=16F84A\n\
\n\
RS  EQU 0\n\
EN  EQU 2\n\
\n\
    CBLOCK 0x0C\n\
    LCD_TEMP\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
    ; LCD init: send 0x30 three times (8-bit mode), then 0x20 (4-bit)\n\
    CALL DELAY_5MS\n\
    MOVLW 0x30\n\
    CALL LCD_NIBBLE_CMD\n\
    CALL DELAY_5MS\n\
    MOVLW 0x30\n\
    CALL LCD_NIBBLE_CMD\n\
    CALL DELAY_1MS\n\
    MOVLW 0x30\n\
    CALL LCD_NIBBLE_CMD\n\
    MOVLW 0x20            ; Switch to 4-bit\n\
    CALL LCD_NIBBLE_CMD\n\
\n\
    ; Now in 4-bit mode\n\
    MOVLW 0x28            ; 4-bit, 2-line, 5x8\n\
    CALL LCD_CMD4\n\
    MOVLW 0x0C            ; Display ON, cursor OFF\n\
    CALL LCD_CMD4\n\
    MOVLW 0x06            ; Entry mode: increment\n\
    CALL LCD_CMD4\n\
    MOVLW 0x01            ; Clear\n\
    CALL LCD_CMD4\n\
    CALL DELAY_5MS\n\
\n\
    ; Write text\n\
    MOVLW \'H\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'e\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'l\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'l\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'o\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'!\'\n\
    CALL LCD_DATA4\n\
\n\
    ; Line 2\n\
    MOVLW 0xC0\n\
    CALL LCD_CMD4\n\
    MOVLW \'4\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'-\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'b\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'i\'\n\
    CALL LCD_DATA4\n\
    MOVLW \'t\'\n\
    CALL LCD_DATA4\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; === LCD 4-BIT ROUTINES ===\n\
; Send high nibble only (for init sequence)\n\
LCD_NIBBLE_CMD:\n\
    ANDLW 0xF0            ; Keep high nibble\n\
    MOVWF PORTB           ; RB4-7 = data, RS=0 (bit0=0)\n\
    BSF PORTB, EN\n\
    NOP\n\
    BCF PORTB, EN\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
; Send 8-bit command in two nibbles\n\
LCD_CMD4:\n\
    MOVWF LCD_TEMP\n\
    ; High nibble\n\
    MOVF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    MOVWF PORTB           ; RS=0\n\
    BSF PORTB, EN\n\
    NOP\n\
    BCF PORTB, EN\n\
    ; Low nibble\n\
    SWAPF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    MOVWF PORTB           ; RS=0\n\
    BSF PORTB, EN\n\
    NOP\n\
    BCF PORTB, EN\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
; Send 8-bit data in two nibbles\n\
LCD_DATA4:\n\
    MOVWF LCD_TEMP\n\
    ; High nibble + RS=1\n\
    MOVF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW 0x01            ; RS=1\n\
    MOVWF PORTB\n\
    BSF PORTB, EN\n\
    NOP\n\
    BCF PORTB, EN\n\
    ; Low nibble + RS=1\n\
    SWAPF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW 0x01            ; RS=1\n\
    MOVWF PORTB\n\
    BSF PORTB, EN\n\
    NOP\n\
    BCF PORTB, EN\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
DELAY_1MS:\n\
    MOVLW 0x10\n\
    MOVWF DL1\n\
DM1:\n\
    DECFSZ DL1, F\n\
    GOTO DM1\n\
    RETURN\n\
\n\
DELAY_5MS:\n\
    MOVLW 0x05\n\
    MOVWF DL2\n\
DM5:\n\
    CALL DELAY_1MS\n\
    DECFSZ DL2, F\n\
    GOTO DM5\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'LCD I\u00B2C (PCF8574)',
                description: 'LCD via I2C PCF8574 module (PIC16F877A)',
                source:
'; LCD I2C via PCF8574 - PIC16F877A\n\
; >> Select PIC16F877A, then add "LCD I2C (PCF8574)" in Virtual HW\n\
;\n\
; PCF8574 @ 0x27: P0=RS, P1=RW, P2=EN, P3=BL, P4-P7=D4-D7\n\
; Uses MSSP I2C Master mode\n\
\n\
    LIST P=16F877A\n\
\n\
PCF_ADDR EQU 0x27         ; PCF8574 I2C address\n\
LCD_BL   EQU 0x08         ; Backlight bit (P3)\n\
LCD_EN   EQU 0x04         ; Enable bit (P2)\n\
LCD_RS   EQU 0x01         ; RS bit (P0)\n\
\n\
    CBLOCK 0x20\n\
    LCD_TEMP\n\
    I2C_DATA\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    ; I2C: SDA=RC4, SCL=RC3 as inputs (I2C master controls them)\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1          ; All digital\n\
    ; SSPADD = baud rate: 100kHz @ 4MHz -> SSPADD = 9\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
\n\
    ; SSPCON: I2C master mode, SSPEN=1\n\
    MOVLW 0x28            ; SSPEN + I2C master (FOSC/4*(SSPADD+1))\n\
    MOVWF SSPCON\n\
\n\
    CALL DELAY_5MS\n\
\n\
    ; LCD init (4-bit via I2C)\n\
    MOVLW 0x30\n\
    CALL LCD_I2C_NIBBLE\n\
    CALL DELAY_5MS\n\
    MOVLW 0x30\n\
    CALL LCD_I2C_NIBBLE\n\
    CALL DELAY_1MS\n\
    MOVLW 0x30\n\
    CALL LCD_I2C_NIBBLE\n\
    MOVLW 0x20\n\
    CALL LCD_I2C_NIBBLE   ; 4-bit mode\n\
\n\
    MOVLW 0x28\n\
    CALL LCD_I2C_CMD      ; 4-bit, 2-line\n\
    MOVLW 0x0C\n\
    CALL LCD_I2C_CMD      ; Display ON\n\
    MOVLW 0x06\n\
    CALL LCD_I2C_CMD      ; Entry mode\n\
    MOVLW 0x01\n\
    CALL LCD_I2C_CMD      ; Clear\n\
    CALL DELAY_5MS\n\
\n\
    ; Write "I2C LCD!"\n\
    MOVLW \'I\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'2\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'C\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \' \'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'L\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'C\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'D\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'!\'\n\
    CALL LCD_I2C_DATA\n\
\n\
    ; Line 2\n\
    MOVLW 0xC0\n\
    CALL LCD_I2C_CMD\n\
    MOVLW \'P\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'C\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'F\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'8\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'5\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'7\'\n\
    CALL LCD_I2C_DATA\n\
    MOVLW \'4\'\n\
    CALL LCD_I2C_DATA\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; ============================================\n\
;  LCD I2C ROUTINES\n\
; ============================================\n\
\n\
; Send command byte (RS=0)\n\
LCD_I2C_CMD:\n\
    MOVWF LCD_TEMP\n\
    ; High nibble\n\
    MOVF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW LCD_BL          ; Backlight on\n\
    CALL I2C_LCD_PULSE\n\
    ; Low nibble\n\
    SWAPF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW LCD_BL\n\
    CALL I2C_LCD_PULSE\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
; Send data byte (RS=1)\n\
LCD_I2C_DATA:\n\
    MOVWF LCD_TEMP\n\
    ; High nibble + RS\n\
    MOVF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW LCD_BL | LCD_RS ; BL + RS\n\
    CALL I2C_LCD_PULSE\n\
    ; Low nibble + RS\n\
    SWAPF LCD_TEMP, W\n\
    ANDLW 0xF0\n\
    IORLW LCD_BL | LCD_RS\n\
    CALL I2C_LCD_PULSE\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
; Send nibble only (for init)\n\
LCD_I2C_NIBBLE:\n\
    ANDLW 0xF0\n\
    IORLW LCD_BL\n\
    CALL I2C_LCD_PULSE\n\
    CALL DELAY_1MS\n\
    RETURN\n\
\n\
; Pulse EN: send data with EN=1 then EN=0 via I2C\n\
I2C_LCD_PULSE:\n\
    MOVWF I2C_DATA\n\
    ; Send with EN=1\n\
    MOVF I2C_DATA, W\n\
    IORLW LCD_EN\n\
    CALL I2C_WRITE_BYTE\n\
    ; Send with EN=0\n\
    MOVF I2C_DATA, W\n\
    CALL I2C_WRITE_BYTE\n\
    RETURN\n\
\n\
; ============================================\n\
;  I2C LOW-LEVEL (MSSP Master)\n\
; ============================================\n\
\n\
I2C_WRITE_BYTE:\n\
    MOVWF I2C_DATA\n\
    ; START\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0        ; SEN: Start\n\
I2C_W1:\n\
    BTFSC SSPCON2, 0\n\
    GOTO I2C_W1\n\
    BCF STATUS, RP0\n\
    ; Send address (write: 0x27 << 1 | 0 = 0x4E)\n\
    MOVLW 0x4E\n\
    MOVWF SSPBUF\n\
    CALL I2C_WAIT\n\
    ; Send data\n\
    MOVF I2C_DATA, W\n\
    MOVWF SSPBUF\n\
    CALL I2C_WAIT\n\
    ; STOP\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2        ; PEN: Stop\n\
I2C_W2:\n\
    BTFSC SSPCON2, 2\n\
    GOTO I2C_W2\n\
    BCF STATUS, RP0\n\
    RETURN\n\
\n\
I2C_WAIT:\n\
    BSF STATUS, RP0\n\
    BTFSC SSPSTAT, 2      ; R_W bit: 1=in progress\n\
    GOTO I2C_WAIT\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF       ; Clear flag\n\
    RETURN\n\
\n\
DELAY_1MS:\n\
    MOVLW 0x10\n\
    MOVWF DL1\n\
DI1:\n\
    DECFSZ DL1, F\n\
    GOTO DI1\n\
    RETURN\n\
\n\
DELAY_5MS:\n\
    MOVLW 0x05\n\
    MOVWF DL2\n\
DI5:\n\
    CALL DELAY_1MS\n\
    DECFSZ DL2, F\n\
    GOTO DI5\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'RTC DS1307 Read',
                description: 'Read time from DS1307 RTC, show seconds on PORTB (877A)',
                source:
'; RTC DS1307 Read - PIC16F877A\n\
; >> Select PIC16F877A, add "RTC DS1307" in Virtual HW\n\
; Reads seconds from DS1307 and shows BCD on PORTB\n\
\n\
    LIST P=16F877A\n\
\n\
RTC_W    EQU 0xD0\n\
RTC_R    EQU 0xD1\n\
\n\
    CBLOCK 0x20\n\
    RTC_SEC\n\
    RTC_MIN\n\
    RTC_HR\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Start oscillator: write 0x00 to reg 0 (CH=0)\n\
    CALL I2C_START\n\
    MOVLW RTC_W\n\
    CALL I2C_SEND\n\
    MOVLW 0x00\n\
    CALL I2C_SEND\n\
    MOVLW 0x00\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
\n\
READ_LOOP:\n\
    ; Point to register 0\n\
    CALL I2C_START\n\
    MOVLW RTC_W\n\
    CALL I2C_SEND\n\
    MOVLW 0x00\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
\n\
    ; Read sec, min, hr\n\
    CALL I2C_START\n\
    MOVLW RTC_R\n\
    CALL I2C_SEND\n\
    CALL I2C_RD_ACK\n\
    MOVWF RTC_SEC\n\
    CALL I2C_RD_ACK\n\
    MOVWF RTC_MIN\n\
    CALL I2C_RD_NACK\n\
    MOVWF RTC_HR\n\
    CALL I2C_STOP\n\
\n\
    MOVF RTC_SEC, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO READ_LOOP\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
S1: BTFSC SSPCON2, 0\n\
    GOTO S1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
P1: BTFSC SSPCON2, 2\n\
    GOTO P1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_SEND:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
W1: BTFSC SSPSTAT, 2\n\
    GOTO W1\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RD_ACK:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
A1: BTFSC SSPCON2, 3\n\
    GOTO A1\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
A2: BTFSC SSPCON2, 4\n\
    GOTO A2\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RD_NACK:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
N1: BTFSC SSPCON2, 3\n\
    GOTO N1\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
N2: BTFSC SSPCON2, 4\n\
    GOTO N2\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'EEPROM 24C02 Write',
                description: 'Write pattern to external I2C EEPROM (877A)',
                source:
'; EEPROM 24C02 I2C - PIC16F877A\n\
; >> Select PIC16F877A, add "EEPROM 24C02" in Virtual HW\n\
; Writes values 0x00,0x11,0x22..0xFF to addresses 0-15\n\
\n\
    LIST P=16F877A\n\
\n\
EE_W     EQU 0xA0\n\
EE_R     EQU 0xA1\n\
\n\
    CBLOCK 0x20\n\
    COUNT\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Write 16 bytes\n\
    CLRF COUNT\n\
WR_LOOP:\n\
    CALL I2C_START\n\
    MOVLW EE_W\n\
    CALL I2C_SEND\n\
    MOVF COUNT, W\n\
    CALL I2C_SEND          ; Address\n\
    SWAPF COUNT, W\n\
    ADDWF COUNT, W         ; Data = N*0x11\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
    CALL SHORT_DLY\n\
    INCF COUNT, F\n\
    MOVF COUNT, W\n\
    MOVWF PORTB            ; Show progress\n\
    MOVLW 0x10\n\
    SUBWF COUNT, W\n\
    BTFSS STATUS, Z\n\
    GOTO WR_LOOP\n\
\n\
    ; Read back addr 0 to verify\n\
    CALL I2C_START\n\
    MOVLW EE_W\n\
    CALL I2C_SEND\n\
    MOVLW 0x00\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW EE_R\n\
    CALL I2C_SEND\n\
    CALL I2C_RD_NACK\n\
    MOVWF PORTB            ; Show first byte\n\
    CALL I2C_STOP\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
S1: BTFSC SSPCON2, 0\n\
    GOTO S1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
P1: BTFSC SSPCON2, 2\n\
    GOTO P1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_SEND:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
W1: BTFSC SSPSTAT, 2\n\
    GOTO W1\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RD_NACK:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
N1: BTFSC SSPCON2, 3\n\
    GOTO N1\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
N2: BTFSC SSPCON2, 4\n\
    GOTO N2\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
SHORT_DLY:\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
SD: DECFSZ DL1, F\n\
    GOTO SD\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'BMP280 Read Temp',
                description: 'Read chip ID and temperature raw from BMP280 (877A)',
                source:
'; BMP280 Read - PIC16F877A\n\
; >> Select PIC16F877A, add "BMP280" in Virtual HW\n\
; Reads chip ID (0x58), configures forced mode, reads temp raw\n\
;\n\
; BMP280 @ 0x76: ID=0xD0, ctrl_meas=0xF4, temp=0xFA-0xFC\n\
\n\
    LIST P=16F877A\n\
\n\
BMP_W    EQU 0xEC          ; 0x76 << 1 | 0\n\
BMP_R    EQU 0xED          ; 0x76 << 1 | 1\n\
\n\
    CBLOCK 0x20\n\
    CHIP_ID\n\
    TEMP_MSB\n\
    TEMP_LSB\n\
    TEMP_XLSB\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Read chip ID (reg 0xD0)\n\
    CALL I2C_START\n\
    MOVLW BMP_W\n\
    CALL I2C_SEND\n\
    MOVLW 0xD0            ; Register = chip_id\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW BMP_R\n\
    CALL I2C_SEND\n\
    CALL I2C_RD_NACK\n\
    MOVWF CHIP_ID          ; Should be 0x58\n\
    CALL I2C_STOP\n\
    MOVF CHIP_ID, W\n\
    MOVWF PORTB            ; Show chip ID on LEDs\n\
\n\
    ; Configure: osrs_t=x2, osrs_p=x16, forced mode\n\
    ; ctrl_meas = 0b01010101 = 0x55\n\
    CALL I2C_START\n\
    MOVLW BMP_W\n\
    CALL I2C_SEND\n\
    MOVLW 0xF4            ; ctrl_meas register\n\
    CALL I2C_SEND\n\
    MOVLW 0x55            ; osrs_t=010, osrs_p=101, mode=01(forced)\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
\n\
    CALL SHORT_DLY\n\
\n\
    ; Read temperature raw (3 bytes from 0xFA)\n\
    CALL I2C_START\n\
    MOVLW BMP_W\n\
    CALL I2C_SEND\n\
    MOVLW 0xFA\n\
    CALL I2C_SEND\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW BMP_R\n\
    CALL I2C_SEND\n\
    CALL I2C_RD_ACK\n\
    MOVWF TEMP_MSB\n\
    CALL I2C_RD_ACK\n\
    MOVWF TEMP_LSB\n\
    CALL I2C_RD_NACK\n\
    MOVWF TEMP_XLSB\n\
    CALL I2C_STOP\n\
\n\
    ; Show MSB on PORTB\n\
    MOVF TEMP_MSB, W\n\
    MOVWF PORTB\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; === I2C ===\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
S1: BTFSC SSPCON2, 0\n\
    GOTO S1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
P1: BTFSC SSPCON2, 2\n\
    GOTO P1\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_SEND:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
W1: BTFSC SSPSTAT, 2\n\
    GOTO W1\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RD_ACK:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
A1: BTFSC SSPCON2, 3\n\
    GOTO A1\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
A2: BTFSC SSPCON2, 4\n\
    GOTO A2\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RD_NACK:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
N1: BTFSC SSPCON2, 3\n\
    GOTO N1\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
N2: BTFSC SSPCON2, 4\n\
    GOTO N2\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
SHORT_DLY:\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
SD: DECFSZ DL1, F\n\
    GOTO SD\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'LM75 Read Temp',
                description: 'Read temperature from LM75 sensor (877A)',
                source:
'; LM75 Read Temperature - PIC16F877A\n\
; >> Select PIC16F877A, add "LM75 Temp" in Virtual HW\n\
; LM75 @ 0x48: pointer 0 -> 2 bytes (MSB=degrees, LSB.7=0.5C)\n\
\n\
    LIST P=16F877A\n\
\n\
LM75_W   EQU 0x90\n\
LM75_R   EQU 0x91\n\
\n\
    CBLOCK 0x20\n\
    TEMP_MSB\n\
    TEMP_LSB\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
READ_LOOP:\n\
    CALL I2C_START\n\
    MOVLW LM75_W\n\
    CALL I2C_TX\n\
    MOVLW 0x00\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW LM75_R\n\
    CALL I2C_TX\n\
    CALL I2C_RXA\n\
    MOVWF TEMP_MSB\n\
    CALL I2C_RXN\n\
    MOVWF TEMP_LSB\n\
    CALL I2C_STOP\n\
    MOVF TEMP_MSB, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO READ_LOOP\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
LS: BTFSC SSPCON2, 0\n\
    GOTO LS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
LP: BTFSC SSPCON2, 2\n\
    GOTO LP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
LW: BTFSC SSPSTAT, 2\n\
    GOTO LW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RXA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
LA: BTFSC SSPCON2, 3\n\
    GOTO LA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
LB: BTFSC SSPCON2, 4\n\
    GOTO LB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RXN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
LC: BTFSC SSPCON2, 3\n\
    GOTO LC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
LD: BTFSC SSPCON2, 4\n\
    GOTO LD\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'SHT21 Temp + Humidity',
                description: 'Read temp and humidity from SHT21 (877A)',
                source:
'; SHT21 Temp + Humidity - PIC16F877A\n\
; >> Select PIC16F877A, add "SHT21 Temp/Humidity" in Virtual HW\n\
; Reads temp (0xE3) then humidity (0xE5), alternates on PORTB\n\
; SHT21 @ 0x40: 3 bytes per reading (MSB, LSB, CRC)\n\
\n\
    LIST P=16F877A\n\
\n\
SHT_W    EQU 0x80\n\
SHT_R    EQU 0x81\n\
\n\
    CBLOCK 0x20\n\
    T_MSB\n\
    T_LSB\n\
    H_MSB\n\
    H_LSB\n\
    CRC_B\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
MAIN:\n\
    ; -- Temperature --\n\
    CALL I2C_START\n\
    MOVLW SHT_W\n\
    CALL I2C_TX\n\
    MOVLW 0xE3\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW SHT_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF T_MSB\n\
    CALL I2C_RA\n\
    MOVWF T_LSB\n\
    CALL I2C_RN\n\
    MOVWF CRC_B\n\
    CALL I2C_STOP\n\
    MOVF T_MSB, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
\n\
    ; -- Humidity --\n\
    CALL I2C_START\n\
    MOVLW SHT_W\n\
    CALL I2C_TX\n\
    MOVLW 0xE5\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW SHT_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF H_MSB\n\
    CALL I2C_RA\n\
    MOVWF H_LSB\n\
    CALL I2C_RN\n\
    MOVWF CRC_B\n\
    CALL I2C_STOP\n\
    MOVF H_MSB, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
SS: BTFSC SSPCON2, 0\n\
    GOTO SS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
SP: BTFSC SSPCON2, 2\n\
    GOTO SP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
SW: BTFSC SSPSTAT, 2\n\
    GOTO SW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
SA: BTFSC SSPCON2, 3\n\
    GOTO SA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
SB: BTFSC SSPCON2, 4\n\
    GOTO SB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
SC: BTFSC SSPCON2, 3\n\
    GOTO SC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
SE: BTFSC SSPCON2, 4\n\
    GOTO SE\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'MCP23017 I/O Expander',
                description: 'Set Port A output, read Port B input (877A)',
                source:
'; MCP23017 I/O Expander - PIC16F877A\n\
; >> Select PIC16F877A, add "MCP23017 16-I/O" in Virtual HW\n\
; Port A = output (counter), Port B = input\n\
;\n\
; MCP23017 @ 0x20 (BANK=0 mode)\n\
; Reg 0x00=IODIRA, 0x01=IODIRB, 0x14=OLATA, 0x12=GPIOA\n\
\n\
    LIST P=16F877A\n\
\n\
MCP_W    EQU 0x40          ; 0x20 << 1 | 0\n\
MCP_R    EQU 0x41\n\
\n\
    CBLOCK 0x20\n\
    COUNT\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Config: IODIRA=0x00 (all output), IODIRB=0xFF (all input)\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x00             ; Register IODIRA\n\
    CALL I2C_TX\n\
    MOVLW 0x00             ; Port A = all output\n\
    CALL I2C_TX\n\
    MOVLW 0xFF             ; Port B = all input (auto-increment to IODIRB)\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
    CLRF COUNT\n\
\n\
MAIN:\n\
    ; Write counter to Port A (OLATA = reg 0x14)\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x14             ; OLATA\n\
    CALL I2C_TX\n\
    MOVF COUNT, W\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
    ; Also show on PORTB\n\
    MOVF COUNT, W\n\
    MOVWF PORTB\n\
\n\
    CALL DELAY\n\
    INCF COUNT, F\n\
    GOTO MAIN\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
MS: BTFSC SSPCON2, 0\n\
    GOTO MS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
MP: BTFSC SSPCON2, 2\n\
    GOTO MP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
MW: BTFSC SSPSTAT, 2\n\
    GOTO MW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
MD: MOVLW 0xFF\n\
    MOVWF DL2\n\
ME: DECFSZ DL2, F\n\
    GOTO ME\n\
    DECFSZ DL1, F\n\
    GOTO MD\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'SPI Devices', name: '74HC595 Shift Register',
                description: 'Shift out a pattern to 74HC595 LEDs (877A)',
                source:
'; 74HC595 Shift Register - PIC16F877A\n\
; >> Select PIC16F877A, add "74HC595 Shift Reg" in Virtual HW\n\
; Shifts out Knight Rider pattern via SPI\n\
;\n\
; MSSP SPI: SDO=RC5, SCK=RC3, Latch=RA0\n\
\n\
    LIST P=16F877A\n\
\n\
LATCH    EQU 0             ; RA0 = latch pin\n\
\n\
    CBLOCK 0x20\n\
    PATTERN\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISA\n\
    CLRF TRISB\n\
    MOVLW 0x10             ; SDI=RC4 input, rest output\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
\n\
    ; SPI master mode, Fosc/16\n\
    MOVLW 0x21             ; SSPEN + SPI master Fosc/16\n\
    MOVWF SSPCON\n\
    BCF PORTA, LATCH\n\
\n\
    MOVLW 0x01\n\
    MOVWF PATTERN\n\
\n\
SHIFT_L:\n\
    MOVF PATTERN, W\n\
    CALL SPI_SEND\n\
    CALL LATCH_OUT\n\
    CALL DELAY\n\
    BCF STATUS, C\n\
    RLF PATTERN, F\n\
    BTFSS PATTERN, 7\n\
    GOTO SHIFT_L\n\
    MOVF PATTERN, W\n\
    CALL SPI_SEND\n\
    CALL LATCH_OUT\n\
    CALL DELAY\n\
\n\
SHIFT_R:\n\
    BCF STATUS, C\n\
    RRF PATTERN, F\n\
    MOVF PATTERN, W\n\
    CALL SPI_SEND\n\
    CALL LATCH_OUT\n\
    CALL DELAY\n\
    BTFSS PATTERN, 0\n\
    GOTO SHIFT_R\n\
    GOTO SHIFT_L\n\
\n\
SPI_SEND:\n\
    MOVWF SSPBUF\n\
SPI_W:\n\
    BSF STATUS, RP0\n\
    BTFSS SSPSTAT, 0       ; BF bit\n\
    GOTO SPI_W\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W         ; Clear BF\n\
    RETURN\n\
\n\
LATCH_OUT:\n\
    BSF PORTA, LATCH       ; Pulse latch\n\
    NOP\n\
    BCF PORTA, LATCH\n\
    RETURN\n\
\n\
DELAY:\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'SPI Devices', name: 'MAX7219 8-Digit Display',
                description: 'Display "12345678" on MAX7219 LED driver (877A)',
                source:
'; MAX7219 8-Digit Display - PIC16F877A\n\
; >> Select PIC16F877A, add "MAX7219 8-Digit" in Virtual HW\n\
; Sends init + digit data via SPI\n\
;\n\
; MSSP SPI: SDO=RC5, SCK=RC3, CS=RA0\n\
; MAX7219: 16-bit SPI (addr byte + data byte)\n\
\n\
    LIST P=16F877A\n\
\n\
CS_PIN   EQU 0             ; RA0 = chip select\n\
\n\
    CBLOCK 0x20\n\
    M_ADDR\n\
    M_DATA\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISA\n\
    CLRF TRISB\n\
    MOVLW 0x10\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
    MOVLW 0x21\n\
    MOVWF SSPCON\n\
    BSF PORTA, CS_PIN       ; CS high (idle)\n\
\n\
    ; MAX7219 init sequence\n\
    MOVLW 0x0C             ; Shutdown register\n\
    MOVWF M_ADDR\n\
    MOVLW 0x01             ; Normal operation\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
    MOVLW 0x09             ; Decode mode\n\
    MOVWF M_ADDR\n\
    MOVLW 0xFF             ; BCD decode all digits\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
    MOVLW 0x0A             ; Intensity\n\
    MOVWF M_ADDR\n\
    MOVLW 0x07             ; Mid brightness\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
    MOVLW 0x0B             ; Scan limit\n\
    MOVWF M_ADDR\n\
    MOVLW 0x07             ; All 8 digits\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
    MOVLW 0x0F             ; Display test\n\
    MOVWF M_ADDR\n\
    MOVLW 0x00             ; Normal\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
    ; Write digits 1-8\n\
    MOVLW 0x01\n\
    MOVWF M_ADDR\n\
    MOVLW 0x01             ; Digit 1 = "1"\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x02\n\
    MOVWF M_ADDR\n\
    MOVLW 0x02\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x03\n\
    MOVWF M_ADDR\n\
    MOVLW 0x03\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x04\n\
    MOVWF M_ADDR\n\
    MOVLW 0x04\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x05\n\
    MOVWF M_ADDR\n\
    MOVLW 0x05\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x06\n\
    MOVWF M_ADDR\n\
    MOVLW 0x06\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x07\n\
    MOVWF M_ADDR\n\
    MOVLW 0x07\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
    MOVLW 0x08\n\
    MOVWF M_ADDR\n\
    MOVLW 0x08\n\
    MOVWF M_DATA\n\
    CALL MAX_SEND\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; Send 16-bit to MAX7219: addr then data\n\
MAX_SEND:\n\
    BCF PORTA, CS_PIN      ; CS low\n\
    MOVF M_ADDR, W\n\
    CALL SPI_BYTE\n\
    MOVF M_DATA, W\n\
    CALL SPI_BYTE\n\
    BSF PORTA, CS_PIN      ; CS high (latch)\n\
    RETURN\n\
\n\
SPI_BYTE:\n\
    MOVWF SSPBUF\n\
SB: BSF STATUS, RP0\n\
    BTFSS SSPSTAT, 0\n\
    GOTO SB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'SPI Devices', name: 'MCP3008 ADC Read',
                description: 'Read CH0 from MCP3008 10-bit ADC (877A)',
                source:
'; MCP3008 ADC Read - PIC16F877A\n\
; >> Select PIC16F877A, add "MCP3008 ADC 8ch" in Virtual HW\n\
; Reads channel 0, shows high byte on PORTB\n\
;\n\
; MCP3008 SPI: start bit + single/diff + D2:D0 channel\n\
; Send: 0x01, 0x80|ch<<4, 0x00 -> receive 10-bit result\n\
\n\
    LIST P=16F877A\n\
\n\
CS_PIN   EQU 0             ; RA0 = chip select\n\
\n\
    CBLOCK 0x20\n\
    ADC_H\n\
    ADC_L\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISA\n\
    CLRF TRISB\n\
    MOVLW 0x10\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
    MOVLW 0x21\n\
    MOVWF SSPCON\n\
    BSF PORTA, CS_PIN\n\
\n\
READ_LOOP:\n\
    BCF PORTA, CS_PIN      ; CS low\n\
\n\
    ; Byte 1: start bit\n\
    MOVLW 0x01\n\
    CALL SPI_BYTE\n\
\n\
    ; Byte 2: single-ended CH0 = 0x80\n\
    MOVLW 0x80\n\
    CALL SPI_BYTE\n\
    MOVWF ADC_H            ; Bits 9-8 in low 2 bits\n\
\n\
    ; Byte 3: get low 8 bits\n\
    MOVLW 0x00\n\
    CALL SPI_BYTE\n\
    MOVWF ADC_L            ; Bits 7-0\n\
\n\
    BSF PORTA, CS_PIN      ; CS high\n\
\n\
    ; Show ADC_L on PORTB\n\
    MOVF ADC_L, W\n\
    MOVWF PORTB\n\
\n\
    CALL DELAY\n\
    GOTO READ_LOOP\n\
\n\
SPI_BYTE:\n\
    MOVWF SSPBUF\n\
SB: BSF STATUS, RP0\n\
    BTFSS SSPSTAT, 0\n\
    GOTO SB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
\n\
DELAY:\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'DS3231 RTC + Temp',
                description: 'Read time and internal temp from DS3231 (877A)',
                source:
'; DS3231 RTC + Temperature - PIC16F877A\n\
; >> Select PIC16F877A, add "DS3231 RTC" in Virtual HW\n\
; Reads time (reg 0-2) and internal temp (reg 0x11-0x12)\n\
; Shows seconds on PORTB, then temp MSB\n\
;\n\
; DS3231 @ 0x68 — same base regs as DS1307 + temp at 0x11\n\
\n\
    LIST P=16F877A\n\
\n\
RTC_W    EQU 0xD0\n\
RTC_R    EQU 0xD1\n\
\n\
    CBLOCK 0x20\n\
    SEC\n\
    MIN\n\
    HR\n\
    TEMP_I\n\
    TEMP_F\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Start oscillator\n\
    CALL I2C_START\n\
    MOVLW RTC_W\n\
    CALL I2C_TX\n\
    MOVLW 0x00\n\
    CALL I2C_TX\n\
    MOVLW 0x00\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
MAIN:\n\
    ; Read time (reg 0-2)\n\
    CALL I2C_START\n\
    MOVLW RTC_W\n\
    CALL I2C_TX\n\
    MOVLW 0x00\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW RTC_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF SEC\n\
    CALL I2C_RA\n\
    MOVWF MIN\n\
    CALL I2C_RN\n\
    MOVWF HR\n\
    CALL I2C_STOP\n\
\n\
    ; Show seconds\n\
    MOVF SEC, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
\n\
    ; Read temperature (reg 0x11-0x12)\n\
    CALL I2C_START\n\
    MOVLW RTC_W\n\
    CALL I2C_TX\n\
    MOVLW 0x11\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW RTC_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF TEMP_I\n\
    CALL I2C_RN\n\
    MOVWF TEMP_F\n\
    CALL I2C_STOP\n\
\n\
    ; Show temp integer on PORTB\n\
    MOVF TEMP_I, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
DS: BTFSC SSPCON2, 0\n\
    GOTO DS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
DP: BTFSC SSPCON2, 2\n\
    GOTO DP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
DW: BTFSC SSPSTAT, 2\n\
    GOTO DW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
DA: BTFSC SSPCON2, 3\n\
    GOTO DA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
DB: BTFSC SSPCON2, 4\n\
    GOTO DB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
DC: BTFSC SSPCON2, 3\n\
    GOTO DC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
DD: BTFSC SSPCON2, 4\n\
    GOTO DD\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'MCP9808 Temp + Alerts',
                description: 'Read temp, set thresholds, check alerts (877A)',
                source:
'; MCP9808 Temp + Alerts - PIC16F877A\n\
; >> Select PIC16F877A, add "MCP9808 Temp Alert" in Virtual HW\n\
; Sets upper=30C, lower=20C, critical=40C\n\
; Reads ambient temp, shows MSB on PORTB\n\
; Move slider to see alert badges change!\n\
;\n\
; MCP9808 @ 0x18: 16-bit registers\n\
; Pointer: 0x02=T_upper, 0x03=T_lower, 0x04=T_crit, 0x05=T_ambient\n\
\n\
    LIST P=16F877A\n\
\n\
MCP_W    EQU 0x30          ; 0x18 << 1 | 0\n\
MCP_R    EQU 0x31\n\
\n\
    CBLOCK 0x20\n\
    TEMP_MSB\n\
    TEMP_LSB\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Read manufacturer ID (reg 0x06) to verify\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x06\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW MCP_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF TEMP_MSB         ; Should be 0x00\n\
    CALL I2C_RN\n\
    MOVWF TEMP_LSB         ; Should be 0x54\n\
    CALL I2C_STOP\n\
    MOVF TEMP_LSB, W\n\
    MOVWF PORTB            ; Show 0x54\n\
    CALL DELAY\n\
\n\
    ; Set T_upper = 30.0C (reg 0x02)\n\
    ; 30.0 / 0.0625 = 480 = 0x01E0\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x02\n\
    CALL I2C_TX\n\
    MOVLW 0x01             ; MSB\n\
    CALL I2C_TX\n\
    MOVLW 0xE0             ; LSB\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
    ; Set T_lower = 20.0C (reg 0x03)\n\
    ; 20.0 / 0.0625 = 320 = 0x0140\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x03\n\
    CALL I2C_TX\n\
    MOVLW 0x01\n\
    CALL I2C_TX\n\
    MOVLW 0x40\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
    ; Set T_critical = 40.0C (reg 0x04)\n\
    ; 40.0 / 0.0625 = 640 = 0x0280\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x04\n\
    CALL I2C_TX\n\
    MOVLW 0x02\n\
    CALL I2C_TX\n\
    MOVLW 0x80\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
\n\
READ_LOOP:\n\
    ; Read T_ambient (reg 0x05)\n\
    CALL I2C_START\n\
    MOVLW MCP_W\n\
    CALL I2C_TX\n\
    MOVLW 0x05\n\
    CALL I2C_TX\n\
    CALL I2C_STOP\n\
    CALL I2C_START\n\
    MOVLW MCP_R\n\
    CALL I2C_TX\n\
    CALL I2C_RA\n\
    MOVWF TEMP_MSB         ; Bits 15-13=alerts, 12=sign, 11-4=integer\n\
    CALL I2C_RN\n\
    MOVWF TEMP_LSB\n\
    CALL I2C_STOP\n\
\n\
    ; Show integer part on PORTB\n\
    ; Integer = (MSB & 0x0F) << 4 | (LSB >> 4)\n\
    MOVF TEMP_MSB, W\n\
    ANDLW 0x0F\n\
    MOVWF PORTB\n\
\n\
    CALL DELAY\n\
    GOTO READ_LOOP\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
TS: BTFSC SSPCON2, 0\n\
    GOTO TS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
TP: BTFSC SSPCON2, 2\n\
    GOTO TP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
TW: BTFSC SSPSTAT, 2\n\
    GOTO TW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
TA: BTFSC SSPCON2, 3\n\
    GOTO TA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
TB: BTFSC SSPCON2, 4\n\
    GOTO TB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
TC: BTFSC SSPCON2, 3\n\
    GOTO TC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
TD: BTFSC SSPCON2, 4\n\
    GOTO TD\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'TMP102 Read Temp',
                description: 'Read 12-bit temp from TMP102 (877A)',
                source:
'; TMP102 Read - PIC16F877A\n\
; >> Select PIC16F877A, add "TMP102 Temp" in Virtual HW\n\
; Reads 12-bit temp (2 bytes, left-justified)\n\
; TMP102 @ 0x48: pointer 0 = temp register\n\
\n\
    LIST P=16F877A\n\
\n\
TMP_W    EQU 0x90\n\
TMP_R    EQU 0x91\n\
\n\
    CBLOCK 0x20\n\
    TEMP_H\n\
    TEMP_L\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
MAIN:\n\
    ; Set pointer to temp register (0)\n\
    CALL I2C_S\n\
    MOVLW TMP_W\n\
    CALL I2C_W\n\
    MOVLW 0x00\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
    ; Read 2 bytes\n\
    CALL I2C_S\n\
    MOVLW TMP_R\n\
    CALL I2C_W\n\
    CALL I2C_RA\n\
    MOVWF TEMP_H\n\
    CALL I2C_RN\n\
    MOVWF TEMP_L\n\
    CALL I2C_P\n\
    ; TEMP_H = integer degrees\n\
    MOVF TEMP_H, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
I2C_S:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
XS: BTFSC SSPCON2, 0\n\
    GOTO XS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_P:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
XP: BTFSC SSPCON2, 2\n\
    GOTO XP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_W:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
XW: BTFSC SSPSTAT, 2\n\
    GOTO XW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
XA: BTFSC SSPCON2, 3\n\
    GOTO XA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
XB: BTFSC SSPCON2, 4\n\
    GOTO XB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
XC: BTFSC SSPCON2, 3\n\
    GOTO XC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
XD: BTFSC SSPCON2, 4\n\
    GOTO XD\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'STTS751 Read + ID',
                description: 'Read temp and manufacturer ID from STTS751 (877A)',
                source:
'; STTS751 Read - PIC16F877A\n\
; >> Select PIC16F877A, add "STTS751 Temp" in Virtual HW\n\
; Reads manufacturer ID (0xFE=0x53) then temp MSB+LSB\n\
; STTS751 @ 0x48: pointer byte selects register\n\
\n\
    LIST P=16F877A\n\
\n\
ST_W     EQU 0x90\n\
ST_R     EQU 0x91\n\
\n\
    CBLOCK 0x20\n\
    MFG_ID\n\
    TEMP_I\n\
    TEMP_F\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Read manufacturer ID (reg 0xFE)\n\
    CALL I2C_S\n\
    MOVLW ST_W\n\
    CALL I2C_W\n\
    MOVLW 0xFE\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
    CALL I2C_S\n\
    MOVLW ST_R\n\
    CALL I2C_W\n\
    CALL I2C_RN\n\
    MOVWF MFG_ID           ; Should be 0x53\n\
    CALL I2C_P\n\
    MOVF MFG_ID, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
\n\
MAIN:\n\
    ; Read temp MSB (reg 0x00)\n\
    CALL I2C_S\n\
    MOVLW ST_W\n\
    CALL I2C_W\n\
    MOVLW 0x00\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
    CALL I2C_S\n\
    MOVLW ST_R\n\
    CALL I2C_W\n\
    CALL I2C_RN\n\
    MOVWF TEMP_I\n\
    CALL I2C_P\n\
    ; Read temp LSB (reg 0x02)\n\
    CALL I2C_S\n\
    MOVLW ST_W\n\
    CALL I2C_W\n\
    MOVLW 0x02\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
    CALL I2C_S\n\
    MOVLW ST_R\n\
    CALL I2C_W\n\
    CALL I2C_RN\n\
    MOVWF TEMP_F\n\
    CALL I2C_P\n\
    MOVF TEMP_I, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
I2C_S:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
YS: BTFSC SSPCON2, 0\n\
    GOTO YS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_P:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
YP: BTFSC SSPCON2, 2\n\
    GOTO YP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_W:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
YW: BTFSC SSPSTAT, 2\n\
    GOTO YW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
YA: BTFSC SSPCON2, 3\n\
    GOTO YA\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
YB: BTFSC SSPCON2, 4\n\
    GOTO YB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'PCF8563 RTC Read',
                description: 'Read time from PCF8563 NXP RTC (877A)',
                source:
'; PCF8563 RTC Read - PIC16F877A\n\
; >> Select PIC16F877A, add "PCF8563 RTC" in Virtual HW\n\
; Reads seconds/minutes/hours from PCF8563\n\
; PCF8563 @ 0x51: reg 02=sec 03=min 04=hr\n\
\n\
    LIST P=16F877A\n\
\n\
PCF_W    EQU 0xA2          ; 0x51 << 1 | 0\n\
PCF_R    EQU 0xA3\n\
\n\
    CBLOCK 0x20\n\
    SEC\n\
    MIN\n\
    HR\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Start clock: clear STOP bit in ctrl1 (reg 0x00)\n\
    CALL I2C_S\n\
    MOVLW PCF_W\n\
    CALL I2C_W\n\
    MOVLW 0x00\n\
    CALL I2C_W\n\
    MOVLW 0x00             ; Control1: STOP=0\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
\n\
MAIN:\n\
    ; Point to seconds (reg 0x02)\n\
    CALL I2C_S\n\
    MOVLW PCF_W\n\
    CALL I2C_W\n\
    MOVLW 0x02\n\
    CALL I2C_W\n\
    CALL I2C_P\n\
    ; Read sec, min, hr\n\
    CALL I2C_S\n\
    MOVLW PCF_R\n\
    CALL I2C_W\n\
    CALL I2C_RA\n\
    ANDLW 0x7F             ; Mask VL bit\n\
    MOVWF SEC\n\
    CALL I2C_RA\n\
    ANDLW 0x7F\n\
    MOVWF MIN\n\
    CALL I2C_RN\n\
    ANDLW 0x3F\n\
    MOVWF HR\n\
    CALL I2C_P\n\
    MOVF SEC, W\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    GOTO MAIN\n\
\n\
I2C_S:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
PS: BTFSC SSPCON2, 0\n\
    GOTO PS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_P:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
PP: BTFSC SSPCON2, 2\n\
    GOTO PP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_W:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
PW: BTFSC SSPSTAT, 2\n\
    GOTO PW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
I2C_RA:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
PA: BTFSC SSPCON2, 3\n\
    GOTO PA\n\
    BCF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
PB: BTFSC SSPCON2, 4\n\
    GOTO PB\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
I2C_RN:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 3\n\
PC: BTFSC SSPCON2, 3\n\
    GOTO PC\n\
    BSF SSPCON2, 5\n\
    BSF SSPCON2, 4\n\
PD: BTFSC SSPCON2, 4\n\
    GOTO PD\n\
    BCF STATUS, RP0\n\
    MOVF SSPBUF, W\n\
    RETURN\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: '1-Wire', name: 'DS18B20 Read Temp',
                description: 'Read temperature from DS18B20 via bit-banging (PIC16F84A)',
                source:
'; DS18B20 Read Temperature - PIC16F84A\n\
; >> Add "DS18B20 Temp (1-Wire)" Port=A, Pin=0 in Virtual HW\n\
;\n\
; 1-Wire on RA0: bit-banging with timing loops\n\
; Sequence: Reset → Skip ROM → Convert T → Reset → Skip ROM → Read Scratchpad\n\
; Shows temperature integer on PORTB\n\
;\n\
; Pin control: TRISA bit0=1 → release (pull-up=1)\n\
;              TRISA bit0=0 + PORTA bit0=0 → pull low\n\
\n\
    LIST P=16F84A\n\
\n\
DQ_PORT  EQU PORTA\n\
DQ_TRIS  EQU TRISA\n\
DQ_PIN   EQU 0\n\
\n\
    CBLOCK 0x0C\n\
    TEMP_L\n\
    TEMP_H\n\
    OW_BYTE\n\
    OW_COUNT\n\
    BYTE_CNT\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB            ; PORTB all output\n\
    BCF STATUS, RP0\n\
    BCF PORTA, DQ_PIN     ; Prepare low output\n\
    CLRF PORTB\n\
\n\
READ_LOOP:\n\
    ; === Step 1: Reset + Presence ===\n\
    CALL OW_RESET\n\
\n\
    ; === Step 2: Skip ROM (0xCC) ===\n\
    MOVLW 0xCC\n\
    CALL OW_WRITE_BYTE\n\
\n\
    ; === Step 3: Convert T (0x44) ===\n\
    MOVLW 0x44\n\
    CALL OW_WRITE_BYTE\n\
\n\
    ; Wait for conversion (~750ms at 12-bit)\n\
    ; In simulator, conversion is instant\n\
    CALL DELAY_LONG\n\
\n\
    ; === Step 4: Reset + Presence ===\n\
    CALL OW_RESET\n\
\n\
    ; === Step 5: Skip ROM (0xCC) ===\n\
    MOVLW 0xCC\n\
    CALL OW_WRITE_BYTE\n\
\n\
    ; === Step 6: Read Scratchpad (0xBE) ===\n\
    MOVLW 0xBE\n\
    CALL OW_WRITE_BYTE\n\
\n\
    ; Read 2 bytes: Temp LSB, Temp MSB\n\
    CALL OW_READ_BYTE\n\
    MOVF OW_BYTE, W\n\
    MOVWF TEMP_L\n\
    CALL OW_READ_BYTE\n\
    MOVF OW_BYTE, W\n\
    MOVWF TEMP_H\n\
\n\
    ; Extract integer part: shift right 4 (12-bit format)\n\
    ; Integer = (TEMP_H << 4) | (TEMP_L >> 4)\n\
    SWAPF TEMP_L, W       ; Swap nibbles of LSB\n\
    ANDLW 0x0F            ; Keep low nibble (was high)\n\
    MOVWF PORTB           ; Low part of integer\n\
    SWAPF TEMP_H, W       ; Swap nibbles of MSB\n\
    ANDLW 0xF0            ; Keep high nibble\n\
    IORWF PORTB, F        ; Combine\n\
\n\
    CALL DELAY_LONG\n\
    GOTO READ_LOOP\n\
\n\
; ============================================\n\
;  1-Wire Low-Level Routines\n\
; ============================================\n\
\n\
; Reset pulse: pull low 480us, release, wait for presence\n\
OW_RESET:\n\
    ; Pull low\n\
    BSF STATUS, RP0\n\
    BCF DQ_TRIS, DQ_PIN   ; Output (low)\n\
    BCF STATUS, RP0\n\
    ; Hold low ~500 cycles\n\
    MOVLW 0xA0\n\
    MOVWF DL1\n\
RES1:\n\
    NOP\n\
    DECFSZ DL1, F\n\
    GOTO RES1\n\
    ; Release\n\
    BSF STATUS, RP0\n\
    BSF DQ_TRIS, DQ_PIN   ; Input (pull-up)\n\
    BCF STATUS, RP0\n\
    ; Wait for presence ~240 cycles\n\
    MOVLW 0x50\n\
    MOVWF DL1\n\
RES2:\n\
    NOP\n\
    DECFSZ DL1, F\n\
    GOTO RES2\n\
    RETURN\n\
\n\
; Write byte (LSB first)\n\
OW_WRITE_BYTE:\n\
    MOVWF OW_BYTE\n\
    MOVLW 0x08\n\
    MOVWF OW_COUNT\n\
WB_LOOP:\n\
    BTFSC OW_BYTE, 0\n\
    GOTO WB_ONE\n\
    ; Write 0: pull low ~60us\n\
    BSF STATUS, RP0\n\
    BCF DQ_TRIS, DQ_PIN\n\
    BCF STATUS, RP0\n\
    MOVLW 0x14\n\
    MOVWF DL1\n\
WB0D:\n\
    DECFSZ DL1, F\n\
    GOTO WB0D\n\
    BSF STATUS, RP0\n\
    BSF DQ_TRIS, DQ_PIN   ; Release\n\
    BCF STATUS, RP0\n\
    NOP\n\
    NOP\n\
    GOTO WB_NEXT\n\
WB_ONE:\n\
    ; Write 1: pull low ~6us, release\n\
    BSF STATUS, RP0\n\
    BCF DQ_TRIS, DQ_PIN\n\
    BCF STATUS, RP0\n\
    NOP\n\
    NOP\n\
    NOP\n\
    BSF STATUS, RP0\n\
    BSF DQ_TRIS, DQ_PIN   ; Release\n\
    BCF STATUS, RP0\n\
    ; Fill rest of time slot\n\
    MOVLW 0x10\n\
    MOVWF DL1\n\
WB1D:\n\
    DECFSZ DL1, F\n\
    GOTO WB1D\n\
WB_NEXT:\n\
    RRF OW_BYTE, F        ; Next bit (LSB first)\n\
    DECFSZ OW_COUNT, F\n\
    GOTO WB_LOOP\n\
    RETURN\n\
\n\
; Read byte (LSB first) -> result in OW_BYTE\n\
OW_READ_BYTE:\n\
    CLRF OW_BYTE\n\
    MOVLW 0x08\n\
    MOVWF OW_COUNT\n\
RB_LOOP:\n\
    ; Init read slot: pull low ~3us\n\
    BSF STATUS, RP0\n\
    BCF DQ_TRIS, DQ_PIN\n\
    BCF STATUS, RP0\n\
    NOP\n\
    NOP\n\
    ; Release and sample\n\
    BSF STATUS, RP0\n\
    BSF DQ_TRIS, DQ_PIN   ; Release\n\
    BCF STATUS, RP0\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP                    ; Sample point ~15us\n\
    BCF STATUS, C\n\
    BTFSC DQ_PORT, DQ_PIN ; Read pin\n\
    BSF STATUS, C\n\
    RRF OW_BYTE, F        ; Shift in bit (LSB first)\n\
    ; Fill rest of slot\n\
    MOVLW 0x0C\n\
    MOVWF DL1\n\
RBD:\n\
    DECFSZ DL1, F\n\
    GOTO RBD\n\
    DECFSZ OW_COUNT, F\n\
    GOTO RB_LOOP\n\
    RETURN\n\
\n\
; Long delay\n\
DELAY_LONG:\n\
    MOVLW 0x30\n\
    MOVWF DL2\n\
DLL:\n\
    MOVLW 0xFF\n\
    MOVWF DL1\n\
DL0:\n\
    DECFSZ DL1, F\n\
    GOTO DL0\n\
    DECFSZ DL2, F\n\
    GOTO DLL\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'Servo Sweep',
                description: 'Sweep servo 0-180° on RB0 (PIC16F84A)',
                source:
'; Servo Sweep - PIC16F84A\n\
; >> Add "RC Servo Motor" Port=B, Pin=0 in Virtual HW\n\
;\n\
; Generates 50Hz PWM on RB0 with variable pulse width\n\
; Sweeps from 0° (500us) to 180° (2500us) and back\n\
;\n\
; At 4MHz: 1 cycle = 1us\n\
; Period = 20ms = 20000 cycles\n\
; Pulse: 500-2500 cycles\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    PULSE_H         ; Pulse width high byte\n\
    PULSE_L         ; Pulse width low byte\n\
    STEP_DIR        ; 0=up, 1=down\n\
    DL1\n\
    DL2\n\
    DL3\n\
    TEMP\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
    ; Start at 0° (pulse = 500us)\n\
    MOVLW 0x01\n\
    MOVWF PULSE_H         ; 0x01F4 = 500\n\
    MOVLW 0xF4\n\
    MOVWF PULSE_L\n\
    CLRF STEP_DIR\n\
\n\
MAIN:\n\
    ; === Generate one PWM pulse ===\n\
    ; HIGH phase: pulse width\n\
    BSF PORTB, 0\n\
    CALL PULSE_DELAY\n\
    BCF PORTB, 0\n\
\n\
    ; LOW phase: fill rest of 20ms period\n\
    CALL PERIOD_DELAY\n\
\n\
    ; === Update pulse width (sweep) ===\n\
    ; Each frame: add/subtract 20us (≈1° step)\n\
    BTFSC STEP_DIR, 0\n\
    GOTO SWEEP_DOWN\n\
\n\
SWEEP_UP:\n\
    MOVLW 0x14            ; +20\n\
    ADDWF PULSE_L, F\n\
    BTFSC STATUS, C\n\
    INCF PULSE_H, F\n\
    ; Check if >= 2500 (0x09C4)\n\
    MOVLW 0x09\n\
    SUBWF PULSE_H, W\n\
    BTFSS STATUS, Z\n\
    GOTO CHECK_H_UP\n\
    MOVLW 0xC4\n\
    SUBWF PULSE_L, W\n\
    BTFSC STATUS, C\n\
    BSF STEP_DIR, 0       ; Reverse direction\n\
    GOTO MAIN\n\
CHECK_H_UP:\n\
    BTFSC STATUS, C\n\
    BSF STEP_DIR, 0       ; H > 9 → reverse\n\
    GOTO MAIN\n\
\n\
SWEEP_DOWN:\n\
    MOVLW 0x14            ; -20\n\
    SUBWF PULSE_L, F\n\
    BTFSS STATUS, C\n\
    DECF PULSE_H, F\n\
    ; Check if <= 500 (0x01F4)\n\
    MOVLW 0x02\n\
    SUBWF PULSE_H, W\n\
    BTFSC STATUS, C\n\
    GOTO MAIN             ; H >= 2, still OK\n\
    ; H < 2: check if H=1\n\
    MOVF PULSE_H, W\n\
    BTFSS STATUS, Z\n\
    GOTO CHECK_MINL       ; H=1, check L\n\
    ; H=0: underflow, reset to min\n\
    MOVLW 0x01\n\
    MOVWF PULSE_H\n\
    MOVLW 0xF4\n\
    MOVWF PULSE_L\n\
    BCF STEP_DIR, 0       ; Reverse to up\n\
    GOTO MAIN\n\
CHECK_MINL:\n\
    MOVLW 0xF4\n\
    SUBWF PULSE_L, W\n\
    BTFSS STATUS, C\n\
    BCF STEP_DIR, 0       ; L < 0xF4 with H=1 → reverse\n\
    GOTO MAIN\n\
\n\
; === Delay for pulse width (PULSE_H:PULSE_L cycles) ===\n\
PULSE_DELAY:\n\
    MOVF PULSE_H, W\n\
    MOVWF DL2\n\
    MOVF PULSE_L, W\n\
    MOVWF DL1\n\
PD1:\n\
    DECFSZ DL1, F\n\
    GOTO PD1\n\
    DECFSZ DL2, F\n\
    GOTO PD1\n\
    RETURN\n\
\n\
; === Delay for rest of 20ms period ===\n\
; Approx: 20000 - pulse ≈ 18000 cycles\n\
PERIOD_DELAY:\n\
    MOVLW 0x46            ; ~70 x 256 ≈ 18000\n\
    MOVWF DL3\n\
PER1:\n\
    MOVLW 0xFF\n\
    MOVWF DL1\n\
PER2:\n\
    DECFSZ DL1, F\n\
    GOTO PER2\n\
    DECFSZ DL3, F\n\
    GOTO PER1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'Servo + ADC Control',
                description: 'ADC potentiometer controls servo angle (877A)',
                source:
'; Servo + ADC Control - PIC16F877A\n\
; >> Add "RC Servo Motor" Port=B, Pin=0 in Virtual HW\n\
; >> Adjust AN0 slider in ADC panel to control servo\n\
;\n\
; AN0 (0-255) maps to pulse (500-2500us)\n\
\n\
    LIST P=16F877A\n\
\n\
    CBLOCK 0x20\n\
    ADC_VAL\n\
    PULSE_H\n\
    PULSE_L\n\
    DL1\n\
    DL2\n\
    DL3\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x0E\n\
    MOVWF ADCON1          ; AN0 analog\n\
    BCF STATUS, RP0\n\
    MOVLW 0x41\n\
    MOVWF ADCON0          ; ADON, Fosc/8, CH0\n\
\n\
MAIN:\n\
    ; Read ADC\n\
    BSF ADCON0, GO\n\
WAIT_ADC:\n\
    BTFSC ADCON0, GO\n\
    GOTO WAIT_ADC\n\
    MOVF ADRESH, W\n\
    MOVWF ADC_VAL\n\
\n\
    ; Map ADC (0-255) to pulse (500-2500)\n\
    ; pulse = 500 + (ADC * 8) approximately\n\
    ; ADC * 8 = shift left 3\n\
    BCF STATUS, C\n\
    RLF ADC_VAL, W        ; x2\n\
    MOVWF PULSE_L\n\
    CLRF PULSE_H\n\
    BTFSC STATUS, C\n\
    INCF PULSE_H, F\n\
    BCF STATUS, C\n\
    RLF PULSE_L, F        ; x4\n\
    RLF PULSE_H, F\n\
    BCF STATUS, C\n\
    RLF PULSE_L, F        ; x8\n\
    RLF PULSE_H, F\n\
    ; Add 500 (0x01F4)\n\
    MOVLW 0xF4\n\
    ADDWF PULSE_L, F\n\
    BTFSC STATUS, C\n\
    INCF PULSE_H, F\n\
    MOVLW 0x01\n\
    ADDWF PULSE_H, F\n\
\n\
    ; Generate PWM pulse\n\
    BSF PORTB, 0          ; HIGH\n\
    CALL PULSE_DLY\n\
    BCF PORTB, 0          ; LOW\n\
    CALL PERIOD_DLY\n\
    GOTO MAIN\n\
\n\
PULSE_DLY:\n\
    MOVF PULSE_H, W\n\
    MOVWF DL2\n\
    MOVF PULSE_L, W\n\
    MOVWF DL1\n\
PD1:\n\
    DECFSZ DL1, F\n\
    GOTO PD1\n\
    DECFSZ DL2, F\n\
    GOTO PD1\n\
    RETURN\n\
\n\
PERIOD_DLY:\n\
    MOVLW 0x46\n\
    MOVWF DL3\n\
PR1:\n\
    MOVLW 0xFF\n\
    MOVWF DL1\n\
PR2:\n\
    DECFSZ DL1, F\n\
    GOTO PR2\n\
    DECFSZ DL3, F\n\
    GOTO PR1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'HC-SR04 Distance',
                description: 'Measure distance with ultrasonic sensor (PIC16F84A)',
                source:
'; HC-SR04 Ultrasonic Distance - PIC16F84A\n\
; >> Add "HC-SR04 Ultrasonic" Trig=RB0, Echo=RB1 in Virtual HW\n\
;\n\
; RB0 = Trigger (output), RB1 = Echo (input)\n\
; Distance = (echo_time / 58) cm\n\
; Shows echo high byte on PORTB upper nibble as rough distance\n\
\n\
    LIST P=16F84A\n\
\n\
TRIG     EQU 0             ; RB0\n\
ECHO     EQU 1             ; RB1\n\
\n\
    CBLOCK 0x0C\n\
    ECHO_H\n\
    ECHO_L\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0x02            ; RB1=input (echo), rest output\n\
    MOVWF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
MEASURE:\n\
    ; === Send 10us trigger pulse ===\n\
    BSF PORTB, TRIG\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP\n\
    NOP                    ; ~10us at 4MHz\n\
    BCF PORTB, TRIG\n\
\n\
    ; === Wait for echo to go HIGH ===\n\
WAIT_HIGH:\n\
    BTFSS PORTB, ECHO\n\
    GOTO WAIT_HIGH\n\
\n\
    ; === Count echo duration ===\n\
    CLRF ECHO_H\n\
    CLRF ECHO_L\n\
COUNT_ECHO:\n\
    INCF ECHO_L, F\n\
    BTFSC STATUS, Z\n\
    INCF ECHO_H, F\n\
    NOP                    ; ~4 cycles per loop\n\
    BTFSC PORTB, ECHO     ; Still high?\n\
    GOTO COUNT_ECHO\n\
\n\
    ; === Display result ===\n\
    ; ECHO_H:ECHO_L = rough cycle count\n\
    ; Higher ECHO_H = farther distance\n\
    ; Show ECHO_H on PORTB (rough cm / 4)\n\
    MOVF ECHO_H, W\n\
    ANDLW 0xFC            ; Mask trigger/echo bits\n\
    MOVWF PORTB\n\
\n\
    ; === Wait before next measurement ===\n\
    CALL DELAY\n\
    GOTO MEASURE\n\
\n\
DELAY:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'WS2812 RGB Strip',
                description: 'Drive 8 NeoPixel LEDs with color pattern (PIC16F84A)',
                source:
'; WS2812B RGB LED Strip - PIC16F84A\n\
; >> Add "WS2812B LED Strip" Port=B, Pin=0, 8 LEDs in Virtual HW\n\
;\n\
; Sends 8 LEDs x 3 bytes (GRB) via bit-banging on RB0\n\
; Timing: Bit 1 = HIGH ~3 cycles, LOW ~1 cycle\n\
;         Bit 0 = HIGH ~1 cycle, LOW ~3 cycles\n\
;         Reset = LOW > 25 cycles\n\
\n\
    LIST P=16F84A\n\
\n\
DIN      EQU 0             ; RB0 = data out\n\
\n\
    CBLOCK 0x0C\n\
    LED_G\n\
    LED_R\n\
    LED_B\n\
    BIT_CNT\n\
    LED_CNT\n\
    SEND_BYTE\n\
    OFFSET\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; Color table: 8 colors (G, R, B)\n\
COLOR_G:\n\
    ADDWF PCL, F\n\
    RETLW 0x00            ; 0: Red\n\
    RETLW 0x80            ; 1: Yellow\n\
    RETLW 0xFF            ; 2: Green\n\
    RETLW 0xFF            ; 3: Cyan\n\
    RETLW 0x00            ; 4: Blue\n\
    RETLW 0x00            ; 5: Magenta\n\
    RETLW 0x40            ; 6: Orange\n\
    RETLW 0xFF            ; 7: White\n\
\n\
COLOR_R:\n\
    ADDWF PCL, F\n\
    RETLW 0xFF            ; 0: Red\n\
    RETLW 0xFF            ; 1: Yellow\n\
    RETLW 0x00            ; 2: Green\n\
    RETLW 0x00            ; 3: Cyan\n\
    RETLW 0x00            ; 4: Blue\n\
    RETLW 0xFF            ; 5: Magenta\n\
    RETLW 0xFF            ; 6: Orange\n\
    RETLW 0xFF            ; 7: White\n\
\n\
COLOR_B:\n\
    ADDWF PCL, F\n\
    RETLW 0x00            ; 0: Red\n\
    RETLW 0x00            ; 1: Yellow\n\
    RETLW 0x00            ; 2: Green\n\
    RETLW 0xFF            ; 3: Cyan\n\
    RETLW 0xFF            ; 4: Blue\n\
    RETLW 0xFF            ; 5: Magenta\n\
    RETLW 0x20            ; 6: Orange\n\
    RETLW 0xFF            ; 7: White\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
    CLRF OFFSET\n\
\n\
FRAME:\n\
    ; Send 8 LEDs with rotating color offset\n\
    CLRF LED_CNT\n\
NEXT_LED:\n\
    ; Color index = (LED_CNT + OFFSET) & 0x07\n\
    MOVF LED_CNT, W\n\
    ADDWF OFFSET, W\n\
    ANDLW 0x07\n\
    ; Get G component\n\
    CALL COLOR_G\n\
    MOVWF LED_G\n\
    MOVF LED_CNT, W\n\
    ADDWF OFFSET, W\n\
    ANDLW 0x07\n\
    CALL COLOR_R\n\
    MOVWF LED_R\n\
    MOVF LED_CNT, W\n\
    ADDWF OFFSET, W\n\
    ANDLW 0x07\n\
    CALL COLOR_B\n\
    MOVWF LED_B\n\
\n\
    ; Send GRB (24 bits)\n\
    MOVF LED_G, W\n\
    CALL WS_SEND_BYTE\n\
    MOVF LED_R, W\n\
    CALL WS_SEND_BYTE\n\
    MOVF LED_B, W\n\
    CALL WS_SEND_BYTE\n\
\n\
    INCF LED_CNT, F\n\
    MOVLW 0x08\n\
    SUBWF LED_CNT, W\n\
    BTFSS STATUS, Z\n\
    GOTO NEXT_LED\n\
\n\
    ; Reset pulse (latch)\n\
    BCF PORTB, DIN\n\
    MOVLW 0x30\n\
    MOVWF DL1\n\
LATCH:\n\
    DECFSZ DL1, F\n\
    GOTO LATCH\n\
\n\
    ; Rotate offset for chase effect\n\
    INCF OFFSET, F\n\
    MOVLW 0x08\n\
    SUBWF OFFSET, W\n\
    BTFSC STATUS, Z\n\
    CLRF OFFSET\n\
\n\
    ; Frame delay\n\
    CALL DELAY\n\
    GOTO FRAME\n\
\n\
; === Send byte MSB first ===\n\
WS_SEND_BYTE:\n\
    MOVWF SEND_BYTE\n\
    MOVLW 0x08\n\
    MOVWF BIT_CNT\n\
WS_BIT:\n\
    BTFSC SEND_BYTE, 7    ; Test MSB\n\
    GOTO WS_ONE\n\
WS_ZERO:\n\
    ; Bit 0: short HIGH, long LOW\n\
    BSF PORTB, DIN\n\
    NOP\n\
    BCF PORTB, DIN\n\
    NOP\n\
    NOP\n\
    NOP\n\
    GOTO WS_NEXT\n\
WS_ONE:\n\
    ; Bit 1: long HIGH, short LOW\n\
    BSF PORTB, DIN\n\
    NOP\n\
    NOP\n\
    NOP\n\
    BCF PORTB, DIN\n\
    NOP\n\
WS_NEXT:\n\
    RLF SEND_BYTE, F       ; Shift left for next bit\n\
    DECFSZ BIT_CNT, F\n\
    GOTO WS_BIT\n\
    RETURN\n\
\n\
DELAY:\n\
    MOVLW 0x20\n\
    MOVWF DL2\n\
D1: MOVLW 0xFF\n\
    MOVWF DL1\n\
D2: DECFSZ DL1, F\n\
    GOTO D2\n\
    DECFSZ DL2, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'I\u00B2C Devices', name: 'SSD1306 OLED Draw',
                description: 'Draw pattern on 128x64 OLED via I2C (877A)',
                source:
'; SSD1306 OLED Draw - PIC16F877A\n\
; >> Select PIC16F877A, add "SSD1306 OLED 128x64" in Virtual HW\n\
; Inits OLED, fills with checkerboard pattern\n\
;\n\
; SSD1306 @ 0x3C: control 0x00=cmd, 0x40=data\n\
\n\
    LIST P=16F877A\n\
\n\
OLED_W   EQU 0x78          ; 0x3C << 1\n\
\n\
    CBLOCK 0x20\n\
    PAGE\n\
    COL\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    MOVLW 0x18\n\
    MOVWF TRISC\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    MOVLW 0x09\n\
    MOVWF SSPADD\n\
    BCF STATUS, RP0\n\
    MOVLW 0x28\n\
    MOVWF SSPCON\n\
\n\
    ; Init SSD1306\n\
    CALL OLED_CMD\n\
    MOVLW 0xAE             ; Display OFF\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x20             ; Set addressing mode\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x00             ; Horizontal\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x8D             ; Charge pump\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x14             ; Enable\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0xAF             ; Display ON\n\
    CALL OLED_SEND_CMD\n\
    CALL I2C_STOP\n\
\n\
    ; Set column range 0-127\n\
    CALL OLED_CMD\n\
    MOVLW 0x21\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x00\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x7F\n\
    CALL OLED_SEND_CMD\n\
    ; Set page range 0-7\n\
    MOVLW 0x22\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x00\n\
    CALL OLED_SEND_CMD\n\
    MOVLW 0x07\n\
    CALL OLED_SEND_CMD\n\
    CALL I2C_STOP\n\
\n\
    ; Draw checkerboard: 8 pages x 128 cols = 1024 bytes\n\
    CLRF PAGE\n\
DRAW_PAGE:\n\
    CALL OLED_DATA_START\n\
    CLRF COL\n\
DRAW_COL:\n\
    ; Checkerboard: alternating 0x55/0xAA per column\n\
    BTFSC COL, 0\n\
    GOTO DRAW_AA\n\
    MOVLW 0x55\n\
    GOTO DRAW_SEND\n\
DRAW_AA:\n\
    MOVLW 0xAA\n\
DRAW_SEND:\n\
    CALL OLED_SEND_DATA\n\
    INCF COL, F\n\
    MOVLW 0x80\n\
    SUBWF COL, W\n\
    BTFSS STATUS, Z\n\
    GOTO DRAW_COL\n\
    CALL I2C_STOP\n\
    INCF PAGE, F\n\
    MOVLW 0x08\n\
    SUBWF PAGE, W\n\
    BTFSS STATUS, Z\n\
    GOTO DRAW_PAGE\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
; === OLED I2C helpers ===\n\
OLED_CMD:\n\
    CALL I2C_START\n\
    MOVLW OLED_W\n\
    CALL I2C_TX\n\
    MOVLW 0x00             ; Control: command stream\n\
    CALL I2C_TX\n\
    RETURN\n\
OLED_SEND_CMD:\n\
    CALL I2C_TX\n\
    RETURN\n\
OLED_DATA_START:\n\
    CALL I2C_START\n\
    MOVLW OLED_W\n\
    CALL I2C_TX\n\
    MOVLW 0x40             ; Control: data stream\n\
    CALL I2C_TX\n\
    RETURN\n\
OLED_SEND_DATA:\n\
    CALL I2C_TX\n\
    RETURN\n\
\n\
I2C_START:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 0\n\
OS: BTFSC SSPCON2, 0\n\
    GOTO OS\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_STOP:\n\
    BSF STATUS, RP0\n\
    BSF SSPCON2, 2\n\
OP: BTFSC SSPCON2, 2\n\
    GOTO OP\n\
    BCF STATUS, RP0\n\
    RETURN\n\
I2C_TX:\n\
    MOVWF SSPBUF\n\
    BSF STATUS, RP0\n\
OW: BTFSC SSPSTAT, 2\n\
    GOTO OW\n\
    BCF STATUS, RP0\n\
    BCF PIR1, SSPIF\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'KS0108 GLCD Draw',
                description: 'Draw diagonal line on 128x64 GLCD (877A)',
                source:
'; KS0108 GLCD Draw - PIC16F877A\n\
; >> Add "KS0108 GLCD 128x64" Data=PORTB, Ctrl=PORTD\n\
; >> RS=RD0, EN=RD2, CS1=RD3, CS2=RD4\n\
;\n\
; Draws a pattern across both halves of the display\n\
\n\
    LIST P=16F877A\n\
\n\
RS_PIN   EQU 0\n\
EN_PIN   EQU 2\n\
CS1_PIN  EQU 3\n\
CS2_PIN  EQU 4\n\
\n\
    CBLOCK 0x20\n\
    PAGE\n\
    COL\n\
    PATTERN\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    CLRF TRISD\n\
    MOVLW 0x06\n\
    MOVWF ADCON1\n\
    BCF STATUS, RP0\n\
    CLRF PORTD\n\
\n\
    ; Display ON: both chips\n\
    BSF PORTD, CS1_PIN\n\
    BSF PORTD, CS2_PIN\n\
    BCF PORTD, RS_PIN      ; Command mode\n\
    MOVLW 0x3F             ; Display ON\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
\n\
    ; Fill CS1 (left half) with vertical lines\n\
    BCF PORTD, CS2_PIN\n\
    BSF PORTD, CS1_PIN\n\
    CLRF PAGE\n\
FILL_CS1_PAGE:\n\
    ; Set page\n\
    BCF PORTD, RS_PIN\n\
    MOVF PAGE, W\n\
    IORLW 0xB8\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    ; Set column 0\n\
    MOVLW 0x40\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    ; Write 64 columns\n\
    BSF PORTD, RS_PIN      ; Data mode\n\
    CLRF COL\n\
CS1_COL:\n\
    ; Pattern: shift based on page for diagonal\n\
    MOVLW 0x01\n\
    MOVWF PATTERN\n\
    MOVF PAGE, W\n\
    BTFSC STATUS, Z\n\
    GOTO CS1_WRITE\n\
    MOVWF DL1\n\
CS1_SHIFT:\n\
    BCF STATUS, C\n\
    RLF PATTERN, F\n\
    DECFSZ DL1, F\n\
    GOTO CS1_SHIFT\n\
CS1_WRITE:\n\
    MOVF PATTERN, W\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    INCF COL, F\n\
    MOVLW 0x40\n\
    SUBWF COL, W\n\
    BTFSS STATUS, Z\n\
    GOTO CS1_COL\n\
    INCF PAGE, F\n\
    MOVLW 0x08\n\
    SUBWF PAGE, W\n\
    BTFSS STATUS, Z\n\
    GOTO FILL_CS1_PAGE\n\
\n\
    ; Fill CS2 (right half) with inverted pattern\n\
    BCF PORTD, CS1_PIN\n\
    BSF PORTD, CS2_PIN\n\
    CLRF PAGE\n\
FILL_CS2_PAGE:\n\
    BCF PORTD, RS_PIN\n\
    MOVF PAGE, W\n\
    IORLW 0xB8\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    MOVLW 0x40\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    BSF PORTD, RS_PIN\n\
    CLRF COL\n\
CS2_COL:\n\
    MOVLW 0xFF\n\
    MOVWF PORTB\n\
    BSF PORTD, EN_PIN\n\
    NOP\n\
    BCF PORTD, EN_PIN\n\
    INCF COL, F\n\
    MOVLW 0x40\n\
    SUBWF COL, W\n\
    BTFSS STATUS, Z\n\
    GOTO CS2_COL\n\
    INCF PAGE, F\n\
    MOVLW 0x08\n\
    SUBWF PAGE, W\n\
    BTFSS STATUS, Z\n\
    GOTO FILL_CS2_PAGE\n\
\n\
DONE:\n\
    GOTO DONE\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'L293D Motor Control',
                description: 'PWM speed control + direction for 2 DC motors (PIC16F84A)',
                source:
'; L293D Motor Control - PIC16F84A\n\
; >> Add "L293D DC Motors" Port=B, EN1=RB0, IN1=RB1, IN2=RB2,\n\
;    EN2=RB3, IN3=RB4, IN4=RB5\n\
;\n\
; Motor A: forward ramp up, then reverse ramp up\n\
; Motor B: opposite direction\n\
; PWM on enable pins for speed control\n\
\n\
    LIST P=16F84A\n\
\n\
EN1      EQU 0\n\
IN1      EQU 1\n\
IN2      EQU 2\n\
EN2      EQU 3\n\
IN3      EQU 4\n\
IN4      EQU 5\n\
\n\
    CBLOCK 0x0C\n\
    DUTY\n\
    PWM_CNT\n\
    PHASE\n\
    FRAME\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
    CLRF DUTY\n\
    CLRF PHASE\n\
\n\
MAIN:\n\
    ; Set direction based on phase\n\
    BTFSC PHASE, 0\n\
    GOTO PHASE_REV\n\
\n\
PHASE_FWD:\n\
    ; Motor A: forward, Motor B: reverse\n\
    BSF PORTB, IN1\n\
    BCF PORTB, IN2\n\
    BCF PORTB, IN3\n\
    BSF PORTB, IN4\n\
    GOTO PWM_LOOP\n\
\n\
PHASE_REV:\n\
    ; Motor A: reverse, Motor B: forward\n\
    BCF PORTB, IN1\n\
    BSF PORTB, IN2\n\
    BSF PORTB, IN3\n\
    BCF PORTB, IN4\n\
\n\
PWM_LOOP:\n\
    ; Generate PWM: DUTY/256 duty cycle\n\
    MOVLW 0x10            ; 16 PWM cycles per frame\n\
    MOVWF FRAME\n\
PWM_FRAME:\n\
    CLRF PWM_CNT\n\
PWM_CYCLE:\n\
    ; Compare PWM counter with duty\n\
    MOVF DUTY, W\n\
    SUBWF PWM_CNT, W\n\
    BTFSC STATUS, C\n\
    GOTO PWM_OFF\n\
    ; ON\n\
    BSF PORTB, EN1\n\
    BSF PORTB, EN2\n\
    GOTO PWM_NEXT\n\
PWM_OFF:\n\
    BCF PORTB, EN1\n\
    BCF PORTB, EN2\n\
PWM_NEXT:\n\
    INCF PWM_CNT, F\n\
    BTFSS PWM_CNT, 4      ; 16 steps per cycle\n\
    GOTO PWM_CYCLE\n\
    DECFSZ FRAME, F\n\
    GOTO PWM_FRAME\n\
\n\
    ; Ramp duty cycle\n\
    MOVLW 0x01\n\
    ADDWF DUTY, F\n\
    ; Check overflow: switch phase\n\
    BTFSC STATUS, Z\n\
    INCF PHASE, F\n\
    GOTO MAIN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'Buzzer Melody',
                description: 'Play a simple melody on buzzer (PIC16F84A)',
                source:
'; Buzzer Melody - PIC16F84A\n\
; >> Add "Buzzer" Port=B, Pin=0 in Virtual HW\n\
; Plays notes by toggling RB0 at different frequencies\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    NOTE_IDX\n\
    HALF_PER\n\
    CYCLES\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; Half-period table (cycles) for notes\n\
; C5=239, D5=213, E5=190, F5=179, G5=159, A5=142, B5=127, C6=120\n\
NOTE_TABLE:\n\
    ADDWF PCL, F\n\
    RETLW 0xEF            ; C5\n\
    RETLW 0xD5            ; D5\n\
    RETLW 0xBE            ; E5\n\
    RETLW 0xB3            ; F5\n\
    RETLW 0x9F            ; G5\n\
    RETLW 0x8E            ; A5\n\
    RETLW 0x7F            ; B5\n\
    RETLW 0x78            ; C6\n\
    RETLW 0x00            ; END marker\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF PORTB\n\
\n\
PLAY:\n\
    CLRF NOTE_IDX\n\
NEXT_NOTE:\n\
    MOVF NOTE_IDX, W\n\
    CALL NOTE_TABLE\n\
    MOVWF HALF_PER\n\
    ; Check end marker\n\
    MOVF HALF_PER, W\n\
    BTFSC STATUS, Z\n\
    GOTO PLAY              ; Restart melody\n\
    ; Play note: 200 toggles\n\
    MOVLW 0xC8\n\
    MOVWF CYCLES\n\
TONE_LOOP:\n\
    BSF PORTB, 0\n\
    MOVF HALF_PER, W\n\
    CALL TONE_DELAY\n\
    BCF PORTB, 0\n\
    MOVF HALF_PER, W\n\
    CALL TONE_DELAY\n\
    DECFSZ CYCLES, F\n\
    GOTO TONE_LOOP\n\
    ; Short pause between notes\n\
    CALL PAUSE\n\
    INCF NOTE_IDX, F\n\
    GOTO NEXT_NOTE\n\
\n\
TONE_DELAY:\n\
    MOVWF DL1\n\
TD: DECFSZ DL1, F\n\
    GOTO TD\n\
    RETURN\n\
\n\
PAUSE:\n\
    MOVLW 0x40\n\
    MOVWF DL1\n\
PA: MOVLW 0xFF\n\
    MOVWF DL2\n\
PB: DECFSZ DL2, F\n\
    GOTO PB\n\
    DECFSZ DL1, F\n\
    GOTO PA\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'Keypad Scanner',
                description: 'Scan 4x4 keypad, show on PORTB LEDs (PIC16F84A)',
                source:
'; Keypad 4x4 Scanner - PIC16F84A\n\
; >> Add "Keypad 4x4" Rows=PORTB bits 0-3, Cols=PORTB bits 4-7\n\
; >> Add "LED Bar" on PORTA to see pressed key code\n\
;\n\
; RB0-RB3 = rows (output, active low scan)\n\
; RB4-RB7 = columns (input, pull-up)\n\
; Scans one row at a time, reads columns\n\
\n\
    LIST P=16F84A\n\
\n\
    CBLOCK 0x0C\n\
    ROW\n\
    COL_VAL\n\
    KEY_CODE\n\
    SCAN_MASK\n\
    DL1\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    MOVLW 0xF0            ; RB0-3 output, RB4-7 input\n\
    MOVWF TRISB\n\
    CLRF TRISA             ; PORTA output (display)\n\
    BCF STATUS, RP0\n\
    MOVLW 0xFF\n\
    MOVWF PORTB\n\
\n\
SCAN:\n\
    CLRF ROW\n\
    MOVLW 0xFE            ; First row active (low)\n\
    MOVWF SCAN_MASK\n\
\n\
SCAN_ROW:\n\
    MOVF SCAN_MASK, W\n\
    MOVWF PORTB\n\
    NOP\n\
    NOP                    ; Settling time\n\
    ; Read columns\n\
    MOVF PORTB, W\n\
    ANDLW 0xF0            ; Keep column bits\n\
    MOVWF COL_VAL\n\
    COMF COL_VAL, F        ; Invert (pressed=1)\n\
    SWAPF COL_VAL, F       ; Move to low nibble\n\
    MOVF COL_VAL, W\n\
    ANDLW 0x0F\n\
    BTFSS STATUS, Z\n\
    GOTO KEY_FOUND\n\
    ; Next row\n\
    INCF ROW, F\n\
    BSF STATUS, C\n\
    RLF SCAN_MASK, F\n\
    MOVLW 0x04\n\
    SUBWF ROW, W\n\
    BTFSS STATUS, Z\n\
    GOTO SCAN_ROW\n\
    GOTO SCAN              ; No key, rescan\n\
\n\
KEY_FOUND:\n\
    ; KEY_CODE = ROW * 4 + column number\n\
    BCF STATUS, C\n\
    RLF ROW, W             ; ROW * 2\n\
    MOVWF KEY_CODE\n\
    BCF STATUS, C\n\
    RLF KEY_CODE, F        ; ROW * 4\n\
    ; Find which column\n\
    BTFSC COL_VAL, 0\n\
    GOTO COL0\n\
    BTFSC COL_VAL, 1\n\
    GOTO COL1\n\
    BTFSC COL_VAL, 2\n\
    GOTO COL2\n\
    GOTO COL3\n\
COL0:\n\
    GOTO SHOW_KEY\n\
COL1:\n\
    INCF KEY_CODE, F\n\
    GOTO SHOW_KEY\n\
COL2:\n\
    INCF KEY_CODE, F\n\
    INCF KEY_CODE, F\n\
    GOTO SHOW_KEY\n\
COL3:\n\
    INCF KEY_CODE, F\n\
    INCF KEY_CODE, F\n\
    INCF KEY_CODE, F\n\
\n\
SHOW_KEY:\n\
    MOVF KEY_CODE, W\n\
    MOVWF PORTA            ; Display key code (0-15)\n\
    CALL DEBOUNCE\n\
    GOTO SCAN\n\
\n\
DEBOUNCE:\n\
    MOVLW 0xFF\n\
    MOVWF DL1\n\
DB: DECFSZ DL1, F\n\
    GOTO DB\n\
    RETURN\n\
\n\
    END'
            },
            {
                category: 'Virtual HW', name: 'RGB LED Color Cycle',
                description: 'Cycle through colors on RGB LED (PIC16F84A)',
                source:
'; RGB LED Color Cycle - PIC16F84A\n\
; >> Add "RGB LED" Port=B, R=RB0, G=RB1, B=RB2 in Virtual HW\n\
;\n\
; Simple: cycles through 7 colors using on/off per channel\n\
; Red, Green, Blue, Yellow, Cyan, Magenta, White\n\
\n\
    LIST P=16F84A\n\
\n\
R_PIN    EQU 0\n\
G_PIN    EQU 1\n\
B_PIN    EQU 2\n\
\n\
    CBLOCK 0x0C\n\
    COLOR\n\
    DL1\n\
    DL2\n\
    ENDC\n\
\n\
    ORG 0x00\n\
    GOTO START\n\
    ORG 0x04\n\
    RETFIE\n\
\n\
; Color table: bit0=R, bit1=G, bit2=B\n\
COLORS:\n\
    ADDWF PCL, F\n\
    RETLW 0x01            ; Red\n\
    RETLW 0x02            ; Green\n\
    RETLW 0x04            ; Blue\n\
    RETLW 0x03            ; Yellow (R+G)\n\
    RETLW 0x06            ; Cyan (G+B)\n\
    RETLW 0x05            ; Magenta (R+B)\n\
    RETLW 0x07            ; White (R+G+B)\n\
\n\
START:\n\
    BSF STATUS, RP0\n\
    CLRF TRISB\n\
    BCF STATUS, RP0\n\
    CLRF COLOR\n\
\n\
MAIN:\n\
    MOVF COLOR, W\n\
    CALL COLORS\n\
    MOVWF PORTB\n\
    CALL DELAY\n\
    INCF COLOR, F\n\
    MOVLW 0x07\n\
    SUBWF COLOR, W\n\
    BTFSC STATUS, Z\n\
    CLRF COLOR\n\
    GOTO MAIN\n\
\n\
DELAY:\n\
    MOVLW 0x60\n\
    MOVWF DL1\n\
D1: MOVLW 0xFF\n\
    MOVWF DL2\n\
D2: DECFSZ DL2, F\n\
    GOTO D2\n\
    DECFSZ DL1, F\n\
    GOTO D1\n\
    RETURN\n\
\n\
    END'
            }
        ];
    }

    // ================================================================
    //  MAIN UPDATE (chiama tutti i moduli)
    // ================================================================

    update() {
        this.registersModule.update();
        if (this.interruptsModule) this.interruptsModule.update();
        this.portsModule.update();
        if (this.timersModule) this.timersModule.update();
        if (this.terminalModule) this.terminalModule.update();
        if (this.ccpModule) this.ccpModule.update();
        if (this.adcModule) this.adcModule.update();
        if (this.comparatorModule) this.comparatorModule.update();
        if (this.msspModule) this.msspModule.update();
        if (this.virtualHWModule) this.virtualHWModule.update();
        this.memoryModule.update();
        this.editorModule.update();
        this.watchesModule.update();
        this.breakpointsModule.update();

        // Current instruction display
        var instr = this.simulator.getCurrentInstruction();
        var instrEl = document.getElementById('current-instruction');
        if (instrEl) instrEl.textContent = instr.address.toString(16).toUpperCase().padStart(3, '0') + ': ' + instr.disassembly;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimulatorUI;
}
