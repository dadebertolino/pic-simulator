/**
 * PicSim Project Wizard
 * Wizard step-by-step per creazione nuovo progetto
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.ProjectWizard = (function() {
    'use strict';

    const API = PicSim.API.Projects;

    // State
    let overlay = null;
    let callbacks = {};
    let currentStep = 1;
    let projectData = {
        name: '',
        description: '',
        device: 'PIC16F84A',
        clock: 4000000,
        template: 'blank'
    };

    // Device info
    const devices = {
        'PIC16F84A': {
            name: 'PIC16F84A',
            description: 'Microcontrollore base, ideale per principianti',
            flash: '1K x 14 words',
            ram: '68 bytes',
            eeprom: '64 bytes',
            io: '13 pin I/O',
            features: ['Timer0', '4 Interrupt sources', 'Watchdog Timer'],
            difficulty: 'Principiante'
        },
        'PIC16F628A': {
            name: 'PIC16F628A',
            description: 'Versione potenziata con più memoria e periferiche',
            flash: '2K x 14 words',
            ram: '224 bytes',
            eeprom: '128 bytes',
            io: '16 pin I/O',
            features: ['Timer0/1/2', 'USART', 'CCP', 'Comparatori'],
            difficulty: 'Intermedio'
        },
        'PIC16F877A': {
            name: 'PIC16F877A',
            description: 'Modello avanzato con ADC e molte periferiche',
            flash: '8K x 14 words',
            ram: '368 bytes',
            eeprom: '256 bytes',
            io: '33 pin I/O',
            features: ['Timer0/1/2', 'USART', '2x CCP', 'ADC 10-bit', 'PSP'],
            difficulty: 'Avanzato'
        }
    };

    // Templates
    const templates = {
        blank: {
            name: 'Vuoto',
            description: 'Progetto vuoto con struttura base',
            icon: 'file'
        },
        blink: {
            name: 'LED Blink',
            description: 'Lampeggio LED su PORTB.0',
            icon: 'zap'
        },
        counter: {
            name: 'Contatore',
            description: 'Contatore binario su PORTB',
            icon: 'hash'
        },
        button: {
            name: 'Pulsante',
            description: 'Legge pulsante e accende LED',
            icon: 'toggle-right'
        }
    };

    // Clock presets
    const clockPresets = [
        { value: 4000000, label: '4 MHz (standard)' },
        { value: 8000000, label: '8 MHz' },
        { value: 10000000, label: '10 MHz' },
        { value: 20000000, label: '20 MHz (max)' },
        { value: 32768, label: '32.768 kHz (LP)' }
    ];

    // ==========================================================================
    // PUBLIC INTERFACE
    // ==========================================================================

    /**
     * Mostra wizard
     */
    function show(options = {}) {
        callbacks = options;
        currentStep = 1;
        projectData = {
            name: '',
            description: '',
            device: 'PIC16F84A',
            clock: 4000000,
            template: 'blank'
        };

        createOverlay();
        renderStep();
    }

    /**
     * Chiudi wizard
     */
    function close() {
        if (overlay) {
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                overlay = null;
            }, 200);
        }
        if (callbacks.onCancel) callbacks.onCancel();
    }

    // ==========================================================================
    // RENDERING
    // ==========================================================================

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'picsim-wizard-overlay';
        overlay.innerHTML = `
            <div class="picsim-wizard">
                <div class="picsim-wizard-header">
                    <h2>Nuovo Progetto</h2>
                    <button class="picsim-wizard-close">&times;</button>
                </div>
                
                <div class="picsim-wizard-steps">
                    <div class="picsim-step active" data-step="1">
                        <span class="step-num">1</span>
                        <span class="step-label">Device</span>
                    </div>
                    <div class="picsim-step-line"></div>
                    <div class="picsim-step" data-step="2">
                        <span class="step-num">2</span>
                        <span class="step-label">Dettagli</span>
                    </div>
                    <div class="picsim-step-line"></div>
                    <div class="picsim-step" data-step="3">
                        <span class="step-num">3</span>
                        <span class="step-label">Template</span>
                    </div>
                </div>

                <div class="picsim-wizard-body" id="wizard-body">
                </div>

                <div class="picsim-wizard-footer">
                    <button class="picsim-btn" id="wizard-back" style="visibility:hidden">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Indietro
                    </button>
                    <button class="picsim-btn picsim-btn-primary" id="wizard-next">
                        Avanti
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Bind close
        overlay.querySelector('.picsim-wizard-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Bind navigation
        overlay.querySelector('#wizard-back').addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                renderStep();
            }
        });

        overlay.querySelector('#wizard-next').addEventListener('click', () => {
            if (validateStep()) {
                if (currentStep < 3) {
                    currentStep++;
                    renderStep();
                } else {
                    createProject();
                }
            }
        });

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    function renderStep() {
        const body = overlay.querySelector('#wizard-body');
        const backBtn = overlay.querySelector('#wizard-back');
        const nextBtn = overlay.querySelector('#wizard-next');

        // Update steps indicator
        overlay.querySelectorAll('.picsim-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.toggle('active', stepNum === currentStep);
            step.classList.toggle('completed', stepNum < currentStep);
        });

        // Show/hide back button
        backBtn.style.visibility = currentStep > 1 ? 'visible' : 'hidden';

        // Update next button text
        if (currentStep === 3) {
            nextBtn.innerHTML = `
                Crea Progetto
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
        } else {
            nextBtn.innerHTML = `
                Avanti
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
        }

        // Render step content
        switch (currentStep) {
            case 1:
                renderDeviceStep(body);
                break;
            case 2:
                renderDetailsStep(body);
                break;
            case 3:
                renderTemplateStep(body);
                break;
        }
    }

    /**
     * Step 1: Selezione device
     */
    function renderDeviceStep(container) {
        container.innerHTML = `
            <div class="picsim-wizard-step-content">
                <h3>Seleziona il microcontrollore</h3>
                <p class="picsim-wizard-hint">Scegli il dispositivo PIC per il tuo progetto. Non potrà essere modificato dopo.</p>
                
                <div class="picsim-device-grid">
                    ${Object.entries(devices).map(([id, dev]) => `
                        <div class="picsim-device-card ${projectData.device === id ? 'selected' : ''}" data-device="${id}">
                            <div class="picsim-device-header">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                                    <circle cx="8" cy="8" r="1" fill="currentColor"/>
                                    <circle cx="16" cy="8" r="1" fill="currentColor"/>
                                    <circle cx="8" cy="16" r="1" fill="currentColor"/>
                                    <circle cx="16" cy="16" r="1" fill="currentColor"/>
                                    <path d="M1 8h3M1 16h3M20 8h3M20 16h3M8 1v3M16 1v3M8 20v3M16 20v3"/>
                                </svg>
                                <span class="picsim-device-difficulty ${dev.difficulty.toLowerCase()}">${dev.difficulty}</span>
                            </div>
                            <h4>${dev.name}</h4>
                            <p>${dev.description}</p>
                            <div class="picsim-device-specs">
                                <span><strong>Flash:</strong> ${dev.flash}</span>
                                <span><strong>RAM:</strong> ${dev.ram}</span>
                                <span><strong>I/O:</strong> ${dev.io}</span>
                            </div>
                            <div class="picsim-device-features">
                                ${dev.features.slice(0, 3).map(f => `<span class="picsim-feature-tag">${f}</span>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Bind selection
        container.querySelectorAll('.picsim-device-card').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.picsim-device-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                projectData.device = card.dataset.device;
            });
        });
    }

    /**
     * Step 2: Dettagli progetto
     */
    function renderDetailsStep(container) {
        container.innerHTML = `
            <div class="picsim-wizard-step-content">
                <h3>Dettagli del progetto</h3>
                <p class="picsim-wizard-hint">Inserisci le informazioni del progetto</p>
                
                <div class="picsim-form">
                    <div class="picsim-form-group">
                        <label for="project-name">Nome progetto *</label>
                        <input type="text" id="project-name" placeholder="es. LED Blink Test" 
                               value="${escapeHtml(projectData.name)}" maxlength="100" required>
                        <span class="picsim-form-hint">Massimo 100 caratteri</span>
                    </div>

                    <div class="picsim-form-group">
                        <label for="project-desc">Descrizione</label>
                        <textarea id="project-desc" placeholder="Descrizione opzionale del progetto..." 
                                  rows="3" maxlength="500">${escapeHtml(projectData.description)}</textarea>
                        <span class="picsim-form-hint">Massimo 500 caratteri</span>
                    </div>

                    <div class="picsim-form-group">
                        <label for="project-clock">Frequenza clock</label>
                        <select id="project-clock">
                            ${clockPresets.map(c => `
                                <option value="${c.value}" ${projectData.clock === c.value ? 'selected' : ''}>
                                    ${c.label}
                                </option>
                            `).join('')}
                        </select>
                        <span class="picsim-form-hint">Frequenza dell'oscillatore del PIC</span>
                    </div>
                </div>

                <div class="picsim-wizard-summary">
                    <h4>Riepilogo</h4>
                    <div class="picsim-summary-item">
                        <span>Device:</span>
                        <strong>${projectData.device}</strong>
                    </div>
                </div>
            </div>
        `;

        // Bind inputs
        const nameInput = container.querySelector('#project-name');
        const descInput = container.querySelector('#project-desc');
        const clockSelect = container.querySelector('#project-clock');

        nameInput.addEventListener('input', (e) => projectData.name = e.target.value);
        descInput.addEventListener('input', (e) => projectData.description = e.target.value);
        clockSelect.addEventListener('change', (e) => projectData.clock = parseInt(e.target.value));

        // Focus sul nome
        nameInput.focus();
    }

    /**
     * Step 3: Selezione template
     */
    function renderTemplateStep(container) {
        const templateIcons = {
            file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
            zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
            hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
            'toggle-right': '<rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3"/>'
        };

        container.innerHTML = `
            <div class="picsim-wizard-step-content">
                <h3>Scegli un template</h3>
                <p class="picsim-wizard-hint">Seleziona un template di partenza per il tuo progetto</p>
                
                <div class="picsim-template-grid">
                    ${Object.entries(templates).map(([id, tmpl]) => `
                        <div class="picsim-template-card ${projectData.template === id ? 'selected' : ''}" data-template="${id}">
                            <div class="picsim-template-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${templateIcons[tmpl.icon]}
                                </svg>
                            </div>
                            <h4>${tmpl.name}</h4>
                            <p>${tmpl.description}</p>
                        </div>
                    `).join('')}
                </div>

                <div class="picsim-wizard-summary">
                    <h4>Riepilogo progetto</h4>
                    <div class="picsim-summary-item">
                        <span>Nome:</span>
                        <strong>${escapeHtml(projectData.name)}</strong>
                    </div>
                    <div class="picsim-summary-item">
                        <span>Device:</span>
                        <strong>${projectData.device}</strong>
                    </div>
                    <div class="picsim-summary-item">
                        <span>Clock:</span>
                        <strong>${(projectData.clock / 1000000).toFixed(2)} MHz</strong>
                    </div>
                </div>
            </div>
        `;

        // Bind selection
        container.querySelectorAll('.picsim-template-card').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.picsim-template-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                projectData.template = card.dataset.template;
            });
        });
    }

    // ==========================================================================
    // VALIDATION & CREATION
    // ==========================================================================

    function validateStep() {
        switch (currentStep) {
            case 1:
                if (!projectData.device) {
                    showStepError('Seleziona un device');
                    return false;
                }
                break;
            case 2:
                if (!projectData.name.trim()) {
                    showStepError('Inserisci un nome per il progetto');
                    overlay.querySelector('#project-name').focus();
                    return false;
                }
                if (projectData.name.length > 100) {
                    showStepError('Il nome non può superare 100 caratteri');
                    return false;
                }
                break;
            case 3:
                // Template sempre valido
                break;
        }
        return true;
    }

    function showStepError(message) {
        PicSim.Dashboard.toast(message, 'error');
    }

    async function createProject() {
        const nextBtn = overlay.querySelector('#wizard-next');
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<div class="picsim-spinner small"></div> Creazione...';

        try {
            const project = await API.create({
                name: projectData.name.trim(),
                description: projectData.description.trim(),
                device: projectData.device,
                clock: projectData.clock,
                type: 'personal'
            });

            // Chiudi wizard
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                overlay = null;
            }, 200);

            // Callback
            if (callbacks.onComplete) {
                callbacks.onComplete(project);
            }

        } catch (err) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = `
                Crea Progetto
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            `;
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    // ==========================================================================
    // UTILITIES
    // ==========================================================================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        show,
        close
    };

})();
