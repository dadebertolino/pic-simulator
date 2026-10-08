<?php
/**
 * REST API - Assignments Controller
 * 
 * Gestisce endpoint per assegnazioni: CRUD, pubblicazione, submissions, valutazioni.
 * Base: /wp-json/picsim/v1/assignments
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

class API_Assignments {

    /**
     * Namespace API
     */
    const NAMESPACE = 'picsim/v1';

    /**
     * Base route
     */
    const BASE = 'assignments';

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
        // GET /assignments - Lista assegnazioni
        // POST /assignments - Crea nuova assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE, [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_assignments'],
                'permission_callback' => [$this, 'check_logged_in'],
                'args'                => $this->get_collection_params()
            ],
            [
                'methods'             => \WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'create_assignment'],
                'permission_callback' => [$this, 'check_can_create_assignments'],
                'args'                => $this->get_create_params()
            ]
        ]);

        // GET /assignments/{id} - Dettaglio assegnazione
        // PUT /assignments/{id} - Aggiorna assegnazione
        // DELETE /assignments/{id} - Elimina assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)', [
            [
                'methods'             => \WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_assignment'],
                'permission_callback' => [$this, 'check_assignment_access'],
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
                'callback'            => [$this, 'update_assignment'],
                'permission_callback' => [$this, 'check_assignment_owner'],
                'args'                => $this->get_update_params()
            ],
            [
                'methods'             => \WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'delete_assignment'],
                'permission_callback' => [$this, 'check_assignment_owner']
            ]
        ]);

        // POST /assignments/{id}/publish - Pubblica assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/publish', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'publish_assignment'],
            'permission_callback' => [$this, 'check_assignment_owner']
        ]);

        // POST /assignments/{id}/close - Chiudi assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/close', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'close_assignment'],
            'permission_callback' => [$this, 'check_assignment_owner']
        ]);

        // POST /assignments/{id}/reopen - Riapri assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/reopen', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'reopen_assignment'],
            'permission_callback' => [$this, 'check_assignment_owner'],
            'args'                => [
                'new_due_date' => [
                    'type'              => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
        ]);

        // POST /assignments/{id}/start - Studente inizia assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/start', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'start_assignment'],
            'permission_callback' => [$this, 'check_student_in_class']
        ]);

        // GET /assignments/{id}/submissions - Lista submissions (docente)
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/submissions', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [$this, 'get_submissions'],
            'permission_callback' => [$this, 'check_assignment_owner'],
            'args'                => [
                'status' => [
                    'type' => 'string',
                    'enum' => ['active', 'submitted', 'graded']
                ]
            ]
        ]);

        // GET /assignments/{id}/my-submission - Submission studente corrente
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/my-submission', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [$this, 'get_my_submission'],
            'permission_callback' => [$this, 'check_student_in_class']
        ]);

        // PUT /assignments/{id}/submissions/{user_id}/grade - Valuta submission
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/submissions/(?P<user_id>\d+)/grade', [
            'methods'             => \WP_REST_Server::EDITABLE,
            'callback'            => [$this, 'grade_submission'],
            'permission_callback' => [$this, 'check_can_grade'],
            'args'                => $this->get_grade_params()
        ]);

        // POST /assignments/{id}/submissions/{user_id}/unlock - Sblocca submission per modifiche
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/submissions/(?P<user_id>\d+)/unlock', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'unlock_submission'],
            'permission_callback' => [$this, 'check_can_grade']
        ]);

        // GET /assignments/{id}/stats - Statistiche assegnazione
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/stats', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [$this, 'get_assignment_stats'],
            'permission_callback' => [$this, 'check_assignment_owner']
        ]);

        // POST /assignments/{id}/extend - Estendi scadenza
        register_rest_route(self::NAMESPACE, '/' . self::BASE . '/(?P<id>\d+)/extend', [
            'methods'             => \WP_REST_Server::CREATABLE,
            'callback'            => [$this, 'extend_deadline'],
            'permission_callback' => [$this, 'check_assignment_owner'],
            'args'                => [
                'new_due_date' => [
                    'type'              => 'string',
                    'required'          => true,
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
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
     * Verifica permesso creazione assegnazioni
     */
    public function check_can_create_assignments() {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        if (!current_user_can('picsim_create_assignments')) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non hai i permessi per creare assegnazioni.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica accesso assegnazione (docente o studente della classe)
     */
    public function check_assignment_access(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $assignment = $this->db->get_assignment($assignment_id);

        if (!$assignment) {
            return new \WP_Error(
                'rest_not_found',
                __('Assegnazione non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        $class = $this->db->get_class($assignment->class_id);

        // Docente proprietario
        if ($class && $class->teacher_id == $user_id) {
            return true;
        }

        // Studente iscritto (solo se pubblicata)
        if ($assignment->status === 'published' && $this->db->is_student_in_class($assignment->class_id, $user_id)) {
            return true;
        }

        // Admin
        if (current_user_can('picsim_manage_all')) {
            return true;
        }

        return new \WP_Error(
            'rest_forbidden',
            __('Non hai accesso a questa assegnazione.', 'webpicsimulator'),
            ['status' => 403]
        );
    }

    /**
     * Verifica proprietario assegnazione (docente della classe)
     */
    public function check_assignment_owner(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $assignment = $this->db->get_assignment($assignment_id);

        if (!$assignment) {
            return new \WP_Error(
                'rest_not_found',
                __('Assegnazione non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        $class = $this->db->get_class($assignment->class_id);

        if (!$class || ($class->teacher_id != $user_id && !current_user_can('picsim_manage_all'))) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non sei il docente di questa assegnazione.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica studente nella classe dell'assegnazione
     */
    public function check_student_in_class(\WP_REST_Request $request) {
        $logged_in = $this->check_logged_in();
        if (is_wp_error($logged_in)) {
            return $logged_in;
        }

        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $assignment = $this->db->get_assignment($assignment_id);

        if (!$assignment) {
            return new \WP_Error(
                'rest_not_found',
                __('Assegnazione non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        if (!$this->db->is_student_in_class($assignment->class_id, $user_id)) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non sei iscritto a questa classe.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    /**
     * Verifica permesso valutazione
     */
    public function check_can_grade(\WP_REST_Request $request) {
        $owner_check = $this->check_assignment_owner($request);
        if (is_wp_error($owner_check)) {
            return $owner_check;
        }

        if (!current_user_can('picsim_grade_submissions')) {
            return new \WP_Error(
                'rest_forbidden',
                __('Non hai i permessi per valutare.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        return true;
    }

    // =========================================================================
    // ENDPOINT CALLBACKS
    // =========================================================================

    /**
     * GET /assignments - Lista assegnazioni
     */
    public function get_assignments(\WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $class_id = $request->get_param('class_id');
        $status = $request->get_param('status');

        $data = [];

        // Docente: assegnazioni delle proprie classi
        if (current_user_can('picsim_create_assignments')) {
            if ($class_id) {
                // Verifica che sia docente della classe
                $class = $this->db->get_class($class_id);
                if ($class && $class->teacher_id == $user_id) {
                    $assignments = $this->db->get_class_assignments($class_id, $status);
                    foreach ($assignments as $assignment) {
                        $data[] = $this->prepare_assignment_response($assignment, true);
                    }
                }
            } else {
                // Tutte le classi del docente
                $classes = $this->db->get_teacher_classes($user_id);
                foreach ($classes as $class) {
                    $assignments = $this->db->get_class_assignments($class->id, $status);
                    foreach ($assignments as $assignment) {
                        $data[] = $this->prepare_assignment_response($assignment, true);
                    }
                }
            }
        }

        // Studente: assegnazioni pubblicate delle proprie classi
        $student_assignments = $this->db->get_student_assignments($user_id);
        foreach ($student_assignments as $assignment) {
            // Evita duplicati
            $exists = array_filter($data, function($a) use ($assignment) {
                return $a['id'] === (int) $assignment->id;
            });

            if (empty($exists)) {
                $data[] = $this->prepare_assignment_response($assignment, false, $user_id);
            }
        }

        // Ordina per scadenza
        usort($data, function($a, $b) {
            return strtotime($a['due_date']) - strtotime($b['due_date']);
        });

        return rest_ensure_response($data);
    }

    /**
     * POST /assignments - Crea assegnazione
     */
    public function create_assignment(\WP_REST_Request $request) {
        $user_id = get_current_user_id();
        $class_id = (int) $request->get_param('class_id');

        // Verifica classe
        $class = $this->db->get_class($class_id);
        if (!$class || $class->teacher_id != $user_id) {
            return new \WP_Error(
                'rest_invalid_class',
                __('Classe non valida o non sei il docente.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica template
        $template_id = (int) $request->get_param('template_id');
        $template = $this->db->get_project($template_id);

        if (!$template || $template->type !== 'template') {
            return new \WP_Error(
                'rest_invalid_template',
                __('Template non valido.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica accesso al template
        if (!$this->db->user_can_access_project($user_id, $template_id)) {
            return new \WP_Error(
                'rest_forbidden_template',
                __('Non hai accesso a questo template.', 'webpicsimulator'),
                ['status' => 403]
            );
        }

        $assignment_data = [
            'class_id'            => $class_id,
            'template_id'         => $template_id,
            'title'               => $request->get_param('title'),
            'instructions'        => $request->get_param('instructions'),
            'due_date'            => $request->get_param('due_date'),
            'allow_late'          => $request->get_param('allow_late') ? 1 : 0,
            'late_penalty'        => (float) $request->get_param('late_penalty'),
            'auto_lock'           => $request->get_param('auto_lock') !== false ? 1 : 0,
            'show_solution_after' => $request->get_param('show_solution_after') ? 1 : 0,
            'solution_id'         => $request->get_param('solution_id')
        ];

        $assignment_id = $this->db->create_assignment($assignment_data);

        if (!$assignment_id) {
            return new \WP_Error(
                'rest_create_failed',
                __('Impossibile creare l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response($this->prepare_assignment_response($assignment, true));
    }

    /**
     * GET /assignments/{id} - Dettaglio assegnazione
     */
    public function get_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $assignment = $this->db->get_assignment($assignment_id);
        $class = $this->db->get_class($assignment->class_id);

        $is_teacher = ($class->teacher_id == $user_id);

        return rest_ensure_response(
            $this->prepare_assignment_response($assignment, $is_teacher, $is_teacher ? null : $user_id, true)
        );
    }

    /**
     * PUT /assignments/{id} - Aggiorna assegnazione
     */
    public function update_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');

        $assignment = $this->db->get_assignment($assignment_id);

        // Non modificare se già pubblicata (solo alcuni campi)
        $update_data = [];

        if ($assignment->status === 'draft') {
            // Bozza: tutto modificabile
            $fields = ['title', 'instructions', 'due_date', 'allow_late', 'late_penalty', 
                       'auto_lock', 'show_solution_after', 'solution_id', 'template_id'];
        } else {
            // Pubblicata: solo alcuni campi
            $fields = ['instructions', 'due_date', 'allow_late', 'late_penalty'];
        }

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

        $result = $this->db->update_assignment($assignment_id, $update_data);

        if (!$result) {
            return new \WP_Error(
                'rest_update_failed',
                __('Impossibile aggiornare l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response($this->prepare_assignment_response($assignment, true));
    }

    /**
     * DELETE /assignments/{id} - Elimina assegnazione
     */
    public function delete_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $force = $request->get_param('force') === true;

        $assignment = $this->db->get_assignment($assignment_id);

        // Non eliminare se ha submissions (a meno che force)
        $submissions_count = $this->db->count_assignment_submissions($assignment_id);

        if ($submissions_count > 0 && !$force) {
            return new \WP_Error(
                'rest_has_submissions',
                sprintf(
                    __('L\'assegnazione ha %d consegne. Usa force=true per eliminarla.', 'webpicsimulator'),
                    $submissions_count
                ),
                ['status' => 400]
            );
        }

        $result = $this->db->delete_assignment($assignment_id);

        if (!$result) {
            return new \WP_Error(
                'rest_delete_failed',
                __('Impossibile eliminare l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'deleted' => true,
            'id'      => $assignment_id,
            'message' => __('Assegnazione eliminata.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /assignments/{id}/publish - Pubblica assegnazione
     */
    public function publish_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');

        $assignment = $this->db->get_assignment($assignment_id);

        if ($assignment->status !== 'draft') {
            return new \WP_Error(
                'rest_already_published',
                __('L\'assegnazione è già stata pubblicata.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica che abbia una scadenza valida
        if (empty($assignment->due_date) || strtotime($assignment->due_date) < time()) {
            return new \WP_Error(
                'rest_invalid_due_date',
                __('Imposta una scadenza futura prima di pubblicare.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->publish_assignment($assignment_id);

        if (!$result) {
            return new \WP_Error(
                'rest_publish_failed',
                __('Impossibile pubblicare l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response([
            'published'  => true,
            'assignment' => $this->prepare_assignment_response($assignment, true),
            'message'    => __('Assegnazione pubblicata.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /assignments/{id}/close - Chiudi assegnazione
     */
    public function close_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');

        $assignment = $this->db->get_assignment($assignment_id);

        if ($assignment->status === 'closed') {
            return new \WP_Error(
                'rest_already_closed',
                __('L\'assegnazione è già chiusa.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Blocca tutti i progetti non consegnati se auto_lock attivo
        if ($assignment->auto_lock) {
            $this->lock_all_submissions($assignment_id);
        }

        $result = $this->db->close_assignment($assignment_id);

        if (!$result) {
            return new \WP_Error(
                'rest_close_failed',
                __('Impossibile chiudere l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response([
            'closed'     => true,
            'assignment' => $this->prepare_assignment_response($assignment, true),
            'message'    => __('Assegnazione chiusa.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /assignments/{id}/reopen - Riapri assegnazione
     */
    public function reopen_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $new_due_date = $request->get_param('new_due_date');

        $update_data = ['status' => 'published'];

        if ($new_due_date) {
            $update_data['due_date'] = $new_due_date;
        }

        $result = $this->db->update_assignment($assignment_id, $update_data);

        if (!$result) {
            return new \WP_Error(
                'rest_reopen_failed',
                __('Impossibile riaprire l\'assegnazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response([
            'reopened'   => true,
            'assignment' => $this->prepare_assignment_response($assignment, true),
            'message'    => __('Assegnazione riaperta.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /assignments/{id}/start - Studente inizia assegnazione
     */
    public function start_assignment(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $assignment = $this->db->get_assignment($assignment_id);

        // Verifica stato
        if ($assignment->status !== 'published') {
            return new \WP_Error(
                'rest_not_available',
                __('Questa assegnazione non è disponibile.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        // Verifica se già iniziata
        $existing = $this->db->get_student_submission($assignment_id, $user_id);
        if ($existing) {
            return rest_ensure_response([
                'started'    => false,
                'project_id' => (int) $existing->id,
                'message'    => __('Hai già iniziato questa assegnazione.', 'webpicsimulator')
            ]);
        }

        // Duplica template come submission
        $template = $this->db->get_project($assignment->template_id, true);

        if (!$template) {
            return new \WP_Error(
                'rest_template_error',
                __('Template non trovato.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Crea progetto submission
        $project_data = [
            'user_id'       => $user_id,
            'name'          => $assignment->title,
            'description'   => $template->description,
            'device'        => $template->device,
            'clock'         => $template->clock,
            'type'          => 'submission',
            'class_id'      => $assignment->class_id,
            'assignment_id' => $assignment_id,
            'parent_id'     => $template->id,
            'status'        => 'active',
            'due_date'      => $assignment->due_date
        ];

        $project_id = $this->db->create_project($project_data);

        if (!$project_id) {
            return new \WP_Error(
                'rest_create_failed',
                __('Impossibile creare il progetto.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        // Copia files dal template
        if (!empty($template->files)) {
            foreach ($template->files as $file) {
                $this->db->create_file([
                    'project_id'  => $project_id,
                    'filename'    => $file->filename,
                    'type'        => $file->type,
                    'content'     => $file->content,
                    'is_main'     => $file->is_main,
                    'is_readonly' => $file->is_readonly,
                    'is_provided' => 1 // Marca come file fornito
                ]);
            }
        }

        return rest_ensure_response([
            'started'    => true,
            'project_id' => $project_id,
            'message'    => __('Assegnazione iniziata. Buon lavoro!', 'webpicsimulator')
        ]);
    }

    /**
     * GET /assignments/{id}/submissions - Lista submissions
     */
    public function get_submissions(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $status = $request->get_param('status');

        $submissions = $this->db->get_assignment_submissions($assignment_id);

        $data = [];
        foreach ($submissions as $submission) {
            // Filtra per status se specificato
            if ($status && $submission->status !== $status) {
                continue;
            }

            $data[] = $this->prepare_submission_response($submission);
        }

        return rest_ensure_response($data);
    }

    /**
     * GET /assignments/{id}/my-submission - Submission studente corrente
     */
    public function get_my_submission(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $user_id = get_current_user_id();

        $submission = $this->db->get_student_submission($assignment_id, $user_id);

        if (!$submission) {
            return rest_ensure_response([
                'started' => false,
                'message' => __('Non hai ancora iniziato questa assegnazione.', 'webpicsimulator')
            ]);
        }

        return rest_ensure_response([
            'started'    => true,
            'submission' => $this->prepare_submission_response($submission, true)
        ]);
    }

    /**
     * PUT /assignments/{id}/submissions/{user_id}/grade - Valuta submission
     */
    public function grade_submission(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $student_id = (int) $request->get_param('user_id');

        $submission = $this->db->get_student_submission($assignment_id, $student_id);

        if (!$submission) {
            return new \WP_Error(
                'rest_not_found',
                __('Consegna non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        $grade = $request->get_param('grade');
        $grade_max = $request->get_param('grade_max');
        $notes = $request->get_param('notes');

        $update_data = [
            'status' => 'graded'
        ];

        if ($grade !== null) {
            $update_data['grade'] = (float) $grade;
        }
        if ($grade_max !== null) {
            $update_data['grade_max'] = (float) $grade_max;
        }
        if ($notes !== null) {
            $update_data['teacher_notes'] = $notes;
        }

        $result = $this->db->update_project($submission->id, $update_data);

        if (!$result) {
            return new \WP_Error(
                'rest_grade_failed',
                __('Impossibile salvare la valutazione.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $submission = $this->db->get_project($submission->id);

        return rest_ensure_response([
            'graded'     => true,
            'submission' => $this->prepare_submission_response($submission),
            'message'    => __('Valutazione salvata.', 'webpicsimulator')
        ]);
    }

    /**
     * POST /assignments/{id}/submissions/{user_id}/unlock - Sblocca submission
     */
    public function unlock_submission(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $student_id = (int) $request->get_param('user_id');

        $submission = $this->db->get_student_submission($assignment_id, $student_id);

        if (!$submission) {
            return new \WP_Error(
                'rest_not_found',
                __('Consegna non trovata.', 'webpicsimulator'),
                ['status' => 404]
            );
        }

        $result = $this->db->unlock_project($submission->id);

        // Reimposta status a active
        $this->db->update_project($submission->id, ['status' => 'active']);

        if (!$result) {
            return new \WP_Error(
                'rest_unlock_failed',
                __('Impossibile sbloccare la consegna.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        return rest_ensure_response([
            'unlocked' => true,
            'message'  => __('Consegna sbloccata. Lo studente può modificarla.', 'webpicsimulator')
        ]);
    }

    /**
     * GET /assignments/{id}/stats - Statistiche assegnazione
     */
    public function get_assignment_stats(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');

        $assignment = $this->db->get_assignment($assignment_id);
        $class = $this->db->get_class($assignment->class_id);

        $total_students = $this->db->count_class_students($assignment->class_id);
        $started = $this->db->count_assignment_submissions($assignment_id);
        $submitted = $this->db->count_assignment_submissions($assignment_id, 'submitted');
        $graded = $this->db->count_assignment_submissions($assignment_id, 'graded');

        // Calcola media voti
        $submissions = $this->db->get_assignment_submissions($assignment_id);
        $grades = array_filter(array_map(function($s) {
            return $s->grade;
        }, $submissions), function($g) {
            return $g !== null;
        });

        $avg_grade = count($grades) > 0 ? array_sum($grades) / count($grades) : null;

        return rest_ensure_response([
            'total_students'    => $total_students,
            'started'           => $started,
            'not_started'       => $total_students - $started,
            'submitted'         => $submitted,
            'pending_submit'    => $started - $submitted - $graded,
            'graded'            => $graded,
            'pending_grade'     => $submitted,
            'completion_rate'   => $total_students > 0 ? round(($submitted + $graded) / $total_students * 100, 1) : 0,
            'average_grade'     => $avg_grade !== null ? round($avg_grade, 2) : null,
            'is_overdue'        => strtotime($assignment->due_date) < time()
        ]);
    }

    /**
     * POST /assignments/{id}/extend - Estendi scadenza
     */
    public function extend_deadline(\WP_REST_Request $request) {
        $assignment_id = (int) $request->get_param('id');
        $new_due_date = $request->get_param('new_due_date');

        // Valida data
        $timestamp = strtotime($new_due_date);
        if (!$timestamp || $timestamp < time()) {
            return new \WP_Error(
                'rest_invalid_date',
                __('Data non valida o nel passato.', 'webpicsimulator'),
                ['status' => 400]
            );
        }

        $result = $this->db->update_assignment($assignment_id, [
            'due_date' => date('Y-m-d H:i:s', $timestamp)
        ]);

        // Aggiorna anche due_date di tutti i progetti submission
        $this->update_submissions_due_date($assignment_id, $new_due_date);

        if (!$result) {
            return new \WP_Error(
                'rest_extend_failed',
                __('Impossibile estendere la scadenza.', 'webpicsimulator'),
                ['status' => 500]
            );
        }

        $assignment = $this->db->get_assignment($assignment_id);

        return rest_ensure_response([
            'extended'   => true,
            'assignment' => $this->prepare_assignment_response($assignment, true),
            'message'    => __('Scadenza estesa.', 'webpicsimulator')
        ]);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Blocca tutte le submissions
     */
    private function lock_all_submissions($assignment_id) {
        global $wpdb;

        $wpdb->update(
            $this->db->projects,
            [
                'locked'    => 1,
                'locked_at' => current_time('mysql'),
                'locked_by' => get_current_user_id()
            ],
            [
                'assignment_id' => $assignment_id,
                'type'          => 'submission'
            ]
        );
    }

    /**
     * Aggiorna due_date di tutte le submissions
     */
    private function update_submissions_due_date($assignment_id, $due_date) {
        global $wpdb;

        $wpdb->update(
            $this->db->projects,
            ['due_date' => $due_date],
            [
                'assignment_id' => $assignment_id,
                'type'          => 'submission'
            ]
        );
    }

    /**
     * Prepara risposta assegnazione
     */
    private function prepare_assignment_response($assignment, $is_teacher = false, $student_id = null, $full = false) {
        $data = [
            'id'           => (int) $assignment->id,
            'class_id'     => (int) $assignment->class_id,
            'title'        => $assignment->title,
            'instructions' => $assignment->instructions,
            'due_date'     => $assignment->due_date,
            'status'       => $assignment->status,
            'allow_late'   => (bool) $assignment->allow_late,
            'created_at'   => $assignment->created_at
        ];

        // Info classe
        if (isset($assignment->class_name)) {
            $data['class_name'] = $assignment->class_name;
        }

        // Calcola stato temporale
        $now = time();
        $due = strtotime($assignment->due_date);
        $data['is_overdue'] = $due < $now;
        $data['time_remaining'] = max(0, $due - $now);

        // Info docente
        if ($is_teacher) {
            $data['template_id'] = (int) $assignment->template_id;
            $data['late_penalty'] = (float) $assignment->late_penalty;
            $data['auto_lock'] = (bool) $assignment->auto_lock;
            $data['show_solution_after'] = (bool) $assignment->show_solution_after;
            
            if ($assignment->solution_id) {
                $data['solution_id'] = (int) $assignment->solution_id;
            }

            // Conteggi
            $data['submissions_count'] = $this->db->count_assignment_submissions($assignment->id);
            $data['graded_count'] = $this->db->count_assignment_submissions($assignment->id, 'graded');
        }

        // Info studente
        if ($student_id) {
            $submission = $this->db->get_student_submission($assignment->id, $student_id);
            $data['my_status'] = $submission ? $submission->status : 'not_started';
            
            if ($submission) {
                $data['my_project_id'] = (int) $submission->id;
                
                if ($submission->grade !== null) {
                    $data['my_grade'] = (float) $submission->grade;
                    $data['grade_max'] = (float) $submission->grade_max;
                }
            }
        }

        // Dettagli completi
        if ($full) {
            $data['published_at'] = $assignment->published_at;
            $data['closed_at'] = $assignment->closed_at;
            $data['updated_at'] = $assignment->updated_at;
        }

        // Links
        $data['_links'] = [
            'self' => rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $assignment->id)
        ];

        if ($is_teacher) {
            $data['_links']['submissions'] = rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $assignment->id . '/submissions');
            $data['_links']['stats'] = rest_url(self::NAMESPACE . '/' . self::BASE . '/' . $assignment->id . '/stats');
        }

        return $data;
    }

    /**
     * Prepara risposta submission
     */
    private function prepare_submission_response($submission, $include_grade_details = false) {
        $data = [
            'project_id'   => (int) $submission->id,
            'student_id'   => (int) $submission->user_id,
            'student_name' => $submission->student_name ?? get_userdata($submission->user_id)->display_name,
            'status'       => $submission->status,
            'submitted_at' => $submission->submitted_at,
            'locked'       => (bool) $submission->locked,
            'created_at'   => $submission->created_at,
            'updated_at'   => $submission->updated_at
        ];

        // Voto
        if ($submission->grade !== null) {
            $data['grade'] = (float) $submission->grade;
            $data['grade_max'] = (float) $submission->grade_max;
            $data['grade_percentage'] = round($submission->grade / $submission->grade_max * 100, 1);
        }

        // Dettagli valutazione
        if ($include_grade_details && $submission->teacher_notes) {
            $data['teacher_notes'] = $submission->teacher_notes;
        }

        // Calcola ritardo
        if ($submission->due_date && $submission->submitted_at) {
            $due = strtotime($submission->due_date);
            $submitted = strtotime($submission->submitted_at);
            $data['is_late'] = $submitted > $due;
            
            if ($data['is_late']) {
                $data['late_by'] = $submitted - $due; // secondi
            }
        }

        return $data;
    }

    /**
     * Parametri per lista assegnazioni
     */
    private function get_collection_params() {
        return [
            'class_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ],
            'status' => [
                'type' => 'string',
                'enum' => ['draft', 'published', 'closed']
            ]
        ];
    }

    /**
     * Parametri per creazione assegnazione
     */
    private function get_create_params() {
        return [
            'class_id' => [
                'type'              => 'integer',
                'required'          => true,
                'sanitize_callback' => 'absint'
            ],
            'template_id' => [
                'type'              => 'integer',
                'required'          => true,
                'sanitize_callback' => 'absint'
            ],
            'title' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'instructions' => [
                'type'              => 'string',
                'sanitize_callback' => 'wp_kses_post'
            ],
            'due_date' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'allow_late' => [
                'type'    => 'boolean',
                'default' => false
            ],
            'late_penalty' => [
                'type'    => 'number',
                'default' => 0
            ],
            'auto_lock' => [
                'type'    => 'boolean',
                'default' => true
            ],
            'show_solution_after' => [
                'type'    => 'boolean',
                'default' => false
            ],
            'solution_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ]
        ];
    }

    /**
     * Parametri per aggiornamento assegnazione
     */
    private function get_update_params() {
        return [
            'title' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'instructions' => [
                'type'              => 'string',
                'sanitize_callback' => 'wp_kses_post'
            ],
            'due_date' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field'
            ],
            'allow_late' => [
                'type' => 'boolean'
            ],
            'late_penalty' => [
                'type' => 'number'
            ],
            'auto_lock' => [
                'type' => 'boolean'
            ],
            'show_solution_after' => [
                'type' => 'boolean'
            ],
            'solution_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ],
            'template_id' => [
                'type'              => 'integer',
                'sanitize_callback' => 'absint'
            ]
        ];
    }

    /**
     * Parametri per valutazione
     */
    private function get_grade_params() {
        return [
            'grade' => [
                'type'     => 'number',
                'required' => true,
                'minimum'  => 0
            ],
            'grade_max' => [
                'type'    => 'number',
                'default' => 10,
                'minimum' => 1
            ],
            'notes' => [
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_textarea_field'
            ]
        ];
    }
}
