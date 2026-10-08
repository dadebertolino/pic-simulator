<?php
/**
 * REST API - Classes Controller
 * 
 * Gestisce endpoint per classi: CRUD, studenti, join code.
 * Base: /wp-json/picsim/v1/classes
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

class API_Classes {

    /**
     * Namespace API
     */
    const NAMESPACE = 'picsim/v1';

    /**
     * Base route
     */
    const BASE = 'classes';

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
        // GET /classes - Lista classi (docente: proprie, studente: iscritto)
        // POST /classes - Crea nuova classe (solo docente)
        register_rest_route(self::NAMESPACE, '/' . self::BASE, [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_classes'],
                'permission_callback' => [$this, 'check_logged_in'],
                'args'                => $this->get_collection_params()
            ],
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'create_class'],
                'permission_callback' => [$this, 'check_can_manage_classes'],
                'args'                => $this->get_create_params()
            ]
        ]);

        // GET /classes/{id} - Dettaglio classe
        // PUT /classes/{id} - Aggiorna classe
        // DELETE /classes/{id} - Elimina/archivia classe
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_class'],
                'permission_callback' => [$this, 'check_class_access'],
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
                'callback'            => [$this, 'update_class'],
                'permission_callback' => [$this, 'check_class_owner'],
                'args'                => $this->get_update_params()
            ],
            [
                'methods'             => \WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'delete_class'],
                'permission_callback' => [$this, 'check_class_owner']
            ]
        ]);

        // POST /classes/join - Studente si iscrive con codice
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/join', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'join_class'],
            'permission_callback' => [$this, 'check_logged_in'],
            'args'                => [
                'code' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
        ]);

        // GET /classes/{id}/students - Lista studenti
        // POST /classes/{id}/students - Aggiungi studente (docente)
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/students', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_students'],
                'permission_callback' => [$this, 'check_class_owner']
            ],
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'add_student'],
                'permission_callback' => [$this, 'check_class_owner'],
                'args'                => [
                    'email' => [
                        'type'              => 'string',
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_email'
                    ]
                ]
            ]
        ]);

        // PUT /classes/{id}/students/{student_id} - Modifica stato studente
        // DELETE /classes/{id}/students/{student_id} - Rimuovi studente
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/students/(?P<student_id>\d+)', [
            [
                'methods'             => \WP_REST_Server::EDITABLE,
                'callback'            => [$this, 'update_student'],
                'permission_callback' => [$this, 'check_class_owner'],
                'args'                => [
                    'status' => [
                        'type' => 'string',
                        'enum' => ['active', 'suspended']
                    ]
                ]
            ],
            [
                'methods'             => \WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'remove_student'],
                'permission_callback' => [$this, 'check_class_owner_or_self']
            ]
        ]);

        // POST /classes/{id}/regenerate-code - Rigenera join code
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/regenerate-code', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'regenerate_code'],
            'permission_callback' => [$this, 'check_class_owner']
        ]);

        // POST /classes/{id}/toggle-join - Abilita/disabilita iscrizioni
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/toggle-join', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'toggle_join'],
            'permission_callback' => [$this, 'check_class_owner']
        ]);

        // POST /classes/{id}/archive - Archivia classe
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/archive', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'archive_class'],
            'permission_callback' => [$this, 'check_class_owner']
        ]);

        // GET /classes/{id}/stats - Statistiche classe
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/stats', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [$this, 'get_class_stats'],
            'permission_callback' => [$this, 'check_class_owner']
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
     * Verifica permesso gestione classi
     */
    public function check_can_manage_classes() {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        if (!current_user_can('picsim_manage_classes')) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non hai i permessi per gestire le classi.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica accesso alla classe (docente o studente iscritto)
     */
    public function check_class_access(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $class_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $class = $this->db->get_class($class_id);
        
        if (!$class) {
            return new \WP_Error(
                'rest_not_found',
                __('Classe non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        // Docente proprietario
        if ($class->teacher_id == $user_id) {
            return true;
        }

        // Studente iscritto
        if ($this->db->is_student_in_class($class_id, $user_id)) {
            return true;
        }

        // Admin
        if (current_user_can('picsim_manage_all')) {
            return true;
        }

        return new \WP_Error(
            'rest_forbidden',
            __('Non hai accesso a questa classe.', 'webpicsimulator'),
            ['status' => 403]
        );
    }

    /**
     * Verifica proprietario classe (solo docente)
     */
    public function check_class_owner(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $class_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $class = $this->db->get_class($class_id);
        
        if (!$class) {
            return new \WP_Error(
                'rest_not_found',
                __('Classe non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        if ($class->teacher_id != $user_id && !current_user_can('picsim_manage_all')) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non sei il docente di questa classe.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica proprietario o studente stesso (per uscita dalla classe)
     */
    public function check_class_owner_or_self(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $class_id = (int) $request->get_param('id');
        $student_id = (int) $request->get_param('student_id');
        $user_id = get_current_user_id();

        $class = $this->db->get_class($class_id);
        
        if (!$class) {
            return new \WP_Error(
                'rest_not_found',
                __('Classe non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        // Docente proprietario
        if ($class->teacher_id == $user_id) {
            return true;
        }

        // Studente che vuole uscire da solo
        if ($student_id == $user_id) {
            return true;
        }

        // Admin
        if (current_user_can('picsim_manage_all')) {
            return true;
        }

        return new \WP_Error(
            'rest_forbidden',
            __('Non puoi rimuovere questo studente.', 'webpicsimulator'),
            ['status' => 403]
        );
    }

    // =========================================================================
    // ENDPOINT CALLBACKS
    // =========================================================================

    /**
     * GET /classes - Lista classi
     */
    public function get_classes(\WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $role = $request->get_param('role');

        $data = [];

        // Se puÃ² gestire classi, mostra le sue classi come docente
        if (current_user_can('picsim_manage_classes') && $role !== 'student') {
            $teacher_classes = $this->db->get_teacher_classes($user_id, [
                'is_active' => $request->get_param('active_only') !== false
            ]);
            
            foreach ($teacher_classes as $class) {
                $data[] = $this->prepare_class_response($class, true);
            }
        }

        // Classi come studente (se non filtrato solo docente)
        if ($role !== 'teacher') {
            $student_classes = $this->db->get_student_classes($user_id);
            
            foreach ($student_classes as $class) {
                // Evita duplicati se Ã¨ sia docente che studente
                $exists = array_filter($data, function($c) use ($class) {
                    return $c['id'] === (int) $class->id;
                });
                
                if (empty($exists)) {
                    $data[] = $this->prepare_class_response($class, false);
                }
            }
        }

        return rest_ensure_response($data);
    }

    /**
     * POST /classes - Crea nuova classe
     */
    public function create_class(\WP_REST_Request $request) {
        $user_id = get_current_user_id();

        $class_data = [
            'teacher_id'  => $user_id,
            'name'        => $request->get_param('name'),
            'description' => $request->get_param('description'),
            'year'        => $request->get_param('year'),
            'section'     => $request->get_param('section'),
            'join_code'   => $this->generate_join_code()
        ];

        $class_id = $this->db->create_class($class_data);

        if (!$class_id) {
            return new \WP_Error(
                'rest_create_failed',
                __('Impossibile creare la classe.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $class = $this->db->get_class($class_id);

        return rest_ensure_response($this->prepare_class_response($class, true));
    }

    /**
     * GET /classes/{id} - Dettaglio classe
     */
    public function get_class(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $class = $this->db->get_class($class_id);
        
        $is_teacher = ($class->teacher_id == $user_id);

        return rest_ensure_response($this->prepare_class_response($class, $is_teacher, true));
    }

    /**
     * PUT /classes/{id} - Aggiorna classe
     */
    public function update_class(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');

        $update_data = [];
        
        $fields = ['name', 'description', 'year', 'section'];
        foreach ($fields as $field) {
            $value = $request->get_param($field);
            if ($value !== null) {
                $update_data[$field] = $value;
            }
        }

        if (empty($update_data)) {
            return new \WP_Error(
                'rest_no_data',
                __('Nessun dato da aggiornare.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->update_class($class_id, $update_data);

        if (!$result) {
            return new \WP_Error(
                'rest_update_failed',
                __('Impossibile aggiornare la classe.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $class = $this->db->get_class($class_id);

        return rest_ensure_response($this->prepare_class_response($class, true));
    }

    /**
     * DELETE /classes/{id} - Elimina classe
     */
    public function delete_class(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $force = $request->get_param('force') === true;

        // Verifica se ci sono assegnazioni
        $assignments = $this->db->get_class_assignments($class_id);
        
        if (!empty($assignments) && !$force) {
            return new \WP_Error(
                'rest_has_assignments',
                __('La classe ha assegnazioni. Usa force=true per eliminarla comunque.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->delete_class($class_id);

        if (!$result) {
            return new \WP_Error(
                'rest_delete_failed',
                __('Impossibile eliminare la classe.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'deleted' => true,
            'id'      => $class_id,
            'message' => __('Classe eliminata.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /classes/join - Studente si iscrive
     */
    public function join_class(\WP_REST_Request $request) {
        $code = strtoupper(trim($request->get_param('code')));
        $user_id = get_current_user_id();

        // Trova classe per codice
        $class = $this->db->get_class_by_code($code);

        if (!$class) {
            return new \WP_Error(
                'rest_invalid_code',
                __('Codice classe non valido.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        if (!$class->join_enabled) {
            return new \WP_Error(
                'rest_join_disabled',
                __('Le iscrizioni a questa classe sono disabilitate.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        if (!$class->is_active) {
            return new \WP_Error(
                'rest_class_archived',
                __('Questa classe Ã¨ archiviata.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        // Verifica se giÃ  iscritto
        if ($this->db->is_student_in_class($class->id, $user_id)) {
            return new \WP_Error(
                'rest_already_enrolled',
                __('Sei giÃ  iscritto a questa classe.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Non puÃ² iscriversi alla propria classe
        if ($class->teacher_id == $user_id) {
            return new \WP_Error(
                'rest_is_teacher',
                __('Sei il docente di questa classe.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Iscrivi studente
        $result = $this->db->add_student_to_class($class->id, $user_id);

        if (!$result) {
            return new \WP_Error(
                'rest_join_failed',
                __('Impossibile iscriversi alla classe.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'joined'  => true,
            'class'   => $this->prepare_class_response($class, false),
            'message' => sprintf(__('Ti sei iscritto alla classe "%s".', 'webpicsimulator'), $class->name)
        ]);
    }

    /**
     * GET /classes/{id}/students - Lista studenti
     */
    public function get_students(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $status = $request->get_param('status');

        $students = $this->db->get_class_students($class_id, $status);

        $data = [];
        foreach ($students as $student) {
            $user = get_userdata($student->student_id);
            
            $data[] = [
                'id'           => (int) $student->student_id,
                'display_name' => $user ? $user->display_name : __('Utente eliminato', 'webpicsimulator'),
                'email'        => $user ? $user->user_email : '',
                'status'       => $student->status,
                'joined_at'    => $student->joined_at,
                'avatar_url'   => get_avatar_url($student->student_id, ['size' => 64])
            ];
        }

        return rest_ensure_response($data);
    }

    /**
     * POST /classes/{id}/students - Aggiungi studente
     */
    public function add_student(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $email = $request->get_param('email');

        // Trova utente per email
        $user = get_user_by('email', $email);

        if (!$user) {
            return new \WP_Error(
                'rest_user_not_found',
                __('Nessun utente trovato con questa email.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        $class = $this->db->get_class($class_id);

        // Non puÃ² aggiungere se stesso (docente)
        if ($class->teacher_id == $user->ID) {
            return new \WP_Error(
                'rest_is_teacher',
                __('Non puoi aggiungerti come studente.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica se giÃ  iscritto
        if ($this->db->is_student_in_class($class_id, $user->ID)) {
            return new \WP_Error(
                'rest_already_enrolled',
                __('Lo studente Ã¨ giÃ  iscritto.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->add_student_to_class($class_id, $user->ID);

        if (!$result) {
            return new \WP_Error(
                'rest_add_failed',
                __('Impossibile aggiungere lo studente.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'added'   => true,
            'student' => [
                'id'           => $user->ID,
                'display_name' => $user->display_name,
                'email'        => $user->user_email
            ],
            'message' => sprintf(__('Studente %s aggiunto.', 'webpicsimulator'), $user->display_name)
        ]);
    }

    /**
     * PUT /classes/{id}/students/{student_id} - Modifica stato studente
     */
    public function update_student(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $student_id = (int) $request->get_param('student_id');
        $status = $request->get_param('status');

        if (!in_array($status, ['active', 'suspended'])) {
            return new \WP_Error(
                'rest_invalid_status',
                __('Stato non valido.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->update_student_status($class_id, $student_id, $status);

        if (!$result) {
            return new \WP_Error(
                'rest_update_failed',
                __('Impossibile aggiornare lo stato.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $user = get_userdata($student_id);

        return rest_ensure_response([
            'updated' => true,
            'student' => [
                'id'           => $student_id,
                'display_name' => $user ? $user->display_name : '',
                'status'       => $status
            ]
        ]);
    }

    /**
     * DELETE /classes/{id}/students/{student_id} - Rimuovi studente
     */
    public function remove_student(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');
        $student_id = (int) $request->get_param('student_id');

        $result = $this->db->remove_student_from_class($class_id, $student_id);

        if (!$result) {
            return new \WP_Error(
                'rest_remove_failed',
                __('Impossibile rimuovere lo studente.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'removed'    => true,
            'student_id' => $student_id,
            'message'    => __('Studente rimosso dalla classe.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /classes/{id}/regenerate-code - Rigenera join code
     */
    public function regenerate_code(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');

        $new_code = $this->generate_join_code();

        $result = $this->db->update_class($class_id, ['join_code' => $new_code]);

        if (!$result) {
            return new \WP_Error(
                'rest_regenerate_failed',
                __('Impossibile rigenerare il codice.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'regenerated' => true,
            'join_code'   => $new_code,
            'message'     => __('Codice rigenerato.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /classes/{id}/toggle-join - Abilita/disabilita iscrizioni
     */
    public function toggle_join(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');

        $class = $this->db->get_class($class_id);
        $new_status = !$class->join_enabled;

        $result = $this->db->update_class($class_id, ['join_enabled' => $new_status ? 1 : 0]);

        if (!$result) {
            return new \WP_Error(
                'rest_toggle_failed',
                __('Impossibile modificare lo stato iscrizioni.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'join_enabled' => $new_status,
            'message'      => $new_status 
                ? __('Iscrizioni abilitate.', 'webpicsimulator')
                : __('Iscrizioni disabilitate.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /classes/{id}/archive - Archivia classe
     */
    public function archive_class(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');

        $result = $this->db->archive_class($class_id);

        if (!$result) {
            return new \WP_Error(
                'rest_archive_failed',
                __('Impossibile archiviare la classe.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'archived' => true,
            'message'  => __('Classe archiviata.', 'webpicsimulator')
        ]);
    }

    /**
     * GET /classes/{id}/stats - Statistiche classe
     */
    public function get_class_stats(\WP_REST_Request $request) {
        $class_id = (int) $request->get_param('id');

        $stats = [
            'students_count'     => $this->db->count_class_students($class_id),
            'assignments_count'  => count($this->db->get_class_assignments($class_id)),
            'active_assignments' => count($this->db->get_class_assignments($class_id, 'published')),
            'submissions'        => $this->get_class_submissions_stats($class_id)
        ];

        return rest_ensure_response($stats);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Genera codice join univoco
     */
    private function generate_join_code() {
        $length = (int) get_option('picsim_join_code_length', 6);
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Esclusi I,O,0,1 per evitare confusione
        
        do {
            $code = '';
            for ($i = 0; $i < $length; $i++) {
                $code .= $chars[random_int(0, strlen($chars) - 1)];
            }
        } while ($this->db->get_class_by_code($code));

        return $code;
    }

    /**
     * Statistiche submissions per classe
     */
    private function get_class_submissions_stats($class_id) {
        $assignments = $this->db->get_class_assignments($class_id);
        $total_submitted = 0;
        $total_graded = 0;

        foreach ($assignments as $assignment) {
            $total_submitted += $this->db->count_assignment_submissions($assignment->id, 'submitted');
            $total_graded += $this->db->count_assignment_submissions($assignment->id, 'graded');
        }

        return [
            'total_submitted' => $total_submitted,
            'total_graded'    => $total_graded,
            'pending_grade'   => $total_submitted - $total_graded
        ];
    }

    /**
     * Prepara risposta classe
     */
    private function prepare_class_response($class, $is_teacher = false, $full_details = false) {
        $data = [
            'id'          => (int) $class->id,
            'name'        => $class->name,
            'description' => $class->description,
            'year'        => $class->year,
            'section'     => $class->section,
            'is_active'   => (bool) $class->is_active,
            'created_at'  => $class->created_at
        ];

        // Info docente
        $teacher = get_userdata($class->teacher_id);
        $data['teacher'] = [
            'id'           => (int) $class->teacher_id,
            'display_name' => $teacher ? $teacher->display_name : ''
        ];

        // Solo per docente
        if ($is_teacher) {
            $data['join_code'] = $class->join_code;
            $data['join_enabled'] = (bool) $class->join_enabled;
            $data['students_count'] = $this->db->count_class_students($class->id);
        }

        // Dettagli completi
        if ($full_details) {
            $data['updated_at'] = $class->updated_at;
            
            if ($class->archived_at) {
                $data['archived_at'] = $class->archived_at;
            }
        }

        // Links
        $data['_links'] = [
            'self' => rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $class->id)
        ];

        if ($is_teacher) {
            $data['_links']['students'] = rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $class->id . '/students');
            $data['_links']['assignments'] = rest_url(self::NAMESPACE . '/assignments?class_id=' . $class->id);
        }

        return $data;
    }

    /**
     * Parametri per lista classi
     */
    private function get_collection_params() {
        return [
            'role' => [
                'type'              => 'string',
                'enum'              => ['teacher', 'student'],
                'description'       => 'Filtra per ruolo',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'active_only' => [
                'type'    => 'boolean',
                'default' => true
            ]
        ];
    }

    /**
     * Parametri per creazione classe
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
            'year' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'section' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ]
        ];
    }

    /**
     * Parametri per aggiornamento classe
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
            'year' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'section' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ]
        ];
    }
}
