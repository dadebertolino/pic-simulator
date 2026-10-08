/**
 * PicSim Class Manager
 * Gestione classi per docenti
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.ClassManager = (function() {
    'use strict';

    const API = PicSim.API.Classes;
    let container = null;
    let callbacks = {};
    let classes = [];
    let currentClass = null;
    let students = [];

    // ==========================================================================
    // LISTA CLASSI
    // ==========================================================================

    async function render(el, options = {}) {
        container = el;
        callbacks = options;

        container.innerHTML = `
            <div class="picsim-classes">
                <div class="picsim-toolbar">
                    <div class="picsim-toolbar-left"><h3>Le mie classi</h3></div>
                    <div class="picsim-toolbar-right">
                        <button class="picsim-btn picsim-btn-primary" id="new-class">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Nuova Classe
                        </button>
                    </div>
                </div>
                <div class="picsim-classes-grid" id="classes-grid">
                    <div class="picsim-loading"><div class="picsim-spinner"></div></div>
                </div>
                <div class="picsim-empty" id="classes-empty" style="display:none">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    </svg>
                    <h3>Nessuna classe</h3>
                    <p>Crea la tua prima classe per iniziare</p>
                    <button class="picsim-btn picsim-btn-primary" id="empty-new-class">Nuova Classe</button>
                </div>
            </div>
        `;

        container.querySelector('#new-class')?.addEventListener('click', showNewClassDialog);
        container.querySelector('#empty-new-class')?.addEventListener('click', showNewClassDialog);
        await loadClasses();
    }

    async function loadClasses() {
        const grid = container.querySelector('#classes-grid');
        try {
            const response = await API.list({ role: 'teacher' });
            classes = response.classes || response;
            renderClassesGrid();
        } catch (err) {
            grid.innerHTML = `<div class="picsim-error"><p>Errore: ${err.message}</p></div>`;
        }
    }

    function renderClassesGrid() {
        const grid = container.querySelector('#classes-grid');
        const empty = container.querySelector('#classes-empty');

        if (classes.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        grid.style.display = 'grid';
        empty.style.display = 'none';

        grid.innerHTML = classes.map(cls => `
            <div class="picsim-class-card ${cls.is_active ? '' : 'archived'}" data-id="${cls.id}">
                <div class="picsim-class-header">
                    <div class="picsim-class-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        </svg>
                    </div>
                    <button class="picsim-btn-icon" data-action="menu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                </div>
                <div class="picsim-class-body">
                    <h4>${escapeHtml(cls.name)}</h4>
                    ${cls.year || cls.section ? `<span class="picsim-class-info">${cls.year || ''} ${cls.section || ''}</span>` : ''}
                </div>
                <div class="picsim-class-footer">
                    <div class="picsim-class-stats">
                        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/></svg>${cls.student_count || 0}</span>
                    </div>
                    <div class="picsim-class-code">
                        <code>${cls.join_code}</code>
                        <button class="picsim-btn-icon small" data-action="copy-code" title="Copia">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.picsim-class-card').forEach(card => {
            const cls = classes.find(c => c.id === parseInt(card.dataset.id));
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                if (callbacks.onOpenClass) callbacks.onOpenClass(cls);
            });
            card.querySelector('[data-action="menu"]').addEventListener('click', (e) => {
                e.stopPropagation();
                showClassMenu(e, cls);
            });
            card.querySelector('[data-action="copy-code"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(cls.join_code);
                PicSim.Dashboard.toast('Codice copiato!', 'success');
            });
        });
    }

    // ==========================================================================
    // DETTAGLIO CLASSE
    // ==========================================================================

    async function renderDetail(el, classId, options = {}) {
        container = el;
        callbacks = options;
        container.innerHTML = '<div class="picsim-class-detail"><div class="picsim-loading"><div class="picsim-spinner"></div></div></div>';

        try {
            currentClass = await API.get(classId);
            students = await API.getStudents(classId);
            renderClassDetail();
        } catch (err) {
            container.innerHTML = `<div class="picsim-error-view"><h3>Errore</h3><p>${err.message}</p></div>`;
        }
    }

    function renderClassDetail() {
        container.innerHTML = `
            <div class="picsim-class-detail">
                <div class="picsim-detail-header">
                    <button class="picsim-btn picsim-btn-icon" id="detail-back">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="picsim-detail-title">
                        <h2>${escapeHtml(currentClass.name)}</h2>
                        <span>${currentClass.year || ''} ${currentClass.section || ''}</span>
                    </div>
                    <div class="picsim-detail-actions">
                        <button class="picsim-btn" id="edit-class">Modifica</button>
                    </div>
                </div>

                <div class="picsim-detail-grid">
                    <div class="picsim-info-card">
                        <h4>Codice iscrizione</h4>
                        <div class="picsim-join-code">
                            <code>${currentClass.join_code}</code>
                            <button class="picsim-btn" id="copy-code">Copia</button>
                            <button class="picsim-btn" id="regenerate-code">Rigenera</button>
                        </div>
                        <p class="picsim-hint">Condividi questo codice con gli studenti</p>
                    </div>

                    <div class="picsim-students-section">
                        <div class="picsim-section-header">
                            <h4>Studenti (${students.length})</h4>
                            <button class="picsim-btn" id="add-student">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                Aggiungi
                            </button>
                        </div>
                        <div class="picsim-students-list" id="students-list">
                            ${renderStudentsList()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('#detail-back').addEventListener('click', () => {
            if (callbacks.onBack) callbacks.onBack();
        });
        container.querySelector('#edit-class').addEventListener('click', () => showEditClassDialog());
        container.querySelector('#copy-code').addEventListener('click', () => {
            copyToClipboard(currentClass.join_code);
            PicSim.Dashboard.toast('Codice copiato!', 'success');
        });
        container.querySelector('#regenerate-code').addEventListener('click', regenerateCode);
        container.querySelector('#add-student').addEventListener('click', showAddStudentDialog);
        bindStudentActions();
    }

    function renderStudentsList() {
        if (students.length === 0) {
            return '<div class="picsim-empty-small">Nessuno studente iscritto</div>';
        }
        return students.map(s => `
            <div class="picsim-student-item ${s.status}" data-id="${s.id}">
                <div class="picsim-student-avatar">${getInitials(s.display_name)}</div>
                <div class="picsim-student-info">
                    <span class="picsim-student-name">${escapeHtml(s.display_name)}</span>
                    <span class="picsim-student-email">${escapeHtml(s.email)}</span>
                </div>
                <div class="picsim-student-status">
                    <span class="picsim-badge ${s.status}">${s.status === 'active' ? 'Attivo' : 'Sospeso'}</span>
                </div>
                <div class="picsim-student-actions">
                    ${s.status === 'active' 
                        ? '<button data-action="suspend" title="Sospendi">Sospendi</button>'
                        : '<button data-action="activate" title="Riattiva">Riattiva</button>'}
                    <button data-action="remove" class="danger" title="Rimuovi">Rimuovi</button>
                </div>
            </div>
        `).join('');
    }

    function bindStudentActions() {
        container.querySelectorAll('.picsim-student-item').forEach(item => {
            const studentId = parseInt(item.dataset.id);
            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => handleStudentAction(btn.dataset.action, studentId));
            });
        });
    }

    async function handleStudentAction(action, studentId) {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        try {
            switch (action) {
                case 'suspend':
                    await API.updateStudent(currentClass.id, studentId, 'suspended');
                    student.status = 'suspended';
                    PicSim.Dashboard.toast('Studente sospeso', 'success');
                    break;
                case 'activate':
                    await API.updateStudent(currentClass.id, studentId, 'active');
                    student.status = 'active';
                    PicSim.Dashboard.toast('Studente riattivato', 'success');
                    break;
                case 'remove':
                    const confirmed = await PicSim.Dashboard.confirm(`Rimuovere ${student.display_name} dalla classe?`);
                    if (confirmed) {
                        await API.removeStudent(currentClass.id, studentId);
                        students = students.filter(s => s.id !== studentId);
                        PicSim.Dashboard.toast('Studente rimosso', 'success');
                    }
                    break;
            }
            container.querySelector('#students-list').innerHTML = renderStudentsList();
            bindStudentActions();
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    // ==========================================================================
    // DIALOGS
    // ==========================================================================

    function showNewClassDialog() {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="picsim-form">
                <div class="picsim-form-group">
                    <label>Nome classe *</label>
                    <input type="text" id="class-name" placeholder="es. Informatica 3A" required>
                </div>
                <div class="picsim-form-row">
                    <div class="picsim-form-group">
                        <label>Anno</label>
                        <input type="text" id="class-year" placeholder="es. 2024/25">
                    </div>
                    <div class="picsim-form-group">
                        <label>Sezione</label>
                        <input type="text" id="class-section" placeholder="es. A">
                    </div>
                </div>
                <div class="picsim-form-group">
                    <label>Descrizione</label>
                    <textarea id="class-desc" rows="2" placeholder="Descrizione opzionale..."></textarea>
                </div>
            </div>
        `;

        PicSim.Dashboard.showModal({
            title: 'Nuova Classe',
            content,
            actions: [
                { label: 'Annulla', action: 'cancel' },
                { label: 'Crea', action: 'create', primary: true }
            ],
            onCreate: async () => {
                const name = content.querySelector('#class-name').value.trim();
                if (!name) {
                    PicSim.Dashboard.toast('Inserisci un nome', 'error');
                    return;
                }
                try {
                    await API.create({
                        name,
                        year: content.querySelector('#class-year').value.trim(),
                        section: content.querySelector('#class-section').value.trim(),
                        description: content.querySelector('#class-desc').value.trim()
                    });
                    PicSim.Dashboard.toast('Classe creata!', 'success');
                    loadClasses();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
            }
        });
    }

    function showEditClassDialog() {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="picsim-form">
                <div class="picsim-form-group">
                    <label>Nome classe *</label>
                    <input type="text" id="class-name" value="${escapeHtml(currentClass.name)}" required>
                </div>
                <div class="picsim-form-row">
                    <div class="picsim-form-group">
                        <label>Anno</label>
                        <input type="text" id="class-year" value="${escapeHtml(currentClass.year || '')}">
                    </div>
                    <div class="picsim-form-group">
                        <label>Sezione</label>
                        <input type="text" id="class-section" value="${escapeHtml(currentClass.section || '')}">
                    </div>
                </div>
                <div class="picsim-form-group">
                    <label>Descrizione</label>
                    <textarea id="class-desc" rows="2">${escapeHtml(currentClass.description || '')}</textarea>
                </div>
            </div>
        `;

        PicSim.Dashboard.showModal({
            title: 'Modifica Classe',
            content,
            actions: [
                { label: 'Annulla', action: 'cancel' },
                { label: 'Salva', action: 'save', primary: true }
            ],
            onSave: async () => {
                try {
                    await API.update(currentClass.id, {
                        name: content.querySelector('#class-name').value.trim(),
                        year: content.querySelector('#class-year').value.trim(),
                        section: content.querySelector('#class-section').value.trim(),
                        description: content.querySelector('#class-desc').value.trim()
                    });
                    PicSim.Dashboard.toast('Classe aggiornata!', 'success');
                    currentClass = await API.get(currentClass.id);
                    renderClassDetail();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
            }
        });
    }

    function showAddStudentDialog() {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="picsim-form">
                <div class="picsim-tabs-simple">
                    <button class="tab-btn active" data-tab="single">Singolo</button>
                    <button class="tab-btn" data-tab="csv">Import CSV</button>
                </div>
                
                <div class="tab-content" id="tab-single">
                    <div class="picsim-form-group">
                        <label>Email studente *</label>
                        <input type="email" id="student-email" placeholder="nome.cognome@studenti.it">
                    </div>
                    <div class="picsim-form-group">
                        <label>Nome (opzionale)</label>
                        <input type="text" id="student-name" placeholder="Nome Cognome">
                    </div>
                </div>
                
                <div class="tab-content" id="tab-csv" style="display:none">
                    <div class="picsim-form-group">
                        <label>File CSV</label>
                        <input type="file" id="csv-file" accept=".csv,.txt">
                        <p class="picsim-form-hint">
                            Formato: una riga per studente<br>
                            Colonne: email, nome (opzionale)<br>
                            Es: mario.rossi@studenti.it,Mario Rossi
                        </p>
                    </div>
                    <div class="picsim-form-group">
                        <label>Anteprima</label>
                        <div id="csv-preview" class="picsim-csv-preview">
                            Seleziona un file CSV...
                        </div>
                    </div>
                </div>
            </div>
            <style>
                .picsim-tabs-simple {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                }
                .picsim-tabs-simple .tab-btn {
                    flex: 1;
                    padding: 8px 16px;
                    background: var(--picsim-bg-tertiary, #242938);
                    border: 1px solid var(--picsim-border, #2a3142);
                    border-radius: 6px;
                    color: var(--picsim-text-secondary, #8b949e);
                    cursor: pointer;
                    font-size: 13px;
                }
                .picsim-tabs-simple .tab-btn.active {
                    background: var(--picsim-primary-bg, rgba(0,212,255,0.1));
                    border-color: var(--picsim-primary, #00d4ff);
                    color: var(--picsim-primary, #00d4ff);
                }
                .picsim-csv-preview {
                    background: var(--picsim-bg, #0f1419);
                    border: 1px solid var(--picsim-border, #2a3142);
                    border-radius: 6px;
                    padding: 12px;
                    font-size: 12px;
                    max-height: 150px;
                    overflow-y: auto;
                    color: var(--picsim-text-secondary, #8b949e);
                }
                .picsim-csv-preview .csv-row {
                    padding: 4px 0;
                    border-bottom: 1px solid var(--picsim-border, #2a3142);
                }
                .picsim-csv-preview .csv-row:last-child { border-bottom: none; }
                .picsim-csv-preview .csv-email { color: var(--picsim-primary, #00d4ff); }
            </style>
        `;

        // Tab switching
        content.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                content.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                content.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                content.querySelector('#tab-' + btn.dataset.tab).style.display = 'block';
            });
        });

        // CSV file handling
        let csvStudents = [];
        content.querySelector('#csv-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target.result;
                csvStudents = parseCSV(text);
                
                const preview = content.querySelector('#csv-preview');
                if (csvStudents.length === 0) {
                    preview.innerHTML = '<em>Nessun dato valido trovato</em>';
                } else {
                    preview.innerHTML = csvStudents.map(s => `
                        <div class="csv-row">
                            <span class="csv-email">${escapeHtml(s.email)}</span>
                            ${s.name ? ' - ' + escapeHtml(s.name) : ''}
                        </div>
                    `).join('');
                }
            };
            reader.readAsText(file);
        });

        PicSim.Dashboard.showModal({
            title: 'Aggiungi Studenti',
            content,
            actions: [
                { label: 'Annulla', action: 'cancel' },
                { label: 'Aggiungi', action: 'add', primary: true }
            ],
            onAdd: async () => {
                const activeTab = content.querySelector('.tab-btn.active').dataset.tab;
                
                if (activeTab === 'single') {
                    const email = content.querySelector('#student-email').value.trim();
                    const name = content.querySelector('#student-name').value.trim();
                    
                    if (!email) {
                        PicSim.Dashboard.toast('Inserisci email', 'error');
                        return;
                    }
                    
                    try {
                        await API.addStudent(currentClass.id, email, name);
                        PicSim.Dashboard.toast('Studente aggiunto!', 'success');
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                } else {
                    // Import CSV
                    if (csvStudents.length === 0) {
                        PicSim.Dashboard.toast('Nessun studente da importare', 'error');
                        return;
                    }
                    
                    let added = 0, errors = 0;
                    for (const s of csvStudents) {
                        try {
                            await API.addStudent(currentClass.id, s.email, s.name);
                            added++;
                        } catch (err) {
                            errors++;
                            console.error('Error adding', s.email, err);
                        }
                    }
                    
                    PicSim.Dashboard.toast(`Importati ${added} studenti` + (errors > 0 ? `, ${errors} errori` : ''), 
                        errors > 0 ? 'warning' : 'success');
                }
                
                // Refresh list
                students = await API.getStudents(currentClass.id);
                container.querySelector('#students-list').innerHTML = renderStudentsList();
                bindStudentActions();
            }
        });
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        const result = [];
        
        for (const line of lines) {
            // Skip header if present
            if (line.toLowerCase().includes('email') && result.length === 0) continue;
            
            // Parse CSV line (handles quoted fields)
            const parts = line.split(/[,;]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
            
            if (parts[0] && parts[0].includes('@')) {
                result.push({
                    email: parts[0],
                    name: parts[1] || ''
                });
            }
        }
        
        return result;
    }

    async function regenerateCode() {
        const confirmed = await PicSim.Dashboard.confirm('Rigenerare il codice? Il vecchio codice non sarÃ  piÃ¹ valido.');
        if (!confirmed) return;
        
        try {
            const result = await API.regenerateCode(currentClass.id);
            currentClass.join_code = result.join_code;
            container.querySelector('.picsim-join-code code').textContent = result.join_code;
            PicSim.Dashboard.toast('Codice rigenerato!', 'success');
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    function showClassMenu(event, cls) {
        document.querySelectorAll('.picsim-context-menu').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'picsim-context-menu';
        menu.innerHTML = `
            <button data-action="edit">Modifica</button>
            <button data-action="archive">${cls.is_active ? 'Archivia' : 'Riattiva'}</button>
            <hr>
            <button data-action="delete" class="danger">Elimina</button>
        `;
        menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px`;
        document.body.appendChild(menu);

        setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);

        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                menu.remove();
                switch (btn.dataset.action) {
                    case 'edit':
                        currentClass = cls;
                        showEditClassDialog();
                        break;
                    case 'archive':
                        await API.update(cls.id, { is_active: !cls.is_active });
                        loadClasses();
                        break;
                    case 'delete':
                        if (await PicSim.Dashboard.confirm(`Eliminare la classe "${cls.name}"?`)) {
                            await API.delete(cls.id);
                            PicSim.Dashboard.toast('Classe eliminata', 'success');
                            loadClasses();
                        }
                        break;
                }
            });
        });
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

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(() => {
            const input = document.createElement('input');
            input.value = text;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        });
    }

    function getInitials(name) {
        return (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    function reload() { loadClasses(); }

    return { render, renderDetail, reload };
})();
