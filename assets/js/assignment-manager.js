/**
 * PicSim Assignment Manager
 * Gestione assegnazioni per docenti e studenti
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.AssignmentManager = (function() {
    'use strict';

    const API = PicSim.API.Assignments;
    const ClassesAPI = PicSim.API.Classes;

    let container = null;
    let callbacks = {};
    let isTeacher = false;
    let assignments = [];
    let currentAssignment = null;
    let submissions = [];

    // ==========================================================================
    // LISTA ASSEGNAZIONI
    // ==========================================================================

    async function render(el, options = {}) {
        container = el;
        callbacks = options;
        isTeacher = options.isTeacher || false;

        container.innerHTML = `
            <div class="picsim-assignments">
                <div class="picsim-toolbar">
                    <div class="picsim-toolbar-left">
                        <h3>${isTeacher ? 'Assegnazioni' : 'I miei compiti'}</h3>
                        <select id="filter-status" class="picsim-select">
                            <option value="">Tutti</option>
                            ${isTeacher ? `
                                <option value="draft">Bozze</option>
                                <option value="published">Pubblicati</option>
                                <option value="closed">Chiusi</option>
                            ` : `
                                <option value="pending">Da fare</option>
                                <option value="submitted">Consegnati</option>
                                <option value="graded">Valutati</option>
                            `}
                        </select>
                    </div>
                    ${isTeacher ? `
                    <div class="picsim-toolbar-right">
                        <button class="picsim-btn picsim-btn-primary" id="new-assignment">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Nuova Assegnazione
                        </button>
                    </div>
                    ` : ''}
                </div>

                <div class="picsim-assignments-list" id="assignments-list">
                    <div class="picsim-loading"><div class="picsim-spinner"></div></div>
                </div>

                <div class="picsim-empty" id="assignments-empty" style="display:none">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                    </svg>
                    <h3>${isTeacher ? 'Nessuna assegnazione' : 'Nessun compito'}</h3>
                    <p>${isTeacher ? 'Crea la tua prima assegnazione' : 'Non hai compiti assegnati'}</p>
                </div>
            </div>
        `;

        container.querySelector('#filter-status').addEventListener('change', loadAssignments);
        container.querySelector('#new-assignment')?.addEventListener('click', showNewAssignmentDialog);

        await loadAssignments();
    }

    async function loadAssignments() {
        const list = container.querySelector('#assignments-list');
        const status = container.querySelector('#filter-status').value;

        try {
            const params = { role: isTeacher ? 'teacher' : 'student' };
            if (status) params.status = status;
            
            const response = await API.list(params);
            assignments = response.assignments || response;
            renderAssignmentsList();
        } catch (err) {
            list.innerHTML = `<div class="picsim-error"><p>Errore: ${err.message}</p></div>`;
        }
    }

    function renderAssignmentsList() {
        const list = container.querySelector('#assignments-list');
        const empty = container.querySelector('#assignments-empty');

        if (assignments.length === 0) {
            list.style.display = 'none';
            empty.style.display = 'flex';
            return;
        }

        list.style.display = 'block';
        empty.style.display = 'none';

        list.innerHTML = assignments.map(a => {
            const dueDate = a.due_date ? new Date(a.due_date) : null;
            const isOverdue = dueDate && dueDate < new Date() && a.status !== 'closed';
            const dueDateStr = dueDate ? dueDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Nessuna scadenza';

            return `
                <div class="picsim-assignment-item ${a.status} ${isOverdue ? 'overdue' : ''}" data-id="${a.id}">
                    <div class="picsim-assignment-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <path d="M14 2v6h6M16 13H8M16 17H8"/>
                        </svg>
                    </div>
                    <div class="picsim-assignment-content">
                        <h4>${escapeHtml(a.title)}</h4>
                        <div class="picsim-assignment-meta">
                            <span class="picsim-assignment-class">${escapeHtml(a.class_name || 'Classe')}</span>
                            <span class="picsim-assignment-date ${isOverdue ? 'overdue' : ''}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                </svg>
                                ${dueDateStr}
                            </span>
                            ${isTeacher ? `
                                <span class="picsim-assignment-submissions">
                                    ${a.submitted_count || 0}/${a.student_count || 0} consegne
                                </span>
                            ` : ''}
                        </div>
                    </div>
                    <div class="picsim-assignment-status">
                        ${renderStatusBadge(a)}
                    </div>
                    <div class="picsim-assignment-actions">
                        ${isTeacher ? `
                            <button class="picsim-btn-icon" data-action="menu" title="Azioni">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                                </svg>
                            </button>
                        ` : `
                            ${a.my_status === 'not_started' ? `<button class="picsim-btn picsim-btn-primary" data-action="start">Inizia</button>` : ''}
                            ${a.my_status === 'in_progress' ? `<button class="picsim-btn" data-action="continue">Continua</button>` : ''}
                            ${a.my_status === 'submitted' || a.my_status === 'graded' ? `<button class="picsim-btn" data-action="view">Visualizza</button>` : ''}
                        `}
                    </div>
                </div>
            `;
        }).join('');

        // Bind events
        list.querySelectorAll('.picsim-assignment-item').forEach(item => {
            const assignment = assignments.find(a => a.id === parseInt(item.dataset.id));
            
            item.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                if (callbacks.onOpenAssignment) callbacks.onOpenAssignment(assignment);
            });

            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleAssignmentAction(btn.dataset.action, assignment);
                });
            });
        });
    }

    function renderStatusBadge(assignment) {
        if (isTeacher) {
            const badges = {
                draft: '<span class="picsim-badge draft">Bozza</span>',
                published: '<span class="picsim-badge published">Pubblicato</span>',
                closed: '<span class="picsim-badge closed">Chiuso</span>'
            };
            return badges[assignment.status] || '';
        } else {
            const badges = {
                not_started: '<span class="picsim-badge pending">Da iniziare</span>',
                in_progress: '<span class="picsim-badge in-progress">In corso</span>',
                submitted: '<span class="picsim-badge submitted">Consegnato</span>',
                graded: `<span class="picsim-badge graded">Voto: ${assignment.grade || '-'}</span>`
            };
            return badges[assignment.my_status] || '';
        }
    }

    async function handleAssignmentAction(action, assignment) {
        try {
            switch (action) {
                case 'start':
                    const project = await API.start(assignment.id);
                    PicSim.Dashboard.toast('Assegnazione iniziata!', 'success');
                    PicSim.Dashboard.navigateTo('project/' + project.id);
                    break;
                case 'continue':
                case 'view':
                    if (assignment.my_project_id) {
                        PicSim.Dashboard.navigateTo('project/' + assignment.my_project_id);
                    }
                    break;
                case 'menu':
                    showAssignmentMenu(event, assignment);
                    break;
            }
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    // ==========================================================================
    // DETTAGLIO ASSEGNAZIONE (DOCENTE)
    // ==========================================================================

    async function renderDetail(el, assignmentId, options = {}) {
        container = el;
        callbacks = options;
        isTeacher = options.isTeacher || false;

        container.innerHTML = '<div class="picsim-loading"><div class="picsim-spinner"></div></div>';

        try {
            currentAssignment = await API.get(assignmentId);
            if (isTeacher) {
                submissions = await API.getSubmissions(assignmentId);
            }
            renderAssignmentDetail();
        } catch (err) {
            container.innerHTML = `<div class="picsim-error-view"><h3>Errore</h3><p>${err.message}</p></div>`;
        }
    }

    function renderAssignmentDetail() {
        const dueDate = currentAssignment.due_date 
            ? new Date(currentAssignment.due_date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Nessuna scadenza';

        container.innerHTML = `
            <div class="picsim-assignment-detail">
                <div class="picsim-detail-header">
                    <button class="picsim-btn picsim-btn-icon" id="detail-back">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div class="picsim-detail-title">
                        <h2>${escapeHtml(currentAssignment.title)}</h2>
                        <span>${escapeHtml(currentAssignment.class_name || '')}</span>
                    </div>
                    <div class="picsim-detail-actions">
                        ${currentAssignment.status === 'draft' ? `
                            <button class="picsim-btn" id="edit-assignment">Modifica</button>
                            <button class="picsim-btn picsim-btn-primary" id="publish-assignment">Pubblica</button>
                        ` : ''}
                        ${currentAssignment.status === 'published' ? `
                            <button class="picsim-btn" id="close-assignment">Chiudi</button>
                        ` : ''}
                    </div>
                </div>

                <div class="picsim-detail-grid">
                    <div class="picsim-assignment-info">
                        <div class="picsim-info-card">
                            <h4>Dettagli</h4>
                            <div class="picsim-info-row">
                                <span>Stato:</span>
                                ${renderStatusBadge(currentAssignment)}
                            </div>
                            <div class="picsim-info-row">
                                <span>Scadenza:</span>
                                <strong>${dueDate}</strong>
                            </div>
                            <div class="picsim-info-row">
                                <span>Consegne in ritardo:</span>
                                <strong>${currentAssignment.allow_late ? 'Permesse' : 'Non permesse'}</strong>
                            </div>
                        </div>

                        ${currentAssignment.instructions ? `
                        <div class="picsim-info-card">
                            <h4>Istruzioni</h4>
                            <div class="picsim-instructions">${currentAssignment.instructions}</div>
                        </div>
                        ` : ''}
                    </div>

                    ${isTeacher ? `
                    <div class="picsim-submissions-section">
                        <div class="picsim-section-header">
                            <h4>Consegne (${submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length}/${submissions.length})</h4>
                        </div>
                        <div class="picsim-submissions-list" id="submissions-list">
                            ${renderSubmissionsList()}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        container.querySelector('#detail-back').addEventListener('click', () => {
            if (callbacks.onBack) callbacks.onBack();
        });
        container.querySelector('#edit-assignment')?.addEventListener('click', () => showEditAssignmentDialog());
        container.querySelector('#publish-assignment')?.addEventListener('click', publishAssignment);
        container.querySelector('#close-assignment')?.addEventListener('click', closeAssignment);
        
        if (isTeacher) bindSubmissionActions();
    }

    function renderSubmissionsList() {
        if (submissions.length === 0) {
            return '<div class="picsim-empty-small">Nessuno studente in classe</div>';
        }

        return submissions.map(s => {
            const submitted = s.status === 'submitted' || s.status === 'graded';
            const submittedDate = s.submitted_at 
                ? new Date(s.submitted_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '-';

            return `
                <div class="picsim-submission-item ${s.status}" data-id="${s.id}" data-student="${s.user_id}">
                    <div class="picsim-student-avatar">${getInitials(s.student_name)}</div>
                    <div class="picsim-submission-info">
                        <span class="picsim-student-name">${escapeHtml(s.student_name)}</span>
                        <span class="picsim-submission-date">${submitted ? `Consegnato: ${submittedDate}` : 'Non consegnato'}</span>
                    </div>
                    <div class="picsim-submission-grade">
                        ${s.status === 'graded' 
                            ? `<span class="grade">${s.grade}/${s.grade_max || 10}</span>`
                            : submitted 
                                ? '<span class="pending">Da valutare</span>'
                                : '<span class="not-submitted">-</span>'
                        }
                    </div>
                    <div class="picsim-submission-actions">
                        ${submitted ? `
                            <button class="picsim-btn" data-action="view">Visualizza</button>
                            <button class="picsim-btn picsim-btn-primary" data-action="grade">Valuta</button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function bindSubmissionActions() {
        container.querySelectorAll('.picsim-submission-item').forEach(item => {
            const submission = submissions.find(s => s.id === parseInt(item.dataset.id));
            
            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.dataset.action === 'view') {
                        if (callbacks.onOpenSubmission) callbacks.onOpenSubmission(submission);
                    } else if (btn.dataset.action === 'grade') {
                        showGradeDialog(submission);
                    }
                });
            });
        });
    }

    // ==========================================================================
    // DIALOGS
    // ==========================================================================

    async function showNewAssignmentDialog() {
        // Carica classi
        let classes = [];
        try {
            const response = await ClassesAPI.list({ role: 'teacher' });
            classes = response.classes || response;
        } catch (err) {
            PicSim.Dashboard.toast('Errore caricamento classi', 'error');
            return;
        }

        if (classes.length === 0) {
            PicSim.Dashboard.toast('Crea prima una classe', 'error');
            return;
        }

        const content = document.createElement('div');
        content.innerHTML = `
            <div class="picsim-form">
                <div class="picsim-form-group">
                    <label>Titolo *</label>
                    <input type="text" id="assignment-title" placeholder="es. Esercizio LED Blink" required>
                </div>
                <div class="picsim-form-group">
                    <label>Classe *</label>
                    <select id="assignment-class" required>
                        <option value="">Seleziona classe</option>
                        ${classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="picsim-form-group">
                    <label>Scadenza</label>
                    <input type="datetime-local" id="assignment-due">
                </div>
                <div class="picsim-form-group">
                    <label>Istruzioni</label>
                    <textarea id="assignment-instructions" rows="4" placeholder="Istruzioni per gli studenti..."></textarea>
                </div>
                <div class="picsim-form-group">
                    <label><input type="checkbox" id="assignment-late"> Permetti consegne in ritardo</label>
                </div>
            </div>
        `;

        PicSim.Dashboard.showModal({
            title: 'Nuova Assegnazione',
            content,
            actions: [
                { label: 'Annulla', action: 'cancel' },
                { label: 'Crea', action: 'create', primary: true }
            ],
            onCreate: async () => {
                const title = content.querySelector('#assignment-title').value.trim();
                const classId = content.querySelector('#assignment-class').value;
                
                if (!title || !classId) {
                    PicSim.Dashboard.toast('Compila tutti i campi obbligatori', 'error');
                    return;
                }

                try {
                    await API.create({
                        title,
                        class_id: parseInt(classId),
                        due_date: content.querySelector('#assignment-due').value || null,
                        instructions: content.querySelector('#assignment-instructions').value.trim(),
                        allow_late: content.querySelector('#assignment-late').checked
                    });
                    PicSim.Dashboard.toast('Assegnazione creata!', 'success');
                    loadAssignments();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
            }
        });
    }

    function showGradeDialog(submission) {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="picsim-form">
                <div class="picsim-form-group">
                    <label>Studente</label>
                    <p><strong>${escapeHtml(submission.student_name)}</strong></p>
                </div>
                <div class="picsim-form-row">
                    <div class="picsim-form-group">
                        <label>Voto *</label>
                        <input type="number" id="grade-value" min="0" max="10" step="0.5" 
                               value="${submission.grade || ''}" placeholder="0-10">
                    </div>
                    <div class="picsim-form-group">
                        <label>Max</label>
                        <input type="number" id="grade-max" value="${submission.grade_max || 10}" disabled>
                    </div>
                </div>
                <div class="picsim-form-group">
                    <label>Note</label>
                    <textarea id="grade-notes" rows="3" placeholder="Feedback per lo studente...">${escapeHtml(submission.teacher_notes || '')}</textarea>
                </div>
            </div>
        `;

        PicSim.Dashboard.showModal({
            title: 'Valuta Consegna',
            content,
            actions: [
                { label: 'Annulla', action: 'cancel' },
                { label: 'Salva', action: 'save', primary: true }
            ],
            onSave: async () => {
                const grade = parseFloat(content.querySelector('#grade-value').value);
                if (isNaN(grade) || grade < 0 || grade > 10) {
                    PicSim.Dashboard.toast('Inserisci un voto valido (0-10)', 'error');
                    return;
                }

                try {
                    await API.grade(currentAssignment.id, submission.user_id, {
                        grade,
                        teacher_notes: content.querySelector('#grade-notes').value.trim()
                    });
                    submission.grade = grade;
                    submission.status = 'graded';
                    PicSim.Dashboard.toast('Voto salvato!', 'success');
                    container.querySelector('#submissions-list').innerHTML = renderSubmissionsList();
                    bindSubmissionActions();
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
            }
        });
    }

    async function publishAssignment() {
        const confirmed = await PicSim.Dashboard.confirm('Pubblicare l\'assegnazione? Gli studenti potranno iniziare.');
        if (!confirmed) return;

        try {
            await API.publish(currentAssignment.id);
            currentAssignment.status = 'published';
            PicSim.Dashboard.toast('Assegnazione pubblicata!', 'success');
            renderAssignmentDetail();
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    async function closeAssignment() {
        const confirmed = await PicSim.Dashboard.confirm('Chiudere l\'assegnazione? Non saranno piÃ¹ accettate consegne.');
        if (!confirmed) return;

        try {
            await API.close(currentAssignment.id);
            currentAssignment.status = 'closed';
            PicSim.Dashboard.toast('Assegnazione chiusa', 'success');
            renderAssignmentDetail();
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    function showAssignmentMenu(event, assignment) {
        document.querySelectorAll('.picsim-context-menu').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'picsim-context-menu';
        menu.innerHTML = `
            ${assignment.status === 'draft' ? '<button data-action="edit">Modifica</button><button data-action="publish">Pubblica</button>' : ''}
            ${assignment.status === 'published' ? '<button data-action="close">Chiudi</button>' : ''}
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
                    case 'publish':
                        currentAssignment = assignment;
                        await publishAssignment();
                        loadAssignments();
                        break;
                    case 'close':
                        currentAssignment = assignment;
                        await closeAssignment();
                        loadAssignments();
                        break;
                    case 'delete':
                        if (await PicSim.Dashboard.confirm(`Eliminare "${assignment.title}"?`)) {
                            await API.delete(assignment.id);
                            PicSim.Dashboard.toast('Eliminato', 'success');
                            loadAssignments();
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

    function getInitials(name) {
        return (name || '?').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }

    function reload() { loadAssignments(); }

    return { render, renderDetail, reload };
})();
