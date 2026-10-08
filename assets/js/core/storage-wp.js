/**
 * PIC Simulator Storage - WordPress AJAX
 */

class PICStorageWP {
    constructor(ui) {
        this.ui = ui;
        this.ajaxUrl = (typeof picSimAjax !== 'undefined') ? picSimAjax.ajaxurl : '';
        this.nonce = (typeof picSimAjax !== 'undefined') ? picSimAjax.nonce : '';
    }

    init() {
        var btnSave = document.getElementById('btn-save');
        var btnLoad = document.getElementById('btn-load');
        if (btnSave) btnSave.onclick = () => this.showSaveDialog();
        if (btnLoad) btnLoad.onclick = () => this.showLoadDialog();
    }

    // === SAVE ===

    showSaveDialog() {
        document.getElementById('dialog-title').textContent = 'Save Project';
        document.getElementById('dialog-save').style.display = 'block';
        document.getElementById('dialog-load').style.display = 'none';
        document.getElementById('project-dialog').style.display = 'flex';
        document.getElementById('project-name').focus();
    }

    async saveProject() {
        const name = document.getElementById('project-name').value.trim();
        
        if (!name) {
            this.ui.showError('Please enter a project name');
            return;
        }

        const formData = new FormData();
        formData.append('action', 'pic_sim_save');
        formData.append('nonce', this.nonce);
        formData.append('name', name);
        formData.append('source', this.ui.getSource());
        formData.append('breakpoints', JSON.stringify(this.ui.simulator.getBreakpoints()));
        formData.append('watches', JSON.stringify(this.ui.watches || []));

        try {
            const response = await fetch(this.ajaxUrl, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            
            if (result.success) {
                this.ui.showMessage(`Project "${name}" saved`, 'success');
                picSimCloseDialog();
            } else {
                this.ui.showError(result.data?.message || 'Save failed');
            }
        } catch (error) {
            this.ui.showError('Network error');
        }
    }

    // === LOAD ===

    showLoadDialog() {
        document.getElementById('dialog-title').textContent = 'Load Project';
        document.getElementById('dialog-save').style.display = 'none';
        document.getElementById('dialog-load').style.display = 'block';
        document.getElementById('project-dialog').style.display = 'flex';
        
        this.loadProjectList();
    }

    async loadProjectList() {
        const container = document.getElementById('projects-list');
        container.innerHTML = '<div class="pic-loading">Loading...</div>';

        try {
            const response = await fetch(`${this.ajaxUrl}?action=pic_sim_list&nonce=${this.nonce}`);
            const result = await response.json();
            
            if (!result.success || result.data.projects.length === 0) {
                container.innerHTML = '<div class="pic-empty">No saved projects</div>';
                return;
            }

            container.innerHTML = result.data.projects.map(p => `
                <div class="pic-project-item">
                    <div class="pic-project-info">
                        <span class="pic-project-name">${this.escapeHtml(p.name)}</span>
                        <span class="pic-project-meta">${p.device} • ${this.formatDate(p.modified)}</span>
                    </div>
                    <div class="pic-project-actions">
                        <button class="pic-btn pic-btn-small" onclick="picSimStorage.loadProject('${this.escapeHtml(p.name)}')">Load</button>
                        <button class="pic-btn pic-btn-small pic-btn-danger" onclick="picSimStorage.deleteProject('${this.escapeHtml(p.name)}')">×</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<div class="pic-error">Failed to load projects</div>';
        }
    }

    async loadProject(name) {
        try {
            const response = await fetch(`${this.ajaxUrl}?action=pic_sim_load&nonce=${this.nonce}&name=${encodeURIComponent(name)}`);
            const result = await response.json();
            
            if (result.success) {
                const project = result.data.project;
                
                this.ui.setSource(project.source || '');
                
                this.ui.simulator.clearAllBreakpoints();
                if (project.breakpoints) {
                    for (const bp of project.breakpoints) {
                        this.ui.simulator.cpu.setBreakpoint(bp);
                    }
                }
                
                if (project.watches) {
                    this.ui.watches = project.watches;
                    this.ui.updateWatches();
                }
                
                this.ui.showMessage(`Project "${name}" loaded`, 'success');
                picSimCloseDialog();
                this.ui.assemble();
            } else {
                this.ui.showError(result.data?.message || 'Load failed');
            }
        } catch (error) {
            this.ui.showError('Network error');
        }
    }

    async deleteProject(name) {
        if (!confirm(`Delete project "${name}"?`)) return;

        try {
            const response = await fetch(`${this.ajaxUrl}?action=pic_sim_delete&nonce=${this.nonce}&name=${encodeURIComponent(name)}`);
            const result = await response.json();
            
            if (result.success) {
                this.ui.showMessage(`Project "${name}" deleted`, 'info');
                this.loadProjectList();
            } else {
                this.ui.showError(result.data?.message || 'Delete failed');
            }
        } catch (error) {
            this.ui.showError('Network error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateStr) {
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    }
}
