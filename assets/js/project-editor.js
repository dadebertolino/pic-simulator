/**
 * PicSim Project Editor
 * Editor multi-file con integrazione simulatore
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.ProjectEditor = (function() {
    'use strict';

    const API = {
        Projects: PicSim.API.Projects,
        Files: PicSim.API.Files
    };

    // State
    let container = null;
    let callbacks = {};
    let project = null;
    let files = [];
    let activeFile = null;
    let openTabs = [];
    let unsavedChanges = new Set();

    // Auto-save
    let saveTimeout = null;
    const AUTOSAVE_DELAY = 2000;

    // ==========================================================================
    // RENDER
    // ==========================================================================

    async function render(el, projectId, options = {}) {
        container = el;
        callbacks = options;

        container.innerHTML = `
            <div class="picsim-editor">
                <div class="picsim-editor-header">
                    <div class="picsim-editor-nav">
                        <button class="picsim-btn picsim-btn-icon" id="editor-back" title="Torna alla dashboard">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                            </svg>
                        </button>
                        <div class="picsim-editor-title">
                            <h2 id="project-name">Caricamento...</h2>
                            <span class="picsim-editor-device" id="project-device"></span>
                        </div>
                    </div>
                    <div class="picsim-editor-actions">
                        <button class="picsim-btn" id="editor-save" title="Salva (Ctrl+S)">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                                <path d="M17 21v-8H7v8M7 3v5h8"/>
                            </svg>
                            Salva
                        </button>
                        <button class="picsim-btn picsim-btn-primary" id="editor-simulate" title="Apri simulatore">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Simula
                        </button>
                    </div>
                </div>

                <div class="picsim-editor-main">
                    <aside class="picsim-editor-sidebar">
                        <div class="picsim-sidebar-header">
                            <span>File</span>
                            <button class="picsim-btn-icon" id="add-file" title="Nuovo file">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <path d="M14 2v6h6M12 18v-6M9 15h6"/>
                                </svg>
                            </button>
                        </div>
                        <div class="picsim-file-list" id="file-list">
                            <div class="picsim-loading small"><div class="picsim-spinner"></div></div>
                        </div>
                        <div class="picsim-sidebar-section"><span>Info Progetto</span></div>
                        <div class="picsim-project-info" id="project-info"></div>
                    </aside>

                    <div class="picsim-editor-area">
                        <div class="picsim-tabs" id="editor-tabs">
                            <div class="picsim-tabs-empty">Apri un file dalla sidebar</div>
                        </div>
                        <div class="picsim-code-area" id="code-area">
                            <div class="picsim-code-empty">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                                </svg>
                                <p>Seleziona un file per iniziare</p>
                            </div>
                            <div class="picsim-code-editor" id="code-editor-container" style="display:none">
                                <div class="picsim-line-numbers" id="line-numbers"></div>
                                <textarea id="code-editor" spellcheck="false"></textarea>
                            </div>
                        </div>
                        <div class="picsim-statusbar">
                            <div class="picsim-statusbar-left">
                                <span id="status-file">-</span>
                                <span id="status-modified" class="hidden">â€¢ Modificato</span>
                            </div>
                            <div class="picsim-statusbar-right">
                                <span id="status-cursor">Ln 1, Col 1</span>
                                <span id="status-device">-</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="picsim-locked-overlay" id="locked-overlay" style="display:none">
                    <div class="picsim-locked-message">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                        </svg>
                        <h3>Progetto bloccato</h3>
                        <p>Questo progetto Ã¨ in sola lettura</p>
                    </div>
                </div>
            </div>
        `;

        bindEvents();
        await loadProject(projectId);
    }

    function bindEvents() {
        container.querySelector('#editor-back').addEventListener('click', handleBack);
        container.querySelector('#editor-save').addEventListener('click', saveCurrentFile);
        container.querySelector('#editor-simulate').addEventListener('click', openSimulator);
        container.querySelector('#add-file').addEventListener('click', showNewFileDialog);

        const editor = container.querySelector('#code-editor');
        editor.addEventListener('input', onEditorChange);
        editor.addEventListener('keydown', onEditorKeydown);
        editor.addEventListener('scroll', syncScroll);
        editor.addEventListener('click', updateCursorPosition);
        editor.addEventListener('keyup', updateCursorPosition);

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveCurrentFile();
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges.size > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    function handleBack() {
        if (unsavedChanges.size > 0) {
            PicSim.Dashboard.confirm('Ci sono modifiche non salvate. Vuoi uscire?')
                .then(confirmed => { if (confirmed && callbacks.onBack) callbacks.onBack(); });
        } else if (callbacks.onBack) {
            callbacks.onBack();
        }
    }

    // ==========================================================================
    // DATA LOADING
    // ==========================================================================

    async function loadProject(projectId) {
        try {
            project = await API.Projects.get(projectId, true);
            files = await API.Files.list(projectId);

            renderProjectInfo();
            renderFileList();

            const mainFile = files.find(f => f.is_main);
            if (mainFile) openFile(mainFile);

            if (project.locked) {
                container.querySelector('#locked-overlay').style.display = 'flex';
                container.querySelector('#editor-save').disabled = true;
            }
        } catch (err) {
            container.innerHTML = `
                <div class="picsim-error-view">
                    <h3>Errore nel caricamento</h3>
                    <p>${err.message}</p>
                    <button class="picsim-btn" onclick="PicSim.Dashboard.navigateTo('projects')">Torna alla dashboard</button>
                </div>
            `;
        }
    }

    function renderProjectInfo() {
        container.querySelector('#project-name').textContent = project.name;
        container.querySelector('#project-device').textContent = project.device;
        container.querySelector('#status-device').textContent = project.device;

        const info = container.querySelector('#project-info');
        const clock = (project.clock / 1000000).toFixed(2);
        const date = new Date(project.updated_at).toLocaleDateString('it-IT');

        info.innerHTML = `
            <div class="picsim-info-item"><span>Clock:</span><strong>${clock} MHz</strong></div>
            <div class="picsim-info-item"><span>File:</span><strong>${files.length}</strong></div>
            <div class="picsim-info-item"><span>Modificato:</span><strong>${date}</strong></div>
            ${project.locked ? '<div class="picsim-info-item warning"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg><span>Bloccato</span></div>' : ''}
        `;
    }

    function renderFileList() {
        const list = container.querySelector('#file-list');
        
        if (files.length === 0) {
            list.innerHTML = '<div class="picsim-file-empty">Nessun file</div>';
            return;
        }

        const sorted = [...files].sort((a, b) => {
            if (a.is_main) return -1;
            if (b.is_main) return 1;
            return a.filename.localeCompare(b.filename);
        });

        list.innerHTML = sorted.map(file => `
            <div class="picsim-file-item ${activeFile?.id === file.id ? 'active' : ''} ${file.is_readonly ? 'readonly' : ''}"
                 data-file-id="${file.id}" data-filename="${file.filename}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${file.type === 'asm' 
                        ? '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>'
                        : '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>'}
                </svg>
                <span class="picsim-file-name">${escapeHtml(file.filename)}</span>
                ${file.is_main ? '<span class="picsim-file-badge main">main</span>' : ''}
                ${unsavedChanges.has(file.id) ? '<span class="picsim-file-badge modified">â€¢</span>' : ''}
                ${!file.is_main && !file.is_readonly && !project.locked ? `
                    <button class="picsim-file-menu" data-file-id="${file.id}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
        `).join('');

        list.querySelectorAll('.picsim-file-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.picsim-file-menu')) return;
                const file = files.find(f => f.id === parseInt(item.dataset.fileId));
                if (file) openFile(file);
            });

            const menuBtn = item.querySelector('.picsim-file-menu');
            if (menuBtn) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showFileContextMenu(e, parseInt(menuBtn.dataset.fileId));
                });
            }
        });
    }

    // ==========================================================================
    // FILE OPERATIONS
    // ==========================================================================

    function openFile(file) {
        if (activeFile && unsavedChanges.has(activeFile.id)) {
            const editor = container.querySelector('#code-editor');
            const fileData = files.find(f => f.id === activeFile.id);
            if (fileData) fileData.content = editor.value;
        }

        activeFile = file;

        if (!openTabs.find(t => t.id === file.id)) {
            openTabs.push(file);
        }
        renderTabs();

        const editorContainer = container.querySelector('#code-editor-container');
        const emptyState = container.querySelector('.picsim-code-empty');
        editorContainer.style.display = 'flex';
        emptyState.style.display = 'none';

        const editor = container.querySelector('#code-editor');
        editor.value = file.content || '';
        editor.disabled = project.locked || file.is_readonly;
        
        updateLineNumbers();
        updateCursorPosition();
        container.querySelector('#status-file').textContent = file.filename;
        renderFileList();
    }

    function renderTabs() {
        const tabsContainer = container.querySelector('#editor-tabs');
        
        if (openTabs.length === 0) {
            tabsContainer.innerHTML = '<div class="picsim-tabs-empty">Apri un file dalla sidebar</div>';
            return;
        }

        tabsContainer.innerHTML = openTabs.map(file => `
            <div class="picsim-tab ${activeFile?.id === file.id ? 'active' : ''}" data-file-id="${file.id}">
                <span>${escapeHtml(file.filename)}</span>
                ${unsavedChanges.has(file.id) ? '<span class="picsim-tab-modified">â€¢</span>' : ''}
                <button class="picsim-tab-close" title="Chiudi">Ã—</button>
            </div>
        `).join('');

        tabsContainer.querySelectorAll('.picsim-tab').forEach(tab => {
            const fileId = parseInt(tab.dataset.fileId);
            
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('picsim-tab-close')) return;
                const file = files.find(f => f.id === fileId);
                if (file) openFile(file);
            });

            tab.querySelector('.picsim-tab-close').addEventListener('click', (e) => {
                e.stopPropagation();
                closeTab(fileId);
            });
        });
    }

    function closeTab(fileId) {
        const idx = openTabs.findIndex(t => t.id === fileId);
        if (idx === -1) return;

        if (unsavedChanges.has(fileId)) {
            saveFile(fileId);
        }

        openTabs.splice(idx, 1);

        if (activeFile?.id === fileId) {
            if (openTabs.length > 0) {
                openFile(openTabs[Math.min(idx, openTabs.length - 1)]);
            } else {
                activeFile = null;
                container.querySelector('#code-editor-container').style.display = 'none';
                container.querySelector('.picsim-code-empty').style.display = 'flex';
                container.querySelector('#status-file').textContent = '-';
            }
        }
        renderTabs();
    }

    async function showNewFileDialog() {
        if (project.locked) {
            PicSim.Dashboard.toast('Progetto bloccato', 'error');
            return;
        }

        const filename = prompt('Nome del nuovo file (es. utils.inc):');
        if (!filename) return;

        const ext = filename.split('.').pop()?.toLowerCase();
        if (!['asm', 'inc', 'txt'].includes(ext)) {
            PicSim.Dashboard.toast('Estensione non valida. Usa .asm, .inc o .txt', 'error');
            return;
        }

        if (files.find(f => f.filename.toLowerCase() === filename.toLowerCase())) {
            PicSim.Dashboard.toast('File giÃ  esistente', 'error');
            return;
        }

        try {
            const newFile = await API.Files.create(project.id, {
                filename: filename,
                content: '',
                type: ext === 'asm' ? 'asm' : 'inc'
            });

            files.push(newFile);
            renderFileList();
            openFile(newFile);
            PicSim.Dashboard.toast('File creato', 'success');
        } catch (err) {
            PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
        }
    }

    function showFileContextMenu(event, fileId) {
        const file = files.find(f => f.id === fileId);
        if (!file) return;

        // Rimuovi menu esistenti
        document.querySelectorAll('.picsim-context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'picsim-context-menu';
        menu.innerHTML = `
            <button data-action="rename">Rinomina</button>
            <button data-action="setmain">Imposta come main</button>
            <hr>
            <button data-action="delete" class="danger">Elimina</button>
        `;

        menu.style.position = 'fixed';
        menu.style.left = event.clientX + 'px';
        menu.style.top = event.clientY + 'px';

        document.body.appendChild(menu);

        const closeMenu = () => menu.remove();
        setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);

        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                closeMenu();
                await handleFileAction(btn.dataset.action, file);
            });
        });
    }

    async function handleFileAction(action, file) {
        switch (action) {
            case 'rename':
                const newName = prompt('Nuovo nome file:', file.filename);
                if (newName && newName !== file.filename) {
                    try {
                        await API.Files.rename(project.id, file.filename, newName);
                        file.filename = newName;
                        renderFileList();
                        renderTabs();
                        PicSim.Dashboard.toast('File rinominato', 'success');
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                }
                break;

            case 'setmain':
                try {
                    await API.Files.setMain(project.id, file.filename);
                    files.forEach(f => f.is_main = (f.id === file.id));
                    renderFileList();
                    PicSim.Dashboard.toast('File impostato come main', 'success');
                } catch (err) {
                    PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                }
                break;

            case 'delete':
                const confirmed = await PicSim.Dashboard.confirm(
                    `Eliminare il file "${file.filename}"?`,
                    { title: 'Elimina file', confirmText: 'Elimina' }
                );
                if (confirmed) {
                    try {
                        await API.Files.delete(project.id, file.filename);
                        files = files.filter(f => f.id !== file.id);
                        closeTab(file.id);
                        renderFileList();
                        PicSim.Dashboard.toast('File eliminato', 'success');
                    } catch (err) {
                        PicSim.Dashboard.toast('Errore: ' + err.message, 'error');
                    }
                }
                break;
        }
    }

    // ==========================================================================
    // EDITOR
    // ==========================================================================

    function onEditorChange() {
        if (!activeFile || project.locked) return;

        unsavedChanges.add(activeFile.id);
        container.querySelector('#status-modified').classList.remove('hidden');
        renderTabs();
        renderFileList();

        // Auto-save con debounce
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveCurrentFile(), AUTOSAVE_DELAY);

        updateLineNumbers();
    }

    function onEditorKeydown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const editor = e.target;
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            onEditorChange();
        }
    }

    function updateLineNumbers() {
        const editor = container.querySelector('#code-editor');
        const lineNumbers = container.querySelector('#line-numbers');
        const lines = editor.value.split('\n');
        
        lineNumbers.innerHTML = lines.map((_, i) => 
            `<span class="line-num">${(i + 1).toString().padStart(3, ' ')}</span>`
        ).join('\n');
    }

    function syncScroll() {
        const editor = container.querySelector('#code-editor');
        const lineNumbers = container.querySelector('#line-numbers');
        lineNumbers.scrollTop = editor.scrollTop;
    }

    function updateCursorPosition() {
        const editor = container.querySelector('#code-editor');
        const pos = editor.selectionStart;
        const text = editor.value.substring(0, pos);
        const lines = text.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        
        container.querySelector('#status-cursor').textContent = `Ln ${line}, Col ${col}`;
    }

    // ==========================================================================
    // SAVE
    // ==========================================================================

    async function saveCurrentFile() {
        if (!activeFile || project.locked) return;
        await saveFile(activeFile.id);
    }

    async function saveFile(fileId) {
        if (!unsavedChanges.has(fileId)) return;

        const file = files.find(f => f.id === fileId);
        if (!file) return;

        const editor = container.querySelector('#code-editor');
        const content = activeFile?.id === fileId ? editor.value : file.content;

        try {
            await API.Files.update(project.id, file.filename, content);
            file.content = content;
            unsavedChanges.delete(fileId);
            
            if (unsavedChanges.size === 0) {
                container.querySelector('#status-modified').classList.add('hidden');
            }
            
            renderTabs();
            renderFileList();
        } catch (err) {
            PicSim.Dashboard.toast('Errore salvataggio: ' + err.message, 'error');
        }
    }

    // ==========================================================================
    // SIMULATOR
    // ==========================================================================

    function openSimulator() {
        // Salva prima di simulare
        if (unsavedChanges.size > 0) {
            saveCurrentFile().then(() => {
                launchSimulator();
            });
        } else {
            launchSimulator();
        }
    }

    function launchSimulator() {
        // Trova file main
        const mainFile = files.find(f => f.is_main);
        if (!mainFile) {
            PicSim.Dashboard.toast('Nessun file main definito', 'error');
            return;
        }

        // Opzione 1: Apri simulatore in nuova tab
        const simUrl = `${window.location.origin}/simulatore/?project=${project.id}`;
        window.open(simUrl, '_blank');

        // Opzione 2: Emetti evento per integrazione inline (futuro)
        // document.dispatchEvent(new CustomEvent('picsim:simulate', { detail: { project, files } }));
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
        render,
        saveCurrentFile,
        openSimulator
    };

})();
