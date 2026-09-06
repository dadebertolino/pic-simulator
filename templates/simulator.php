<?php
/**
 * WebPicSimulator - Template Simulatore
 * Design ispirato a S7-1200 Simulator
 */
defined('ABSPATH') || exit;
?>

<div id="pic-simulator" class="picsim" tabindex="-1" style="<?php echo $style; ?>">
    
    <!-- HEADER -->
    <header class="picsim__header">
        <!-- Logo (sempre visibile) -->
        <div class="picsim__logo">
            <svg class="picsim__logo-icon" viewBox="0 0 32 32" width="32" height="32">
                <rect x="4" y="8" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                <circle cx="10" cy="16" r="2" fill="currentColor"/>
                <circle cx="16" cy="16" r="2" fill="currentColor"/>
                <circle cx="22" cy="16" r="2" fill="currentColor"/>
                <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" stroke-width="2"/>
                <line x1="16" y1="4" x2="16" y2="8" stroke="currentColor" stroke-width="2"/>
                <line x1="24" y1="4" x2="24" y2="8" stroke="currentColor" stroke-width="2"/>
                <line x1="8" y1="24" x2="8" y2="28" stroke="currentColor" stroke-width="2"/>
                <line x1="16" y1="24" x2="16" y2="28" stroke="currentColor" stroke-width="2"/>
                <line x1="24" y1="24" x2="24" y2="28" stroke="currentColor" stroke-width="2"/>
            </svg>
            <span class="picsim__title">WebPicSimulator</span>
            <span class="picsim__author">by Prof. D. Bertolino</span>
        </div>
        
        <!-- Toolbar (solo in fullscreen) -->
        <div class="picsim__toolbar">
            <button class="picsim__btn" id="btn-new" title="Nuovo programma (Ctrl+N)">📄 New</button>
            <button class="picsim__btn picsim__btn--primary" id="btn-assemble" title="Assembla (Ctrl+Enter)">▶ Assembla</button>
            <button class="picsim__btn picsim__btn--success" id="btn-run" title="Run (F5)">▶ Run</button>
            <button class="picsim__btn picsim__btn--warning" id="btn-animate" title="Animate (F6)">⏯ Animate</button>
            <button class="picsim__btn picsim__btn--danger" id="btn-stop" title="Stop (Esc)" disabled>■ Stop</button>
            <span class="picsim__toolbar-sep"></span>
            <button class="picsim__btn" id="btn-step" title="Step (F8)">⤵ Step</button>
            <button class="picsim__btn" id="btn-step-over" title="Step Over (F10)">⤳ Over</button>
            <button class="picsim__btn" id="btn-reset" title="Reset">↺ Reset</button>
            <span class="picsim__toolbar-sep"></span>
            <button class="picsim__btn" id="btn-load" title="Apri file (Ctrl+O)">📂 Load</button>
            <button class="picsim__btn" id="btn-save" title="Salva file (Ctrl+S)">💾 Save</button>
            <select id="examples-select" class="picsim__select" title="Carica esempio">
                <option value="">📚 Esempi...</option>
                <option value="01_blink_led">01 - Blink LED</option>
                <option value="02_binary_counter">02 - Contatore Binario</option>
                <option value="03_button_led">03 - Pulsante e LED</option>
                <option value="04_knight_rider">04 - Knight Rider</option>
                <option value="05_timer0_interrupt">05 - Timer0 Interrupt</option>
                <option value="06_external_interrupt">06 - Interrupt Esterno</option>
                <option value="07_eeprom">07 - EEPROM</option>
                <option value="08_lookup_table">08 - Tabella Lookup</option>
                <option value="09_subroutines_stack">09 - Subroutine e Stack</option>
                <option value="10_state_machine">10 - Macchina a Stati</option>
            </select>
            <span class="picsim__toolbar-sep"></span>
            <span class="picsim__speed-group">
                <span>🚀</span>
                <input type="range" id="speed-slider" class="picsim__speed-slider" min="1" max="5" value="3" title="Velocità">
                <span id="speed-value" class="picsim__speed-val">10 Hz</span>
            </span>
        </div>
        
        <!-- Pulsante Fullscreen (solo in fullscreen, per uscire) -->
        <button class="picsim__btn-fullscreen" id="btn-fullscreen" title="Esci da schermo intero (F11)">
            <svg id="icon-expand" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
            <svg id="icon-compress" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
                <path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"/>
            </svg>
        </button>
        
        <!-- Pulsante fullscreen per modalità normale -->
        <button class="picsim__expand-btn" id="btn-fullscreen2" title="Schermo intero (F11)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
        </button>
    </header>
    
    <!-- MINI TOOLBAR (solo modalità normale) -->
    <div class="picsim__mini-toolbar">
        <button class="picsim__mbtn" id="btn-new2" title="Nuovo">📄</button>
        <button class="picsim__mbtn picsim__mbtn--primary" id="btn-assemble2">▶ Assembla</button>
        <button class="picsim__mbtn picsim__mbtn--success" id="btn-run2">▶ Run</button>
        <button class="picsim__mbtn picsim__mbtn--warning" id="btn-animate2">⏯</button>
        <button class="picsim__mbtn picsim__mbtn--danger" id="btn-stop2" disabled>■</button>
        <button class="picsim__mbtn" id="btn-step2">⤵</button>
        <button class="picsim__mbtn" id="btn-reset2">↺</button>
        <span class="picsim__mini-sep"></span>
        <button class="picsim__mbtn" id="btn-load2">📂</button>
        <button class="picsim__mbtn" id="btn-save2">💾</button>
        <select id="examples-select2" class="picsim__mini-select">
            <option value="">📚</option>
            <option value="01_blink_led">01</option>
            <option value="02_binary_counter">02</option>
            <option value="03_button_led">03</option>
            <option value="04_knight_rider">04</option>
            <option value="05_timer0_interrupt">05</option>
            <option value="06_external_interrupt">06</option>
            <option value="07_eeprom">07</option>
            <option value="08_lookup_table">08</option>
            <option value="09_subroutines_stack">09</option>
            <option value="10_state_machine">10</option>
        </select>
        <span class="picsim__mini-sep"></span>
        <span class="picsim__speed-group">
            <span class="picsim__speed-label">🚀</span>
            <input type="range" id="speed-slider2" class="picsim__speed-slider" min="1" max="5" value="3" title="Velocità simulazione">
            <span id="speed-value2" class="picsim__speed-val">10 Hz</span>
        </span>
    </div>
    
    <!-- MAIN CONTENT -->
    <div class="picsim__main">
        <!-- Editor -->
        <div class="picsim__editor-panel">
            <div class="picsim__editor-container">
                <div class="picsim__line-numbers" id="line-numbers"></div>
                <div class="picsim__editor-wrapper">
                    <div class="picsim__line-highlight" id="line-highlight"></div>
                    <textarea id="code-editor" class="picsim__editor" spellcheck="false" placeholder="; Scrivi il tuo codice ASM qui..."></textarea>
                </div>
            </div>
            <div class="picsim__errors" id="error-panel"></div>
        </div>
        
        <!-- Panels -->
        <div class="picsim__panels">
            <div class="picsim__panel">
                <div class="picsim__panel-header">Registri</div>
                <div class="picsim__panel-content">
                    <div class="picsim__registers">
                        <div class="picsim__reg"><span class="picsim__reg-name">W</span><span class="picsim__reg-value" id="reg-w">00</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">PC</span><span class="picsim__reg-value" id="reg-pc">000</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">STATUS</span><span class="picsim__reg-value" id="reg-status">00</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">FSR</span><span class="picsim__reg-value" id="reg-fsr">00</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">OPTION</span><span class="picsim__reg-value" id="reg-option">FF</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">INTCON</span><span class="picsim__reg-value" id="reg-intcon">00</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">TMR0</span><span class="picsim__reg-value" id="reg-tmr0">00</span></div>
                        <div class="picsim__reg"><span class="picsim__reg-name">PCLATH</span><span class="picsim__reg-value" id="reg-pclath">00</span></div>
                    </div>
                    <div class="picsim__status-bits">
                        <span class="picsim__bit" id="bit-c" title="Carry">C</span>
                        <span class="picsim__bit" id="bit-dc" title="Digit Carry">DC</span>
                        <span class="picsim__bit" id="bit-z" title="Zero">Z</span>
                        <span class="picsim__bit" id="bit-pd" title="Power Down">PD</span>
                        <span class="picsim__bit" id="bit-to" title="Timeout">TO</span>
                        <span class="picsim__bit" id="bit-rp0" title="Bank Select">RP0</span>
                    </div>
                </div>
            </div>
            
            <div class="picsim__panel">
                <div class="picsim__panel-header">I/O Ports</div>
                <div class="picsim__panel-content">
                    <div class="picsim__port-legend">
                        <span class="picsim__legend-item"><span class="picsim__legend-pin picsim__legend-pin--in"></span> IN</span>
                        <span class="picsim__legend-item"><span class="picsim__legend-pin picsim__legend-pin--out"></span> OUT</span>
                        <span class="picsim__legend-item"><span class="picsim__legend-pin picsim__legend-pin--high"></span> HIGH</span>
                        <span class="picsim__legend-item"><span class="picsim__legend-pin picsim__legend-pin--low"></span> LOW</span>
                    </div>
                    <div class="picsim__port">
                        <div class="picsim__port-header">
                            <span class="picsim__port-name">PORTA</span>
                            <span class="picsim__port-value" id="porta-value">00</span>
                            <span class="picsim__port-tris">TRIS: <span id="trisa-value" class="picsim__tris-val" data-port="A" title="Click per editare">1F</span></span>
                        </div>
                        <div class="picsim__port-pins" id="porta-pins">
                            <div class="picsim__pin" data-port="A" data-bit="4" title="RA4/T0CKI">4</div>
                            <div class="picsim__pin" data-port="A" data-bit="3" title="RA3">3</div>
                            <div class="picsim__pin" data-port="A" data-bit="2" title="RA2">2</div>
                            <div class="picsim__pin" data-port="A" data-bit="1" title="RA1">1</div>
                            <div class="picsim__pin" data-port="A" data-bit="0" title="RA0">0</div>
                        </div>
                    </div>
                    <div class="picsim__port">
                        <div class="picsim__port-header">
                            <span class="picsim__port-name">PORTB</span>
                            <span class="picsim__port-value" id="portb-value">00</span>
                            <span class="picsim__port-tris">TRIS: <span id="trisb-value" class="picsim__tris-val" data-port="B" title="Click per editare">FF</span></span>
                        </div>
                        <div class="picsim__port-pins" id="portb-pins">
                            <div class="picsim__pin" data-port="B" data-bit="7" title="RB7">7</div>
                            <div class="picsim__pin" data-port="B" data-bit="6" title="RB6">6</div>
                            <div class="picsim__pin" data-port="B" data-bit="5" title="RB5">5</div>
                            <div class="picsim__pin" data-port="B" data-bit="4" title="RB4">4</div>
                            <div class="picsim__pin" data-port="B" data-bit="3" title="RB3">3</div>
                            <div class="picsim__pin" data-port="B" data-bit="2" title="RB2">2</div>
                            <div class="picsim__pin" data-port="B" data-bit="1" title="RB1">1</div>
                            <div class="picsim__pin" data-port="B" data-bit="0" title="RB0/INT">0</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="picsim__panel">
                <div class="picsim__panel-header">Stack <span class="picsim__panel-badge" id="stack-depth">0/8</span></div>
                <div class="picsim__panel-content"><div id="stack-view"></div></div>
            </div>
            
            <div class="picsim__panel">
                <div class="picsim__panel-header">Timer</div>
                <div class="picsim__panel-content">
                    <div class="picsim__timer-row">
                        <span>TMR0:</span>
                        <span id="tmr0-display">00</span>
                        <span class="picsim__timer-bar"><span id="tmr0-bar" style="width:0%"></span></span>
                    </div>
                    <div class="picsim__timer-info">
                        <span>Prescaler: <span id="prescaler-value">1:2</span></span>
                        <span>Source: <span id="tmr0-source">Internal</span></span>
                    </div>
                </div>
            </div>
            
            <div class="picsim__panel">
                <div class="picsim__panel-header">
                    Memory
                    <div class="picsim__memory-tabs">
                        <button class="picsim__memory-tab picsim__memory-tab--active" data-type="ram">RAM</button>
                        <button class="picsim__memory-tab" data-type="program">Prog</button>
                        <button class="picsim__memory-tab" data-type="eeprom">EE</button>
                    </div>
                </div>
                <div class="picsim__panel-content picsim__panel-content--scroll"><div id="memory-view"></div></div>
            </div>
            
            <div class="picsim__panel">
                <div class="picsim__panel-header">Breakpoints <button class="picsim__btn-x" id="btn-clear-breakpoints">✕</button></div>
                <div class="picsim__panel-content"><div id="breakpoints-list"><em class="picsim__hint">Click sui numeri di riga</em></div></div>
            </div>
        </div>
    </div>
    
    <!-- FOOTER -->
    <footer class="picsim__footer">
        <!-- Info simulazione (solo fullscreen) -->
        <div class="picsim__footer-left">
            <span class="picsim__status-dot" id="status-dot"></span>
            <span id="status-text">Ready</span>
            <span class="picsim__footer-sep">|</span>
            <span>Cycles: <strong id="cycles-count">0</strong></span>
            <span class="picsim__footer-sep">|</span>
            <span id="current-instruction">-</span>
        </div>
        
        <!-- Copyright (sempre visibile, centrato) -->
        <div class="picsim__footer-center">
            © <?php echo date('Y'); ?> Davide "the Prof." Bertolino
            <span class="picsim__footer-sep">—</span>
            <a href="https://www.davidebertolino.it" target="_blank">www.davidebertolino.it</a>
            <span class="picsim__footer-sep">—</span>
            <a href="mailto:info@davidebertolino.it">info@davidebertolino.it</a>
        </div>
        
        <!-- Versione (sempre visibile, destra) -->
        <div class="picsim__footer-right">WebPicSimulator v<?php echo PICSIM_VERSION; ?></div>
    </footer>
    
    <input type="file" id="file-input" accept=".asm,.txt,.inc" style="display:none">
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    if (typeof PIC16F84A === 'undefined' || typeof PIC16Assembler === 'undefined' || 
        typeof Simulator === 'undefined' || typeof SimulatorUI === 'undefined') {
        document.getElementById('status-text').textContent = 'Error: Scripts not loaded';
        return;
    }
    
    const cpu = new PIC16F84A();
    const assembler = new PIC16Assembler();
    const simulator = new Simulator(cpu, assembler);
    const ui = new SimulatorUI(simulator);
    ui.init();
    window.picSim = { cpu, assembler, simulator, ui };
    
    // === FULLSCREEN ===
    const container = document.getElementById('pic-simulator');
    const btnFS = document.getElementById('btn-fullscreen');
    const btnFS2 = document.getElementById('btn-fullscreen2');
    const iconExp = document.getElementById('icon-expand');
    const iconComp = document.getElementById('icon-compress');
    
    function setFullscreen(fs) {
        container.classList.toggle('picsim--fullscreen', fs);
        if (iconExp) iconExp.style.display = fs ? 'none' : 'block';
        if (iconComp) iconComp.style.display = fs ? 'block' : 'none';
    }
    
    // Se requestFullscreen fallisce si ripiega sulla classe CSS. In quel caso
    // document.fullscreenElement resta null, quindi lo stato va tracciato a
    // parte: altrimenti il secondo click ritenta l'ingresso invece di uscire.
    let cssFullscreen = false;
    
    function toggleFS() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            return;
        }
        if (cssFullscreen) {
            cssFullscreen = false;
            setFullscreen(false);
            return;
        }
        // Se l'API manca del tutto (Safari datati, iframe senza permesso)
        // chiamarla solleverebbe un TypeError invece di ripiegare.
        if (!container.requestFullscreen) {
            cssFullscreen = true;
            setFullscreen(true);
            return;
        }
        container.requestFullscreen().catch(() => {
            cssFullscreen = true;
            setFullscreen(true);
        });
    }
    
    btnFS?.addEventListener('click', toggleFS);
    btnFS2?.addEventListener('click', toggleFS);
    document.addEventListener('fullscreenchange', () => {
        cssFullscreen = false;
        setFullscreen(!!document.fullscreenElement);
    });
    // Come per le altre scorciatoie: solo quando il simulatore e' in uso,
    // altrimenti F11 verrebbe rubato all'intera pagina che ospita il plugin.
    document.addEventListener('keydown', e => {
        if (e.key === 'F11' && ui.isActive()) { e.preventDefault(); toggleFS(); }
    });
    
    // === MINI TOOLBAR ===
    [['btn-new2','btn-new'],['btn-assemble2','btn-assemble'],['btn-run2','btn-run'],['btn-animate2','btn-animate'],
     ['btn-stop2','btn-stop'],['btn-step2','btn-step'],['btn-reset2','btn-reset'],
     ['btn-load2','btn-load'],['btn-save2','btn-save']].forEach(([m,n]) => {
        const mb = document.getElementById(m), nb = document.getElementById(n);
        if (mb && nb) {
            mb.addEventListener('click', () => nb.click());
            new MutationObserver(() => mb.disabled = nb.disabled).observe(nb, {attributes:true,attributeFilter:['disabled']});
        }
    });
    
    // === SPEED SLIDER ===
    const slider1 = document.getElementById('speed-slider');
    const slider2 = document.getElementById('speed-slider2');
    const speedVal1 = document.getElementById('speed-value');
    const speedVal2 = document.getElementById('speed-value2');
    const speeds = [1000, 500, 100, 50, 10];
    const labels = ['1 Hz', '2 Hz', '10 Hz', '20 Hz', '100 Hz'];
    
    function updateSpeed(val) {
        const idx = parseInt(val) - 1;
        ui.animateSpeed = speeds[idx] || 100;
        const label = labels[idx] || '10 Hz';
        if (speedVal1) speedVal1.textContent = label;
        if (speedVal2) speedVal2.textContent = label;
        if (slider1) slider1.value = val;
        if (slider2) slider2.value = val;
    }
    
    slider1?.addEventListener('input', e => updateSpeed(e.target.value));
    slider2?.addEventListener('input', e => updateSpeed(e.target.value));
    
    // === ESEMPI ===
    function loadEx(v) {
        if (!v) return;
        fetch('<?php echo PICSIM_URL; ?>examples/' + v + '.asm')
            .then(r => r.ok ? r.text() : Promise.reject())
            .then(c => { ui.fullReset(); ui.setSource(c); ui.setStatus('Caricato: ' + v, 'success'); })
            .catch(() => ui.setStatus('Errore', 'error'));
    }
    document.getElementById('examples-select')?.addEventListener('change', function() { loadEx(this.value); this.value = ''; });
    document.getElementById('examples-select2')?.addEventListener('change', function() { loadEx(this.value); this.value = ''; });
    
    console.log('WebPicSimulator v<?php echo PICSIM_VERSION; ?>');
});
</script>
