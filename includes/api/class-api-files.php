<?php
/**
 * REST API - Files Controller
 * 
 * Gestisce endpoint CRUD per i file dei progetti.
 * Base: /wp-json/picsim/v1/projects/{project_id}/files
 *
 * @package    PicSim
 * @subpackage PicSim/includes/api
 */

namespace PicSim\API;

use PicSim\Database\DB_Manager;

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

class API_Files {

    /**
     * Namespace REST API
     */
    const NAMESPACE = 'picsim/v1';

    /**
     * Istanza DB Manager
     */
    private $db;

    /**
     * Costruttore
     */
    public function __construct() {
        $this->db = DB_Manager::get_instance();
    }

    /**
     * Registra tutte le routes
     */
    public function register_routes() {
        // GET /projects/{id}/files - Lista files
        // POST /projects/{id}/files - Crea nuovo file
        register_rest_route(self::NAMESPACE, '/projects/(?P<project_id>\d+)/files', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_files'],
                'permission_callback' => [$this, 'check_project_access'],
                'args'                => [
                    'project_id' => [
                        'validate_callback' => function($param) {
                            return is_numeric($param);
                        }
                    ]
                ]
            ],
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'create_file'],
                'permission_callback' => [$this, 'check_project_edit'],
                'args'                => $this->get_create_params()
            ]
        ]);

        // GET /projects/{id}/files/{filename} - Singolo file
        // PUT /projects/{id}/files/{filename} - Aggiorna file
        // DELETE /projects/{id}/files/{filename} - Elimina file
        register_rest_route(self::NAMESPACE, '/projects/(?P<project_id>\d+)/files/(?P<filename>[a-zA-Z0-9_\-\.]+)', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_file'],
                'permission_callback' => [$this, 'check_project_access']
            ],
            [
                'methods'             => \WP_REST_Server::EDITABLE,
                'callback'            => [$this, 'update_file'],
                'permission_callback' => [$this, 'check_file_edit'],
                'args'                => $this->get_update_params()
            ],
            [
                'methods'             => \WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'delete_file'],
                'permission_callback' => [$this, 'check_file_delete']
            ]
        ]);

        // POST /projects/{id}/files/{filename}/rename - Rinomina file
        register_rest_route(self::NAMESPACE, '/projects/(?P<project_id>\d+)/files/(?P<filename>[a-zA-Z0-9_\-\.]+)/rename', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'rename_file'],
            'permission_callback' => [$this, 'check_file_edit'],
            'args'                => [
                'new_filename' => [
                    'type'        => 'string',
                    'required'    => true,
                    'description' => 'Nuovo nome file'
                ]
            ]
        ]);

        // POST /projects/{id}/files/{filename}/set-main - Imposta come principale
        register_rest_route(self::NAMESPACE, '/projects/(?P<project_id>\d+)/files/(?P<filename>[a-zA-Z0-9_\-\.]+)/set-main', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'set_main_file'],
            'permission_callback' => [$this, 'check_project_edit']
        ]);
    }

    // =========================================================================
    // PERMISSION CALLBACKS
    // =========================================================================

    /**
     * Verifica utente loggato
     */
    public function check_logged_in() {
        if (!is_user_logged_in()) {
            return new \WP_Error(
                'rest_not_logged_in',
                __('Devi effettuare il login.', 'webpicsimulator'),
                ['status' => 401]
            );
        }
        return true;
    }

    /**
     * Verifica accesso in lettura al progetto
     */
    public function check_project_access(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $project_id = (int) $request->get_param('project_id');
        $user_id = get_current_user_id();

        if (!$this->db->user_can_access_project($user_id, $project_id)) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non hai accesso a questo progetto.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica permesso modifica progetto
     */
    public function check_project_edit(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $project_id = (int) $request->get_param('project_id');
        $user_id = get_current_user_id();

        if (!$this->db->user_can_edit_project($user_id, $project_id)) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non puoi modificare questo progetto.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica permesso modifica file (non readonly)
     */
    public function check_file_edit(\WP_REST_Request $request) {
        $can_edit = $this->check_project_edit($request);
        if (is_wp_error($can_edit)) {
            return $can_edit;
        }

        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));

        $file = $this->db->get_file($project_id, $filename);
        
        if (!$file) {
            return new \WP_Error(
                'rest_not_found',
                __('File non trovato.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        if ($file->is_readonly) {
            return new \WP_Error(
                'rest_forbidden',
                __('Questo file è in sola lettura.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica permesso eliminazione file (non main, non readonly)
     */
    public function check_file_delete(\WP_REST_Request $request) {
        $can_edit = $this->check_file_edit($request);
        if (is_wp_error($can_edit)) {
            return $can_edit;
        }

        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));

        $file = $this->db->get_file($project_id, $filename);

        if ($file && $file->is_main) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non puoi eliminare il file principale.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    // =========================================================================
    // ENDPOINT CALLBACKS
    // =========================================================================

    /**
     * GET /projects/{id}/files
     * Lista files del progetto
     */
    public function get_files(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');

        $files = $this->db->get_project_files($project_id);

        $data = [];
        foreach ($files as $file) {
            $data[] = $this->prepare_file_response($file, $project_id);
        }

        return rest_ensure_response($data);
    }

    /**
     * GET /projects/{id}/files/{filename}
     * Singolo file con contenuto
     */
    public function get_file(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));

        $file = $this->db->get_file($project_id, $filename);

        if (!$file) {
            return new \WP_Error(
                'rest_not_found',
                __('File non trovato.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        return rest_ensure_response($this->prepare_file_response($file, $project_id, true));
    }

    /**
     * POST /projects/{id}/files
     * Crea nuovo file
     */
    public function create_file(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));
        $content = $request->get_param('content') ?: '';
        $type = $request->get_param('type') ?: $this->detect_file_type($filename);

        // Validazione filename
        if (empty($filename)) {
            return new \WP_Error(
                'rest_invalid_filename',
                __('Nome file non valido.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica estensione
        $allowed_extensions = ['asm', 'inc', 'txt', 'hex'];
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed_extensions, true)) {
            return new \WP_Error(
                'rest_invalid_extension',
                __('Estensione file non permessa. Usa: .asm, .inc, .txt, .hex', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica file esistente
        $existing = $this->db->get_file($project_id, $filename);
        if ($existing) {
            return new \WP_Error(
                'rest_file_exists',
                __('Un file con questo nome esiste già.', 'webpicsimulator'),
                ['status' => 409]
            );
        }

        // Verifica limite files
        $max_files = get_option('picsim_max_files_per_project', 10);
        $count = $this->db->count_project_files($project_id);
        if ($count >= $max_files) {
            return new \WP_Error(
                'rest_max_files',
                /* translators: %d: numero massimo di file */
                sprintf(__('Limite massimo di %d file raggiunto.', 'webpicsimulator'), $max_files),
                ['status' => 400]
            );
        }

        // Verifica dimensione contenuto
        $max_size = get_option('picsim_max_file_size', 65536);
        if (strlen($content) > $max_size) {
            return new \WP_Error(
                'rest_file_too_large',
                /* translators: %d: dimensione massima in KB */
                sprintf(__('File troppo grande. Massimo %d KB.', 'webpicsimulator'), $max_size / 1024),
                ['status' => 400]
            );
        }

        $file_id = $this->db->create_file([
            'project_id' => $project_id,
            'filename'   => $filename,
            'type'       => $type,
            'content'    => $content,
            'is_main'    => 0,
            'is_readonly'=> 0
        ]);

        if (!$file_id && !is_numeric($file_id)) {
            if (is_wp_error($file_id)) {
                return $file_id;
            }
            return new \WP_Error(
                'rest_create_failed',
                __('Errore durante la creazione del file.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $file = $this->db->get_file($project_id, $filename);

        $response = rest_ensure_response($this->prepare_file_response($file, $project_id, true));
        $response->set_status(201);
        
        return $response;
    }

    /**
     * PUT /projects/{id}/files/{filename}
     * Aggiorna contenuto file
     */
    public function update_file(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));
        $content = $request->get_param('content');

        if ($content === null) {
            return new \WP_Error(
                'rest_no_content',
                __('Contenuto mancante.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica dimensione
        $max_size = get_option('picsim_max_file_size', 65536);
        if (strlen($content) > $max_size) {
            return new \WP_Error(
                'rest_file_too_large',
                /* translators: %d: dimensione massima in KB */
                sprintf(__('File troppo grande. Massimo %d KB.', 'webpicsimulator'), $max_size / 1024),
                ['status' => 400]
            );
        }

        $result = $this->db->update_file($project_id, $filename, $content);

        if (is_wp_error($result)) {
            return $result;
        }

        if (!$result) {
            return new \WP_Error(
                'rest_update_failed',
                __('Errore durante l\'aggiornamento.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Log attività
        $this->db->log_activity(
            get_current_user_id(),
            $project_id,
            'file_update',
            ['filename' => $filename, 'size' => strlen($content)]
        );

        $file = $this->db->get_file($project_id, $filename);
        return rest_ensure_response($this->prepare_file_response($file, $project_id, true));
    }

    /**
     * DELETE /projects/{id}/files/{filename}
     * Elimina file
     */
    public function delete_file(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));

        $result = $this->db->delete_file($project_id, $filename);

        if (is_wp_error($result)) {
            return $result;
        }

        if (!$result) {
            return new \WP_Error(
                'rest_delete_failed',
                __('Errore durante l\'eliminazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Log attività
        $this->db->log_activity(
            get_current_user_id(),
            $project_id,
            'file_delete',
            ['filename' => $filename]
        );

        return rest_ensure_response([
            'deleted'  => true,
            'filename' => $filename,
            'message'  => __('File eliminato.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /projects/{id}/files/{filename}/rename
     * Rinomina file
     */
    public function rename_file(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('project_id');
        $old_filename = sanitize_file_name($request->get_param('filename'));
        $new_filename = sanitize_file_name($request->get_param('new_filename'));

        // Validazione
        if (empty($new_filename)) {
            return new \WP_Error(
                'rest_invalid_filename',
                __('Nome file non valido.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica estensione
        $allowed_extensions = ['asm', 'inc', 'txt', 'hex'];
        $ext = strtolower(pathinfo($new_filename, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed_extensions, true)) {
            return new \WP_Error(
                'rest_invalid_extension',
                __('Estensione file non permessa.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica file main
        $file = $this->db->get_file($project_id, $old_filename);
        if ($file && $file->is_main && $ext !== 'asm') {
            return new \WP_Error(
                'rest_invalid_main_extension',
                __('Il file principale deve avere estensione .asm', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->rename_file($project_id, $old_filename, $new_filename);

        if (is_wp_error($result)) {
            return $result;
        }

        if (!$result) {
            return new \WP_Error(
                'rest_rename_failed',
                __('Errore durante la rinomina.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Log attività
        $this->db->log_activity(
            get_current_user_id(),
            $project_id,
            'file_rename',
            ['old_filename' => $old_filename, 'new_filename' => $new_filename]
        );

        $file = $this->db->get_file($project_id, $new_filename);
        return rest_ensure_response($this->prepare_file_response($file, $project_id, true));
    }

    /**
     * POST /projects/{id}/files/{filename}/set-main
     * Imposta file come principale
     */
    public function set_main_file(\WP_REST_Request $request) {
        global $wpdb;
        
        $project_id = (int) $request->get_param('project_id');
        $filename = sanitize_file_name($request->get_param('filename'));

        $file = $this->db->get_file($project_id, $filename);

        if (!$file) {
            return new \WP_Error(
                'rest_not_found',
                __('File non trovato.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        // Solo file .asm possono essere main
        if ($file->type !== 'asm') {
            return new \WP_Error(
                'rest_invalid_main_type',
                __('Solo file .asm possono essere il file principale.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Rimuovi flag main da tutti i file del progetto
        $wpdb->update(
            $this->db->files,
            ['is_main' => 0],
            ['project_id' => $project_id]
        );

        // Imposta nuovo main
        $wpdb->update(
            $this->db->files,
            ['is_main' => 1],
            ['id' => $file->id]
        );

        // Log attività
        $this->db->log_activity(
            get_current_user_id(),
            $project_id,
            'file_set_main',
            ['filename' => $filename]
        );

        $file = $this->db->get_file($project_id, $filename);
        return rest_ensure_response($this->prepare_file_response($file, $project_id));
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Prepara risposta file
     */
    private function prepare_file_response($file, $project_id, $include_content = false) {
        $data = [
            'id'          => (int) $file->id,
            'filename'    => $file->filename,
            'type'        => $file->type,
            'is_main'     => (bool) $file->is_main,
            'is_readonly' => (bool) $file->is_readonly,
            'is_provided' => (bool) $file->is_provided,
            'size'        => strlen($file->content),
            'created_at'  => $file->created_at,
            'updated_at'  => $file->updated_at
        ];

        if ($include_content) {
            $data['content'] = $file->content;
        }

        // Links
        $data['_links'] = [
            'self'    => rest_url(self::NAMESPACE . '/projects/' . $project_id . '/files/' . $file->filename),
            'project' => rest_url(self::NAMESPACE . '/projects/' . $project_id)
        ];

        return $data;
    }

    /**
     * Rileva tipo file da estensione
     */
    private function detect_file_type($filename) {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        
        $types = [
            'asm' => 'asm',
            'inc' => 'inc',
            'txt' => 'txt',
            'hex' => 'hex'
        ];

        return isset($types[$ext]) ? $types[$ext] : 'txt';
    }

    /**
     * Parametri per POST create
     */
    private function get_create_params() {
        return [
            'project_id' => [
                'validate_callback' => function($param) {
                    return is_numeric($param);
                }
            ],
            'filename' => [
                'type'        => 'string',
                'required'    => true,
                'minLength'   => 1,
                'maxLength'   => 255,
                'description' => 'Nome file con estensione',
                'sanitize_callback' => 'sanitize_file_name'
            ],
            'content' => [
                'type'        => 'string',
                'default'     => '',
                'description' => 'Contenuto del file'
            ],
            'type' => [
                'type'        => 'string',
                'enum'        => ['asm', 'inc', 'txt', 'hex'],
                'description' => 'Tipo file (auto-rilevato se omesso)'
            ]
        ];
    }

    /**
     * Parametri per PUT update
     */
    private function get_update_params() {
        return [
            'project_id' => [
                'validate_callback' => function($param) {
                    return is_numeric($param);
                }
            ],
            'filename' => [
                'type' => 'string'
            ],
            'content' => [
                'type'        => 'string',
                'required'    => true,
                'description' => 'Nuovo contenuto del file'
            ]
        ];
    }
}
