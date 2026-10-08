<?php
/**
 * REST API - Projects Controller
 * 
 * Gestisce endpoint CRUD per progetti.
 * Base: /wp-json/picsim/v1/projects
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

class API_Projects {

    /**
     * Namespace API
     */
    const NAMESPACE = 'picsim/v1';

    /**
     * Base route
     */
    const BASE = 'projects';

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
        // GET /projects - Lista progetti utente
        // POST /projects - Crea nuovo progetto
        register_rest_route(self::NAMESPACE, '/' . self::BASE, [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_projects'],
                'permission_callback' => [$this, 'check_logged_in'],
                'args'                => $this->get_collection_params()
            ],
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'create_project'],
                'permission_callback' => [$this, 'check_logged_in'],
                'args'                => $this->get_create_params()
            ]
        ]);

        // GET /projects/{id} - Singolo progetto
        // PUT /projects/{id} - Aggiorna progetto
        // DELETE /projects/{id} - Elimina progetto
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_project'],
                'permission_callback' => [$this, 'check_project_access'],
                'args'                => [
                    'id' => [
                        'validate_callback' => function($param) {
                            return is_numeric($param);
                        }
                    ]
                ]
            ],
            [
                'methods'             => \WP_REST_Server::EDITABLE,
                'callback'            => [$this, 'update_project'],
                'permission_callback' => [$this, 'check_project_edit'],
                'args'                => $this->get_update_params()
            ],
            [
                'methods'             => \WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'delete_project'],
                'permission_callback' => [$this, 'check_project_edit'],
            ]
        ]);

        // POST /projects/{id}/duplicate - Duplica progetto
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/duplicate', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'duplicate_project'],
            'permission_callback' => [$this, 'check_project_access'],
            'args'                => [
                'name' => [
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
        ]);

        // POST /projects/{id}/lock - Blocca progetto
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/lock', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'lock_project'],
            'permission_callback' => [$this, 'check_project_edit'],
        ]);

        // POST /projects/{id}/unlock - Sblocca progetto
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/unlock', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'unlock_project'],
            'permission_callback' => [$this, 'check_project_unlock'],
        ]);

        // POST /projects/{id}/submit - Consegna progetto (studente)
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/submit', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'submit_project'],
            'permission_callback' => [$this, 'check_project_edit'],
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
     * Verifica accesso al progetto (lettura)
     */
    public function check_project_access(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $project_id = (int) $request->get_param('id');
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

        $project_id = (int) $request->get_param('id');
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
     * Verifica permesso sblocco (owner o docente)
     */
    public function check_project_unlock(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $project_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();
        $project = $this->db->get_project($project_id);

        if (!$project) {
            return new \WP_Error(
                'rest_not_found',
                __('Progetto non trovato.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        // Owner puÃ² sbloccare
        if ($project->user_id == $user_id) {
            return true;
        }

        // Docente puÃ² sbloccare progetti della sua classe
        if ($project->class_id) {
            $class = $this->db->get_class($project->class_id);
            if ($class && $class->teacher_id == $user_id) {
                return true;
            }
        }

        return new \WP_Error(
            'rest_forbidden',
            __('Non puoi sbloccare questo progetto.', 'webpicsimulator'),
            ['status' => 403]
        );
    }

    // =========================================================================
    // ENDPOINT CALLBACKS
    // =========================================================================

    /**
     * GET /projects - Lista progetti
     */
    public function get_projects(\WP_REST_Request $request) {
        $user_id = get_current_user_id();

        $args = [
            'type'    => $request->get_param('type'),
            'status'  => $request->get_param('status'),
            'orderby' => $request->get_param('orderby') ?: 'updated_at',
            'order'   => $request->get_param('order') ?: 'DESC',
            'limit'   => $request->get_param('per_page') ?: 20,
            'offset'  => (($request->get_param('page') ?: 1) - 1) * ($request->get_param('per_page') ?: 20)
        ];

        $projects = $this->db->get_user_projects($user_id, $args);
        $total = $this->db->count_user_projects($user_id, $args['type']);

        $data = array_map([$this, 'prepare_project_response'], $projects);

        $response = rest_ensure_response($data);
        $response->header('X-WP-Total', $total);
        $response->header('X-WP-TotalPages', ceil($total / $args['limit']));

        return $response;
    }

    /**
     * GET /projects/{id} - Singolo progetto
     */
    public function get_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');
        $with_files = $request->get_param('with_files') !== 'false';

        $project = $this->db->get_project($project_id, $with_files);

        if (!$project) {
            return new \WP_Error(
                'rest_not_found',
                __('Progetto non trovato.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        return rest_ensure_response($this->prepare_project_response($project, true));
    }

    /**
     * POST /projects - Crea progetto
     */
    public function create_project(\WP_REST_Request $request) {
        $user_id = get_current_user_id();

        $data = [
            'user_id'     => $user_id,
            'name'        => $request->get_param('name'),
            'description' => $request->get_param('description') ?: '',
            'device'      => $request->get_param('device') ?: 'PIC16F84A',
            'clock'       => $request->get_param('clock') ?: 4000000,
            'type'        => $request->get_param('type') ?: 'personal',
            'status'      => 'draft'
        ];

        // Validazione device
        $allowed_devices = ['PIC16F84A', 'PIC16F628A', 'PIC16F877A'];
        if (!in_array($data['device'], $allowed_devices)) {
            return new \WP_Error(
                'rest_invalid_device',
                __('Dispositivo non valido.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Classe (opzionale, per assegnazioni)
        if ($request->get_param('class_id')) {
            $data['class_id'] = (int) $request->get_param('class_id');
        }

        // Assignment (opzionale, per submissions)
        if ($request->get_param('assignment_id')) {
            $data['assignment_id'] = (int) $request->get_param('assignment_id');
        }

        $project_id = $this->db->create_project($data);

        if (!$project_id) {
            return new \WP_Error(
                'rest_create_failed',
                __('Impossibile creare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Crea file main.asm di default
        $main_content = $this->get_default_main_content($data['device']);
        $this->db->create_file([
            'project_id' => $project_id,
            'filename'   => 'main.asm',
            'type'       => 'asm',
            'content'    => $main_content,
            'is_main'    => 1
        ]);

        // Attiva progetto
        $this->db->update_project($project_id, ['status' => 'active']);

        $project = $this->db->get_project($project_id, true);

        return rest_ensure_response($this->prepare_project_response($project, true));
    }

    /**
     * PUT /projects/{id} - Aggiorna progetto
     */
    public function update_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');

        $data = [];

        // Campi aggiornabili
        if ($request->has_param('name')) {
            $data['name'] = $request->get_param('name');
        }
        if ($request->has_param('description')) {
            $data['description'] = $request->get_param('description');
        }
        if ($request->has_param('clock')) {
            $data['clock'] = (int) $request->get_param('clock');
        }

        if (empty($data)) {
            return new \WP_Error(
                'rest_no_data',
                __('Nessun dato da aggiornare.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->update_project($project_id, $data);

        if (!$result) {
            return new \WP_Error(
                'rest_update_failed',
                __('Impossibile aggiornare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $project = $this->db->get_project($project_id, true);

        return rest_ensure_response($this->prepare_project_response($project, true));
    }

    /**
     * DELETE /projects/{id} - Elimina progetto
     */
    public function delete_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');

        $project = $this->db->get_project($project_id);

        // Non permettere eliminazione submissions consegnate
        if ($project->type === 'submission' && $project->status === 'submitted') {
            return new \WP_Error(
                'rest_cannot_delete',
                __('Non puoi eliminare una consegna giÃ  effettuata.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        $result = $this->db->delete_project($project_id);

        if (!$result) {
            return new \WP_Error(
                'rest_delete_failed',
                __('Impossibile eliminare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'deleted' => true,
            'id'      => $project_id
        ]);
    }

    /**
     * POST /projects/{id}/duplicate - Duplica progetto
     */
    public function duplicate_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');
        $new_name = $request->get_param('name');
        $user_id = get_current_user_id();

        $new_id = $this->db->duplicate_project($project_id, $user_id, $new_name);

        if (!$new_id) {
            return new \WP_Error(
                'rest_duplicate_failed',
                __('Impossibile duplicare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $project = $this->db->get_project($new_id, true);

        return rest_ensure_response($this->prepare_project_response($project, true));
    }

    /**
     * POST /projects/{id}/lock - Blocca progetto
     */
    public function lock_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');

        $result = $this->db->lock_project($project_id);

        if (!$result) {
            return new \WP_Error(
                'rest_lock_failed',
                __('Impossibile bloccare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $project = $this->db->get_project($project_id);

        return rest_ensure_response($this->prepare_project_response($project));
    }

    /**
     * POST /projects/{id}/unlock - Sblocca progetto
     */
    public function unlock_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');

        $result = $this->db->unlock_project($project_id);

        if (!$result) {
            return new \WP_Error(
                'rest_unlock_failed',
                __('Impossibile sbloccare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $project = $this->db->get_project($project_id);

        return rest_ensure_response($this->prepare_project_response($project));
    }

    /**
     * POST /projects/{id}/submit - Consegna progetto
     */
    public function submit_project(\WP_REST_Request $request) {
        $project_id = (int) $request->get_param('id');

        $project = $this->db->get_project($project_id);

        // Verifica che sia una submission
        if ($project->type !== 'submission') {
            return new \WP_Error(
                'rest_not_submission',
                __('Solo i progetti assegnazione possono essere consegnati.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica che non sia giÃ  consegnato
        if ($project->status === 'submitted' || $project->status === 'graded') {
            return new \WP_Error(
                'rest_already_submitted',
                __('Progetto giÃ  consegnato.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Aggiorna stato e blocca
        $result = $this->db->update_project($project_id, [
            'status'       => 'submitted',
            'submitted_at' => current_time('mysql'),
            'locked'       => 1,
            'locked_at'    => current_time('mysql'),
            'locked_by'    => get_current_user_id()
        ]);

        if (!$result) {
            return new \WP_Error(
                'rest_submit_failed',
                __('Impossibile consegnare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $project = $this->db->get_project($project_id);

        return rest_ensure_response($this->prepare_project_response($project));
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Prepara risposta progetto
     */
    private function prepare_project_response($project, $include_files = false) {
        $data = [
            'id'            => (int) $project->id,
            'user_id'       => (int) $project->user_id,
            'name'          => $project->name,
            'description'   => $project->description,
            'device'        => $project->device,
            'clock'         => (int) $project->clock,
            'type'          => $project->type,
            'status'        => $project->status,
            'locked'        => (bool) $project->locked,
            'created_at'    => $project->created_at,
            'updated_at'    => $project->updated_at,
            '_links'        => [
                'self'  => rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $project->id),
                'files' => rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $project->id . '/files')
            ]
        ];

        // Campi opzionali
        if ($project->class_id) {
            $data['class_id'] = (int) $project->class_id;
        }
        if ($project->assignment_id) {
            $data['assignment_id'] = (int) $project->assignment_id;
        }
        if ($project->grade !== null) {
            $data['grade'] = (float) $project->grade;
            $data['grade_max'] = (float) $project->grade_max;
        }
        if ($project->teacher_notes) {
            $data['teacher_notes'] = $project->teacher_notes;
        }
        if ($project->due_date) {
            $data['due_date'] = $project->due_date;
        }
        if ($project->submitted_at) {
            $data['submitted_at'] = $project->submitted_at;
        }

        // Include files se richiesto
        if ($include_files && isset($project->files)) {
            $data['files'] = array_map(function($file) {
                return [
                    'id'          => (int) $file->id,
                    'filename'    => $file->filename,
                    'type'        => $file->type,
                    'content'     => $file->content,
                    'is_main'     => (bool) $file->is_main,
                    'is_readonly' => (bool) $file->is_readonly,
                    'updated_at'  => $file->updated_at
                ];
            }, $project->files);
        }

        return $data;
    }

    /**
     * Template main.asm di default
     */
    private function get_default_main_content($device) {
        $device_upper = strtoupper($device);
        
        return "; {$device_upper} Project
; WebPicSimulator - Prof. D.Bertolino

    LIST P={$device_upper}

; === REGISTER DEFINITIONS ===
STATUS  EQU 0x03
PORTA   EQU 0x05
PORTB   EQU 0x06
TRISA   EQU 0x85
TRISB   EQU 0x86
RP0     EQU 5

; === VARIABLES ===
    CBLOCK 0x0C
    ; Define your variables here
    ENDC

; === RESET VECTOR ===
    ORG 0x00
    GOTO START

; === INTERRUPT VECTOR ===
    ORG 0x04
    RETFIE

; === MAIN PROGRAM ===
START:
    ; Initialize ports
    BSF STATUS, RP0     ; Bank 1
    CLRF TRISB          ; PORTB as output
    BCF STATUS, RP0     ; Bank 0
    CLRF PORTB

MAIN:
    ; Your code here
    
    GOTO MAIN

    END
";
    }

    /**
     * Parametri per lista progetti
     */
    private function get_collection_params() {
        return [
            'type' => [
                'type'              => 'string',
                'enum'              => ['personal', 'template', 'assignment', 'submission'],
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'status' => [
                'type'              => 'string',
                'enum'              => ['draft', 'active', 'submitted', 'graded'],
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'orderby' => [
                'type'              => 'string',
                'default'           => 'updated_at',
                'enum'              => ['name', 'created_at', 'updated_at'],
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'order' => [
                'type'              => 'string',
                'default'           => 'DESC',
                'enum'              => ['ASC', 'DESC'],
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'page' => [
                'type'              => 'integer',
                'default'           => 1,
                'minimum'           => 1,
                'sanitize_callback' => 'absint'
            ],
            'per_page' => [
                'type'              => 'integer',
                'default'           => 20,
                'minimum'           => 1,
                'maximum'           => 100,
                'sanitize_callback' => 'absint'
            ]
        ];
    }

    /**
     * Parametri per creazione progetto
     */
    private function get_create_params() {
        return [
            'name' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => function($value) {
                    return !empty(trim($value));
                }
            ],
            'description' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_textarea_field'
            ],
            'device' => [
                'type'              => 'string',
                'default'           => 'PIC16F84A',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'clock' => [
                'type'              => 'integer',
                'default'           => 4000000,
                'sanitize_callback' => 'absint'
            ],
            'type' => [
                'type'              => 'string',
                'default'           => 'personal',
                'enum'              => ['personal', 'template', 'assignment', 'submission'],
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'class_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ],
            'assignment_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ]
        ];
    }

    /**
     * Parametri per aggiornamento progetto
     */
    private function get_update_params() {
        return [
            'name' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'description' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_textarea_field'
            ],
            'clock' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ]
        ];
    }
}
