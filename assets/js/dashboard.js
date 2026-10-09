/**
 * PicSim Dashboard Controller
 * Gestisce navigazione e viste della dashboard
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.Dashboard = (function() {
    'use strict';

    // State
    let container = null;
    let currentView = 'projects';
    let isTeacher = false;

    // Moduli (caricati dinamicamente)
    const modules = {
        projects: null,
        wizard: null,
        classes: null,
        assignments: null,
        editor: null
    };

    // ==========================================================================
    // INIZIALIZZAZIONE
    // ==========================================================================

    /**
     * Inizializza dashboard
     * @param {HTMLElement} el - Container element
     * @param {Object} options - { isTeacher: bool }
     */
    function init(el, options = {}) {
        container = el;
        isTeacher = options.isTeacher || false;

        render();
        bindEvents();
        
        // Carica vista iniziale da URL o default
        const hash = window.location.hash.slice(1);
        if (hash) {
            navigateTo(hash);
        } else {
            showView('projects');
        }
    }

    /**
     * Render struttura base
     */
    function render() {
        container.innerHTML = `
            <div class="picsim-dashboard">
                <!-- Header -->
                <header class="picsim-dash-header">
                    <div class="picsim-dash-logo">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                            <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
                            <circle cx="15" cy="9" r="1.5" fill="currentColor"/>
                            <path d="M9 14h6"/>
                        </svg>
                        <div>
                            <h1>WebPicSimulator</h1>
                            <span class="picsim-dash-subtitle">Dashboard</span>
                        </div>
                    </div>
                    
                    <nav class="picsim-dash-nav">
                        <button class="picsim-nav-btn active" data-view="projects">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                            </svg>
                            Progetti
                        </button>
                        ${isTeacher ? `
                        <button class="picsim-nav-btn" data-view="classes">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                            </svg>
                            Classi
                        </button>
                        ` : ''}
                        <button class="picsim-nav-btn" data-view="assignments">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                            </svg>
                            ${isTeacher ? 'Assegnazioni' : 'Compiti'}
                        </button>
                    </nav>

                    <div class="picsim-dash-actions">
                        <button class="picsim-btn picsim-btn-primary" id="picsim-new-project">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Nuovo Progetto
                        </button>
                    </div>
                </header>

                <!-- Content Area -->
                <main class="picsim-dash-content" id="picsim-dash-content">
                    <div class="picsim-loading">
                        <div class="picsim-spinner"></div>
                        <span>Caricamento...</span>
                    </div>
                </main>

                <!-- Modals Container -->
                <div id="picsim-modals"></div>

                <!-- Toast Container -->
                <div id="picsim-toasts" class="picsim-toasts"></div>
            </div>
        `;
    }

    /**
     * Bind event handlers
     */
    function bindEvents() {
        // Navigazione
        container.querySelectorAll('.picsim-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                navigateTo(view);
            });
        });

        // Nuovo progetto
        container.querySelector('#picsim-new-project')?.addEventListener('click', () => {
            showWizard();
        });

        // Hash change
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash && hash !== currentView) {
                navigateTo(hash);
            }
        });
    }

    // ==========================================================================
    // NAVIGAZIONE
    // ==========================================================================

    /**
     * Naviga a vista specifica
     */
    function navigateTo(view) {
        // Parsing vista: "projects", "project/123", "class/5", etc.
        const [viewName, viewId] = view.split('/');
        
        // Aggiorna URL senza reload
        if (window.location.hash !== '#' + view) {
            history.pushState(null, '', '#' + view);
        }

        // Aggiorna nav buttons
        container.querySelectorAll('.picsim-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        currentView = view;
        showView(viewName, viewId);
    }

    /**
     * Mostra vista specifica
     */
    async function showView(viewName, viewId = null) {
        const content = container.querySelector('#picsim-dash-content');
        
        // Loading
        content.innerHTML = `
            <div class="picsim-loading">
                <div class="picsim-spinner"></div>
            </div>
        `;

        try {
            switch (viewName) {
                case 'projects':
                    await showProjectsView(content);
                    break;
                case 'project':
                    await showEditorView(content, viewId);
                    break;
                case 'classes':
                    if (isTeacher) {
                        await showClassesView(content);
                    } else {
                        navigateTo('projects');
                    }
                    break;
                case 'class':
                    await showClassDetailView(content, viewId);
                    break;
                case 'assignments':
                    await showAssignmentsView(content);
                    break;
                case 'assignment':
                    await showAssignmentDetailView(content, viewId);
                    break;
                default:
                    navigateTo('projects');
            }
        } catch (err) {
            showError(content, err.message);
        }
    }

    // ==========================================================================
    // VISTE
    // ==========================================================================

    /**
     * Vista lista progetti
     */
    async function showProjectsView(content) {
        if (!modules.projects) {
            modules.projects = PicSim.ProjectList;
        }
        await modules.projects.render(content, {
            onOpen: (project) => navigateTo('project/' + project.id),
            onNew: () => showWizard()
        });
    }

    /**
     * Vista editor progetto
     */
    async function showEditorView(content, projectId) {
        if (!modules.editor) {
            modules.editor = PicSim.ProjectEditor;
        }
        await modules.editor.render(content, projectId, {
            onBack: () => navigateTo('projects')
        });
    }

    /**
     * Vista gestione classi (docente)
     */
    async function showClassesView(content) {
        if (!modules.classes) {
            modules.classes = PicSim.ClassManager;
        }
        await modules.classes.render(content, {
            onOpenClass: (cls) => navigateTo('class/' + cls.id)
        });
    }

    /**
     * Vista dettaglio classe
     */
    async function showClassDetailView(content, classId) {
        if (!modules.classes) {
            modules.classes = PicSim.ClassManager;
        }
        await modules.classes.renderDetail(content, classId, {
            onBack: () => navigateTo('classes')
        });
    }

    /**
     * Vista assegnazioni
     */
    async function showAssignmentsView(content) {
        if (!modules.assignments) {
            modules.assignments = PicSim.AssignmentManager;
        }
        await modules.assignments.render(content, {
            isTeacher,
            onOpenAssignment: (a) => navigateTo('assignment/' + a.id)
        });
    }

    /**
     * Vista dettaglio assegnazione
     */
    async function showAssignmentDetailView(content, assignmentId) {
        if (!modules.assignments) {
            modules.assignments = PicSim.AssignmentManager;
        }
        await modules.assignments.renderDetail(content, assignmentId, {
            isTeacher,
            onBack: () => navigateTo('assignments'),
            onOpenSubmission: (s) => navigateTo('project/' + s.id)
        });
    }

    // ==========================================================================
    // WIZARD NUOVO PROGETTO
    // ==========================================================================

    function showWizard() {
        if (!modules.wizard) {
            modules.wizard = PicSim.ProjectWizard;
        }
        modules.wizard.show({
            onComplete: (project) => {
                navigateTo('project/' + project.id);
                toast('Progetto creato!', 'success');
            },
            onCancel: () => {}
        });
    }

    // ==========================================================================
    // MODALS & TOASTS
    // ==========================================================================

    /**
     * Mostra modal generico
     */
    function showModal(options) {
        const { title, content, actions, onClose } = options;
        const modalsContainer = container.querySelector('#picsim-modals');

        const modal = document.createElement('div');
        modal.className = 'picsim-modal-overlay';
        modal.innerHTML = `
            <div class="picsim-modal">
                <div class="picsim-modal-header">
                    <h3>${title}</h3>
                    <button class="picsim-modal-close">&times;</button>
                </div>
                <div class="picsim-modal-body">
                    ${typeof content === 'string' ? content : ''}
                </div>
                ${actions ? `
                <div class="picsim-modal-footer">
                    ${actions.map(a => `
                        <button class="picsim-btn ${a.primary ? 'picsim-btn-primary' : ''}" 
                                data-action="${a.action}">${a.label}</button>
                    `).join('')}
                </div>
                ` : ''}
            </div>
        `;

        // Content come elemento
        if (typeof content !== 'string') {
            modal.querySelector('.picsim-modal-body').appendChild(content);
        }

        // Close handlers
        const close = () => {
            modal.classList.add('closing');
            setTimeout(() => modal.remove(), 200);
            if (onClose) onClose();
        };

        modal.querySelector('.picsim-modal-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });

        // Action handlers
        modal.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const handler = options['on' + action.charAt(0).toUpperCase() + action.slice(1)];
                if (handler) handler();
                if (!btn.classList.contains('no-close')) close();
            });
        });

        modalsContainer.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('visible'));

        return { close };
    }

    /**
     * Conferma dialog
     */
    function confirm(message, options = {}) {
        return new Promise((resolve) => {
            showModal({
                title: options.title || 'Conferma',
                content: `<p>${message}</p>`,
                actions: [
                    { label: options.cancelText || 'Annulla', action: 'cancel' },
                    { label: options.confirmText || 'Conferma', action: 'confirm', primary: true }
                ],
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false),
                onClose: () => resolve(false)
            });
        });
    }

    /**
     * Toast notification
     */
    function toast(message, type = 'info', duration = 3000) {
        const toasts = container.querySelector('#picsim-toasts');
        
        const toast = document.createElement('div');
        toast.className = `picsim-toast picsim-toast-${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="picsim-toast-close">&times;</button>
        `;

        toast.querySelector('.picsim-toast-close').addEventListener('click', () => {
            toast.classList.add('closing');
            setTimeout(() => toast.remove(), 200);
        });

        toasts.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('closing');
                setTimeout(() => toast.remove(), 200);
            }, duration);
        }
    }

    /**
     * Mostra errore nella content area
     */
    function showError(content, message) {
        content.innerHTML = `
            <div class="picsim-error-view">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <h3>Errore</h3>
                <p>${message}</p>
                <button class="picsim-btn" onclick="location.reload()">Ricarica</button>
            </div>
        `;
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        init,
        navigateTo,
        showModal,
        confirm,
        toast,
        
        // Getters
        get isTeacher() { return isTeacher; },
        get currentView() { return currentView; }
    };

})();
