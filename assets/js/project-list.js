/**
 * PicSim Project List
 * Visualizza e gestisce lista progetti utente
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.ProjectList = (function() {
    'use strict';

    const API = PicSim.API.Projects;
    
    // State
    let container = null;
    let callbacks = {};
    let projects = [];
    let filters = {
        type: '',
        search: '',
        orderby: 'updated_at',
        order: 'DESC'
    };

    // ==========================================================================
    // RENDER
    // ==========================================================================

    /**
     * Render lista progetti
     */
    async function render(el, options = {}) {
        container = el;
        callbacks = options;

        container.innerHTML = `
            <div class="picsim-projects">
                <!-- Toolbar -->
                <div class="picsim-toolbar">
                    <div class="picsim-toolbar-left">
                        <div class="picsim-search">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input type="text" placeholder="Cerca progetti..." id="picsim-search">
                        </div>
                        
                        <select id="picsim-filter-type" class="picsim-select">
                            <option value="">Tutti i tipi</option>
                            <option value="personal">Personali</option>
                            <option value="submission">Consegne</option>
                            <option value="template">Template</option>
                        </select>
                    </div>
                    
                    <div class="picsim-toolbar-right">
                        <select id="picsim-sort" class="picsim-select">
                            <option value="updated_at:DESC">Più recenti</option>
                            <option value="updated_at:ASC">Meno recenti</option>
                            <option value="name:ASC">Nome A-Z</option>
                            <option value="name:DESC">Nome Z-A</option>
                        </select>
                        
                        <div class="picsim-view-toggle">
                            <button class="picsim-view-btn active" data-view="grid" title="Griglia">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                                </svg>
                            </button>
                            <button class="picsim-view-btn" data-view="list" title="Lista">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Projects Grid -->
                <div class="picsim-projects-grid" id="picsim-projects-grid">
                    <div class="picsim-loading">
                        <div class="picsim-spinner"></div>
                    </div>
                </div>

                <!-- Empty State -->
                <div class="picsim-empty" id="picsim-empty" style="display:none">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                    <h3>Nessun progetto</h3>
                    <p>Crea il tuo primo progetto per iniziare</p>
                    <button class="picsim-btn picsim-btn-primary" id="picsim-empty-new">
                        Nuovo Progetto
                    </button>
                </div>
            </div>
        `;

        bindEvents();
        await loadProjects();
    }

    /**
     * Bind eventi
     */
    function bindEvents() {
        // Ricerca con debounce
        let searchTimeout;
        container.querySelector('#picsim-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                filters.search = e.target.value;
                renderProjects();
            }, 300);
        });

        // Filtro tipo
        container.querySelector('#picsim-filter-type').addEventListener('change', (e) => {
            filters.type = e.target.value;
            loadProjects();
        });

        // Ordinamento
        container.querySelector('#picsim-sort').addEventListener('change', (e) => {
            const [orderby, order] = e.target.value.split(':');
            filters.orderby = orderby;
            filters.order = order;
            loadProjects();
        });

        // Toggle vista
        container.querySelectorAll('.picsim-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.picsim-view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const grid = container.querySelector('#picsim-projects-grid');
                grid.classList.toggle('list-view', btn.dataset.view === 'list');
            });
        });

        // Empty state new
        container.querySelector('#picsim-empty-new')?.addEventListener('click', () => {
            if (callbacks.onNew) callbacks.onNew();
        });
    }

    // ==========================================================================
    // DATA
    // ==========================================================================

    /**
     * Carica progetti da API
     */
    async function loadProjects() {
        const grid = container.querySelector('#picsim-projects-grid');
        grid.innerHTML = '<div class="picsim-loading"><div class="picsim-spinner"></div></div>';

        try {
            const params = {
                orderby: filters.orderby,
                order: filters.order
            };
            if (filters.type) params.type = filters.type;

            const response = await API.list(params);
            projects = response.projects || response;
            
            renderProjects();
        } catch (err) {
            grid.innerHTML = `
                <div class="picsim-error">
                    <p>Errore nel caricamento: ${err.message}</p>
                    <button class="picsim-btn" onclick="PicSim.ProjectList.reload()">Riprova</button>
                </div>
            `;
        }
    }

    /**
     * Render lista progetti
     */
    function renderProjects() {
        const grid = container.querySelector('#picsim-projects-grid');
        const empty = container.querySelector('#picsim-empty');

        // Filtra per ricerca
        let filtered = projects;
        if (filters.search) {
            const search = filters.search.toLowerCase();
            filtered = projects.filter(p => 
                p.name.toLowerCase().includes(search) ||
                (p.description && p.description.toLowerCase().includes(search))
            );
        }

        if (filtered.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        grid.style.display = 'grid';
        empty.style.display = 'none';

        grid.innerHTML = filtered.map(project => renderProjectCard(project)).join('');

        // Bind card events
        grid.querySelectorAll('.picsim-project-card').forEach(card => {
            const projectId = parseInt(card.dataset.id);
            const project = projects.find(p => p.id === projectId);

            // Click per aprire
            card.addEventListener('click', (e) => {
                if (e.target.closest('.picsim-card-actions')) return;
                if (callbacks.onOpen) callbacks.onOpen(project);
            });

            // Menu azioni
            bindCardActions(card, project);
        });
    }

    /**
     * Render singola card progetto
     */
    function renderProjectCard(project) {
        const typeIcons = {
            personal: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
            submission: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
            template: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
            assignment: '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'
        };

        const statusBadges = {
            draft: { label: 'Bozza', class: 'draft' },
            active: { label: 'Attivo', class: 'active' },
            submitted: { label: 'Consegnato', class: 'submitted' },
            graded: { label: 'Valutato', class: 'graded' }
        };

        const status = statusBadges[project.status] || statusBadges.active;
        const date = new Date(project.updated_at);
        const dateStr = date.toLocaleDateString('it-IT', { 
            day: 'numeric', month: 'short', year: 'numeric' 
        });

        return `
            <div class="picsim-project-card ${project.locked ? 'locked' : ''}" data-id="${project.id}">
                <div class="picsim-card-header">
                    <div class="picsim-card-icon ${project.type}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${typeIcons[project.type] || typeIcons.personal}
                        </svg>
                    </div>
                    <div class="picsim-card-actions">
                        <button class="picsim-card-menu-btn" title="Azioni">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                            </svg>
                        </button>
                        <div class="picsim-card-menu">
                            <button data-action="open">Apri</button>
                            <button data-action="duplicate">Duplica</button>
                            ${!project.locked ? '<button data-action="rename">Rinomina</button>' : ''}
                            <hr>
                            ${project.locked 
                                ? '<button data-action="unlock">Sblocca</button>'
                                : '<button data-action="lock">Blocca</button>'
                            }
                            <button data-action="delete" class="danger">Elimina</button>
                        </div>
                    </div>
                </div>
                
                <div class="picsim-card-body">
                    <h4 class="picsim-card-title">
                        ${project.locked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' : ''}
                        ${escapeHtml(project.name)}
                    </h4>
                    ${project.description ? `<p class="picsim-card-desc">${escapeHtml(project.description)}</p>` : ''}
                </div>

                <div class="picsim-card-footer">
                    <div class="picsim-card-meta">
                        <span class="picsim-card-device">${project.device}</span>
                        <span class="picsim-card-date">${dateStr}</span>
                    </div>
                    <span class="picsim-badge ${status.class}">${status.label}</span>
                </div>

                ${project.grade !== undefined && project.grade !== null ? `
                    <div class="picsim-card-grade">
                        <span class="grade-value">${project.grade}</span>
                        <span class="grade-max">/ ${project.grade_max || 10}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Bind azioni card
     */
    function bindCardActions(card, project) {
        const menuBtn = card.querySelector('.picsim-card-menu-btn');
        const menu = card.querySelector('.picsim-card-menu');

        // Toggle menu
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Chiudi altri menu
            document.querySelectorAll('.picsim-card-menu.open').forEach(m => {
                if (m !== menu) m.classList.remove('open');
            });
            menu.classList.toggle('open');
        });

        // Chiudi menu su click esterno
        document.addEventListener('click', () => menu.classList.remove('open'));

        // Azioni
        menu.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                menu.classList.remove('open');

                const action = btn.dataset.action;
                await handleAction(action, project);
            });
        });
    }

    /**
     * Gestisce azione su progetto
     */
    async function handleAction(action, project) {
        switch (action) {
            case 'open':
                if (callbacks.onOpen) callbacks.onOpen(project);
                break;

            case 'duplicate':
                const newName = prompt('Nome del nuovo progetto:', project.name + ' (copia)');
                if (newName) {
                    try {
                        await API.duplicate(project.id, newName);
                        PicSim.Dashboard.toast('Progetto duplicato', 'success');
                        loadProjects();
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                }
                break;

            case 'rename':
                const name = prompt('Nuovo nome:', project.name);
                if (name && name !== project.name) {
                    try {
                        await API.update(project.id, { name });
                        PicSim.Dashboard.toast('Progetto rinominato', 'success');
                        loadProjects();
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                }
                break;

            case 'lock':
                try {
                    await API.lock(project.id);
                    PicSim.Dashboard.toast('Progetto bloccato', 'success');
                    loadProjects();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
                break;

            case 'unlock':
                try {
                    await API.unlock(project.id);
                    PicSim.Dashboard.toast('Progetto sbloccato', 'success');
                    loadProjects();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
                break;

            case 'delete':
                const confirmed = await PicSim.Dashboard.confirm(
                    `Eliminare il progetto "${project.name}"? Questa azione non può essere annullata.`,
                    { title: 'Elimina progetto', confirmText: 'Elimina', cancelText: 'Annulla' }
                );
                if (confirmed) {
                    try {
                        await API.delete(project.id);
                        PicSim.Dashboard.toast('Progetto eliminato', 'success');
                        loadProjects();
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                }
                break;
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

    function reload() {
        loadProjects();
    }

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        render,
        reload
    };

})();
