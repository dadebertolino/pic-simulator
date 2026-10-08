/**
 * PicSim API Client
 * Client REST per comunicare con backend WordPress
 * 
 * @package PicSim
 */

window.PicSim = window.PicSim || {};

PicSim.API = (function() {
    'use strict';

    // Configurazione (impostata da wp_localize_script)
    const config = window.picsimAPI || {
        root: '/wp-json/picsim/v1/',
        nonce: ''
    };

    // ==========================================================================
    // CORE HTTP
    // ==========================================================================

    /**
     * Esegue richiesta HTTP
     */
    async function request(endpoint, options = {}) {
        const url = config.root + endpoint.replace(/^\//, '');
        
        const defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': config.nonce
            },
            credentials: 'same-origin'
        };

        const finalOptions = { ...defaults, ...options };
        
        if (finalOptions.body && typeof finalOptions.body === 'object') {
            finalOptions.body = JSON.stringify(finalOptions.body);
        }

        try {
            const response = await fetch(url, finalOptions);
            const data = await response.json();

            if (!response.ok) {
                const error = new Error(data.message || 'Errore API');
                error.code = data.code || 'unknown_error';
                error.status = response.status;
                error.data = data;
                throw error;
            }

            return data;
        } catch (err) {
            if (err.status) throw err;
            
            const error = new Error('Errore di connessione');
            error.code = 'network_error';
            throw error;
        }
    }

    // ==========================================================================
    // PROJECTS API
    // ==========================================================================

    const Projects = {
        /**
         * Lista progetti utente
         * @param {Object} params - Filtri opzionali (type, status, orderby, order, page, per_page)
         */
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`projects${query ? '?' + query : ''}`);
        },

        /**
         * Ottiene singolo progetto
         * @param {number} id - ID progetto
         * @param {boolean} withFiles - Include files
         */
        async get(id, withFiles = false) {
            return request(`projects/${id}${withFiles ? '?include_files=1' : ''}`);
        },

        /**
         * Crea nuovo progetto
         * @param {Object} data - { name, description?, device?, clock?, type? }
         */
        async create(data) {
            return request('projects', {
                method: 'POST',
                body: data
            });
        },

        /**
         * Aggiorna progetto
         * @param {number} id - ID progetto
         * @param {Object} data - { name?, description?, clock? }
         */
        async update(id, data) {
            return request(`projects/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        /**
         * Elimina progetto
         * @param {number} id - ID progetto
         */
        async delete(id) {
            return request(`projects/${id}`, {
                method: 'DELETE'
            });
        },

        /**
         * Duplica progetto
         * @param {number} id - ID progetto
         * @param {string} newName - Nome nuovo progetto
         */
        async duplicate(id, newName) {
            return request(`projects/${id}/duplicate`, {
                method: 'POST',
                body: { name: newName }
            });
        },

        /**
         * Blocca progetto
         */
        async lock(id) {
            return request(`projects/${id}/lock`, { method: 'POST' });
        },

        /**
         * Sblocca progetto
         */
        async unlock(id) {
            return request(`projects/${id}/unlock`, { method: 'POST' });
        },

        /**
         * Consegna progetto (submission)
         */
        async submit(id) {
            return request(`projects/${id}/submit`, { method: 'POST' });
        }
    };

    // ==========================================================================
    // FILES API
    // ==========================================================================

    const Files = {
        /**
         * Lista files di un progetto
         */
        async list(projectId) {
            return request(`projects/${projectId}/files`);
        },

        /**
         * Ottiene contenuto file
         */
        async get(projectId, filename) {
            return request(`projects/${projectId}/files/${encodeURIComponent(filename)}`);
        },

        /**
         * Crea nuovo file
         * @param {number} projectId
         * @param {Object} data - { filename, content?, type?, is_main? }
         */
        async create(projectId, data) {
            return request(`projects/${projectId}/files`, {
                method: 'POST',
                body: data
            });
        },

        /**
         * Aggiorna contenuto file
         */
        async update(projectId, filename, content) {
            return request(`projects/${projectId}/files/${encodeURIComponent(filename)}`, {
                method: 'PUT',
                body: { content }
            });
        },

        /**
         * Elimina file
         */
        async delete(projectId, filename) {
            return request(`projects/${projectId}/files/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
        },

        /**
         * Rinomina file
         */
        async rename(projectId, filename, newFilename) {
            return request(`projects/${projectId}/files/${encodeURIComponent(filename)}/rename`, {
                method: 'POST',
                body: { new_filename: newFilename }
            });
        },

        /**
         * Imposta come file principale
         */
        async setMain(projectId, filename) {
            return request(`projects/${projectId}/files/${encodeURIComponent(filename)}/set-main`, {
                method: 'POST'
            });
        }
    };

    // ==========================================================================
    // CLASSES API
    // ==========================================================================

    const Classes = {
        /**
         * Lista classi (docente: proprie, studente: iscritto)
         */
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`classes${query ? '?' + query : ''}`);
        },

        /**
         * Ottiene singola classe
         */
        async get(id) {
            return request(`classes/${id}`);
        },

        /**
         * Crea nuova classe (docente)
         * @param {Object} data - { name, description?, year?, section? }
         */
        async create(data) {
            return request('classes', {
                method: 'POST',
                body: data
            });
        },

        /**
         * Aggiorna classe
         */
        async update(id, data) {
            return request(`classes/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        /**
         * Elimina/archivia classe
         */
        async delete(id) {
            return request(`classes/${id}`, { method: 'DELETE' });
        },

        /**
         * Iscriviti a classe con codice (studente)
         */
        async join(code) {
            return request('classes/join', {
                method: 'POST',
                body: { code }
            });
        },

        /**
         * Rigenera codice classe (docente)
         */
        async regenerateCode(id) {
            return request(`classes/${id}/regenerate-code`, { method: 'POST' });
        },

        // --- Studenti ---

        /**
         * Lista studenti classe
         */
        async getStudents(classId) {
            return request(`classes/${classId}/students`);
        },

        /**
         * Aggiungi studente per email
         */
        async addStudent(classId, email) {
            return request(`classes/${classId}/students`, {
                method: 'POST',
                body: { email }
            });
        },

        /**
         * Modifica stato studente
         */
        async updateStudent(classId, studentId, status) {
            return request(`classes/${classId}/students/${studentId}`, {
                method: 'PUT',
                body: { status }
            });
        },

        /**
         * Rimuovi studente
         */
        async removeStudent(classId, studentId) {
            return request(`classes/${classId}/students/${studentId}`, {
                method: 'DELETE'
            });
        }
    };

    // ==========================================================================
    // ASSIGNMENTS API
    // ==========================================================================

    const Assignments = {
        /**
         * Lista assegnazioni
         * @param {Object} params - { class_id?, status?, role? }
         */
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return request(`assignments${query ? '?' + query : ''}`);
        },

        /**
         * Ottiene singola assegnazione
         */
        async get(id) {
            return request(`assignments/${id}`);
        },

        /**
         * Crea assegnazione (docente)
         */
        async create(data) {
            return request('assignments', {
                method: 'POST',
                body: data
            });
        },

        /**
         * Aggiorna assegnazione
         */
        async update(id, data) {
            return request(`assignments/${id}`, {
                method: 'PUT',
                body: data
            });
        },

        /**
         * Elimina assegnazione
         */
        async delete(id) {
            return request(`assignments/${id}`, { method: 'DELETE' });
        },

        /**
         * Pubblica assegnazione
         */
        async publish(id) {
            return request(`assignments/${id}/publish`, { method: 'POST' });
        },

        /**
         * Chiudi assegnazione
         */
        async close(id) {
            return request(`assignments/${id}/close`, { method: 'POST' });
        },

        /**
         * Inizia assegnazione (studente)
         */
        async start(id) {
            return request(`assignments/${id}/start`, { method: 'POST' });
        },

        /**
         * Ottieni submissions (docente)
         */
        async getSubmissions(id) {
            return request(`assignments/${id}/submissions`);
        },

        /**
         * Valuta submission (docente)
         */
        async grade(assignmentId, studentId, data) {
            return request(`assignments/${assignmentId}/submissions/${studentId}/grade`, {
                method: 'PUT',
                body: data
            });
        }
    };

    // ==========================================================================
    // UTILITIES
    // ==========================================================================

    const Utils = {
        /**
         * Verifica stato API
         */
        async status() {
            return request('status');
        }
    };

    // ==========================================================================
    // PUBLIC API
    // ==========================================================================

    return {
        Projects,
        Files,
        Classes,
        Assignments,
        Utils,
        
        // Accesso diretto per estensioni
        request,
        config
    };

})();
