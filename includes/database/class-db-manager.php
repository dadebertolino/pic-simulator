<?php
/**
 * Database Manager
 * 
 * Helper per query database: CRUD progetti, files, classi, assegnazioni.
 *
 * @package    PicSim
 * @subpackage PicSim/includes/database
 */

namespace PicSim\Database;

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

class DB_Manager {

    /**
     * Istanza singleton
     */
    private static $instance = null;

    /**
     * Riferimento a $wpdb
     */
    private $db;

    /**
     * Nomi tabelle con prefisso
     */
    public $projects;
    public $files;
    public $classes;
    public $class_students;
    public $assignments;
    public $activity_log;

    /**
     * Costruttore privato (singleton)
     */
    private function __construct() {
        global $wpdb;
        $this->db = $wpdb;
        
        // Inizializza nomi tabelle
        $this->projects       = $wpdb->prefix . 'picsim_projects';
        $this->files          = $wpdb->prefix . 'picsim_files';
        $this->classes        = $wpdb->prefix . 'picsim_classes';
        $this->class_students = $wpdb->prefix . 'picsim_class_students';
        $this->assignments    = $wpdb->prefix . 'picsim_assignments';
        $this->activity_log   = $wpdb->prefix . 'picsim_activity_log';
    }

    /**
     * Ottiene istanza singleton
     */
    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    // =========================================================================
    // PROJECTS
    // =========================================================================

    /**
     * Crea un nuovo progetto
     * 
     * @param array $data Dati progetto
     * @return int|false ID progetto creato o false
     */
    public function create_project($data) {
        $defaults = [
            'user_id'     => get_current_user_id(),
            'name'        => '',
            'description' => '',
            'device'      => get_option('picsim_default_device', 'PIC16F84A'),
            'clock'       => get_option('picsim_default_clock', 4000000),
            'type'        => 'personal',
            'status'      => 'draft',
            'created_at'  => current_time('mysql'),
            'updated_at'  => current_time('mysql')
        ];
        
        $data = wp_parse_args($data, $defaults);
        
        // Sanitizza
        $data['name'] = sanitize_text_field($data['name']);
        $data['description'] = sanitize_textarea_field($data['description']);
        $data['device'] = sanitize_text_field($data['device']);
        
        $result = $this->db->insert($this->projects, $data);
        
        if ($result === false) {
            return false;
        }
        
        $project_id = $this->db->insert_id;
        
        // Log attività
        $this->log_activity($data['user_id'], $project_id, 'project_create');
        
        return $project_id;
    }

    /**
     * Ottiene un progetto per ID
     * 
     * @param int $id ID progetto
     * @param bool $with_files Include anche i files
     * @return object|null
     */
    public function get_project($id, $with_files = false) {
        $project = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->projects} WHERE id = %d",
                $id
            )
        );
        
        if ($project && $with_files) {
            $project->files = $this->get_project_files($id);
        }
        
        return $project;
    }

    /**
     * Lista progetti per utente
     * 
     * @param int $user_id ID utente
     * @param array $args Filtri opzionali
     * @return array
     */
    public function get_user_projects($user_id, $args = []) {
        $defaults = [
            'type'     => null,
            'status'   => null,
            'class_id' => null,
            'orderby'  => 'updated_at',
            'order'    => 'DESC',
            'limit'    => 50,
            'offset'   => 0
        ];
        
        $args = wp_parse_args($args, $defaults);
        
        $where = ['user_id = %d'];
        $params = [$user_id];
        
        if ($args['type']) {
            $where[] = 'type = %s';
            $params[] = $args['type'];
        }
        
        if ($args['status']) {
            $where[] = 'status = %s';
            $params[] = $args['status'];
        }
        
        if ($args['class_id']) {
            $where[] = 'class_id = %d';
            $params[] = $args['class_id'];
        }
        
        $where_clause = implode(' AND ', $where);
        $orderby = sanitize_sql_orderby("{$args['orderby']} {$args['order']}");
        
        $sql = "SELECT * FROM {$this->projects} 
                WHERE $where_clause 
                ORDER BY $orderby 
                LIMIT %d OFFSET %d";
        
        $params[] = $args['limit'];
        $params[] = $args['offset'];
        
        return $this->db->get_results(
            $this->db->prepare($sql, $params)
        );
    }

    /**
     * Conta progetti per utente
     */
    public function count_user_projects($user_id, $type = null) {
        $where = 'user_id = %d';
        $params = [$user_id];
        
        if ($type) {
            $where .= ' AND type = %s';
            $params[] = $type;
        }
        
        return (int) $this->db->get_var(
            $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->projects} WHERE $where",
                $params
            )
        );
    }

    /**
     * Aggiorna un progetto
     * 
     * @param int $id ID progetto
     * @param array $data Dati da aggiornare
     * @return bool
     */
    public function update_project($id, $data) {
        // Non permettere modifica device
        unset($data['device']);
        
        // Aggiorna timestamp
        $data['updated_at'] = current_time('mysql');
        
        // Sanitizza
        if (isset($data['name'])) {
            $data['name'] = sanitize_text_field($data['name']);
        }
        if (isset($data['description'])) {
            $data['description'] = sanitize_textarea_field($data['description']);
        }
        
        $result = $this->db->update(
            $this->projects,
            $data,
            ['id' => $id]
        );
        
        return $result !== false;
    }

    /**
     * Elimina un progetto e tutti i suoi files
     * 
     * @param int $id ID progetto
     * @return bool
     */
    public function delete_project($id) {
        // Prima elimina i files
        $this->db->delete($this->files, ['project_id' => $id]);
        
        // Poi il progetto
        $result = $this->db->delete($this->projects, ['id' => $id]);
        
        return $result !== false;
    }

    /**
     * Blocca un progetto
     */
    public function lock_project($id, $locked_by = null) {
        return $this->update_project($id, [
            'locked'    => 1,
            'locked_at' => current_time('mysql'),
            'locked_by' => $locked_by ?: get_current_user_id()
        ]);
    }

    /**
     * Sblocca un progetto
     */
    public function unlock_project($id) {
        return $this->update_project($id, [
            'locked'    => 0,
            'locked_at' => null,
            'locked_by' => null
        ]);
    }

    /**
     * Verifica se utente può accedere al progetto
     */
    public function user_can_access_project($user_id, $project_id) {
        $project = $this->get_project($project_id);
        
        if (!$project) {
            return false;
        }
        
        // Owner può sempre accedere
        if ($project->user_id == $user_id) {
            return true;
        }
        
        // Docente può vedere progetti della sua classe
        if ($project->class_id) {
            $class = $this->get_class($project->class_id);
            if ($class && $class->teacher_id == $user_id) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Verifica se utente può modificare il progetto
     */
    public function user_can_edit_project($user_id, $project_id) {
        $project = $this->get_project($project_id);
        
        if (!$project) {
            return false;
        }
        
        // Progetto bloccato: nessuno può modificare
        if ($project->locked) {
            return false;
        }
        
        // Solo owner può modificare
        return $project->user_id == $user_id;
    }

    /**
     * Duplica un progetto
     */
    public function duplicate_project($id, $new_user_id = null, $new_name = null) {
        $original = $this->get_project($id, true);
        
        if (!$original) {
            return false;
        }
        
        // Prepara dati nuovo progetto
        $new_data = [
            'user_id'     => $new_user_id ?: $original->user_id,
            'name'        => $new_name ?: $original->name . ' (copia)',
            'description' => $original->description,
            'device'      => $original->device,
            'clock'       => $original->clock,
            'type'        => 'personal',
            'status'      => 'draft'
        ];
        
        $new_id = $this->create_project($new_data);
        
        if (!$new_id) {
            return false;
        }
        
        // Duplica files
        if (!empty($original->files)) {
            foreach ($original->files as $file) {
                $this->create_file([
                    'project_id'  => $new_id,
                    'filename'    => $file->filename,
                    'type'        => $file->type,
                    'content'     => $file->content,
                    'is_main'     => $file->is_main,
                    'is_readonly' => 0 // Le copie sono editabili
                ]);
            }
        }
        
        return $new_id;
    }

    // =========================================================================
    // FILES
    // =========================================================================

    /**
     * Crea un nuovo file
     */
    public function create_file($data) {
        $defaults = [
            'project_id'  => 0,
            'filename'    => '',
            'type'        => 'asm',
            'content'     => '',
            'is_main'     => 0,
            'is_readonly' => 0,
            'is_provided' => 0,
            'created_at'  => current_time('mysql'),
            'updated_at'  => current_time('mysql')
        ];
        
        $data = wp_parse_args($data, $defaults);
        
        // Sanitizza filename
        $data['filename'] = sanitize_file_name($data['filename']);
        
        // Verifica limite files per progetto
        $max_files = get_option('picsim_max_files_per_project', 10);
        $current_count = $this->count_project_files($data['project_id']);
        
        if ($current_count >= $max_files) {
            return new \WP_Error('max_files', "Limite massimo di $max_files files raggiunto");
        }
        
        $result = $this->db->insert($this->files, $data);
        
        return $result ? $this->db->insert_id : false;
    }

    /**
     * Ottiene un file
     */
    public function get_file($project_id, $filename) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->files} 
                 WHERE project_id = %d AND filename = %s",
                $project_id,
                $filename
            )
        );
    }

    /**
     * Ottiene file per ID
     */
    public function get_file_by_id($id) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->files} WHERE id = %d",
                $id
            )
        );
    }

    /**
     * Lista files di un progetto
     */
    public function get_project_files($project_id) {
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->files} 
                 WHERE project_id = %d 
                 ORDER BY is_main DESC, filename ASC",
                $project_id
            )
        );
    }

    /**
     * Conta files di un progetto
     */
    public function count_project_files($project_id) {
        return (int) $this->db->get_var(
            $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->files} WHERE project_id = %d",
                $project_id
            )
        );
    }

    /**
     * Aggiorna contenuto file
     */
    public function update_file($project_id, $filename, $content) {
        // Verifica dimensione
        $max_size = get_option('picsim_max_file_size', 65536);
        if (strlen($content) > $max_size) {
            return new \WP_Error('file_too_large', "File troppo grande (max $max_size bytes)");
        }
        
        $result = $this->db->update(
            $this->files,
            [
                'content'    => $content,
                'updated_at' => current_time('mysql')
            ],
            [
                'project_id' => $project_id,
                'filename'   => $filename
            ]
        );
        
        // Aggiorna anche timestamp progetto
        if ($result !== false) {
            $this->db->update(
                $this->projects,
                ['updated_at' => current_time('mysql')],
                ['id' => $project_id]
            );
        }
        
        return $result !== false;
    }

    /**
     * Rinomina file
     */
    public function rename_file($project_id, $old_filename, $new_filename) {
        $new_filename = sanitize_file_name($new_filename);
        
        // Verifica che il nuovo nome non esista già
        $existing = $this->get_file($project_id, $new_filename);
        if ($existing) {
            return new \WP_Error('file_exists', 'Un file con questo nome esiste già');
        }
        
        $result = $this->db->update(
            $this->files,
            [
                'filename'   => $new_filename,
                'updated_at' => current_time('mysql')
            ],
            [
                'project_id' => $project_id,
                'filename'   => $old_filename
            ]
        );
        
        return $result !== false;
    }

    /**
     * Elimina file
     */
    public function delete_file($project_id, $filename) {
        // Non permettere eliminazione main.asm
        $file = $this->get_file($project_id, $filename);
        if ($file && $file->is_main) {
            return new \WP_Error('cannot_delete_main', 'Impossibile eliminare il file principale');
        }
        
        $result = $this->db->delete(
            $this->files,
            [
                'project_id' => $project_id,
                'filename'   => $filename
            ]
        );
        
        return $result !== false;
    }

    /**
     * Ottiene file principale di un progetto
     */
    public function get_main_file($project_id) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->files} 
                 WHERE project_id = %d AND is_main = 1",
                $project_id
            )
        );
    }

    // =========================================================================
    // CLASSES
    // =========================================================================

    /**
     * Crea una nuova classe
     */
    public function create_class($data) {
        $defaults = [
            'teacher_id'   => get_current_user_id(),
            'name'         => '',
            'description'  => '',
            'year'         => '',
            'section'      => '',
            'join_code'    => $this->generate_join_code(),
            'join_enabled' => 1,
            'is_active'    => 1,
            'created_at'   => current_time('mysql'),
            'updated_at'   => current_time('mysql')
        ];
        
        $data = wp_parse_args($data, $defaults);
        
        // Sanitizza
        $data['name'] = sanitize_text_field($data['name']);
        $data['description'] = sanitize_textarea_field($data['description']);
        $data['year'] = sanitize_text_field($data['year']);
        $data['section'] = sanitize_text_field($data['section']);
        
        $result = $this->db->insert($this->classes, $data);
        
        return $result ? $this->db->insert_id : false;
    }

    /**
     * Genera codice join univoco
     */
    private function generate_join_code() {
        $length = get_option('picsim_join_code_length', 6);
        
        do {
            $code = strtoupper(wp_generate_password($length, false, false));
            $exists = $this->db->get_var(
                $this->db->prepare(
                    "SELECT id FROM {$this->classes} WHERE join_code = %s",
                    $code
                )
            );
        } while ($exists);
        
        return $code;
    }

    /**
     * Ottiene una classe
     */
    public function get_class($id) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->classes} WHERE id = %d",
                $id
            )
        );
    }

    /**
     * Cerca classe per codice join
     */
    public function get_class_by_join_code($code) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->classes} 
                 WHERE join_code = %s AND join_enabled = 1 AND is_active = 1",
                strtoupper($code)
            )
        );
    }

    /**
     * Cerca classe per codice (alias per compatibilità)
     */
    public function get_class_by_code($code) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->classes} WHERE join_code = %s",
                strtoupper($code)
            )
        );
    }

    /**
     * Lista classi per docente
     */
    public function get_teacher_classes($teacher_id, $include_archived = false) {
        $where = 'teacher_id = %d';
        if (!$include_archived) {
            $where .= ' AND is_active = 1';
        }
        
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->classes} 
                 WHERE $where 
                 ORDER BY year DESC, name ASC",
                $teacher_id
            )
        );
    }

    /**
     * Lista classi per studente
     */
    public function get_student_classes($student_id) {
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT c.* FROM {$this->classes} c
                 INNER JOIN {$this->class_students} cs ON c.id = cs.class_id
                 WHERE cs.student_id = %d AND cs.status = 'active' AND c.is_active = 1
                 ORDER BY c.year DESC, c.name ASC",
                $student_id
            )
        );
    }

    /**
     * Aggiorna classe
     */
    public function update_class($id, $data) {
        $data['updated_at'] = current_time('mysql');
        
        if (isset($data['name'])) {
            $data['name'] = sanitize_text_field($data['name']);
        }
        
        return $this->db->update($this->classes, $data, ['id' => $id]) !== false;
    }

    /**
     * Rigenera codice join
     */
    public function regenerate_join_code($id) {
        $new_code = $this->generate_join_code();
        return $this->update_class($id, ['join_code' => $new_code]) ? $new_code : false;
    }

    /**
     * Archivia classe
     */
    public function archive_class($id) {
        return $this->update_class($id, [
            'is_active'   => 0,
            'archived_at' => current_time('mysql')
        ]);
    }

    // =========================================================================
    // CLASS STUDENTS
    // =========================================================================

    /**
     * Aggiunge studente a classe
     */
    public function add_student_to_class($class_id, $student_id) {
        // Verifica se già iscritto
        $existing = $this->db->get_var(
            $this->db->prepare(
                "SELECT id FROM {$this->class_students} 
                 WHERE class_id = %d AND student_id = %d",
                $class_id,
                $student_id
            )
        );
        
        if ($existing) {
            // Riattiva se era stato rimosso
            return $this->db->update(
                $this->class_students,
                [
                    'status'     => 'active',
                    'removed_at' => null
                ],
                ['id' => $existing]
            ) !== false;
        }
        
        return $this->db->insert(
            $this->class_students,
            [
                'class_id'   => $class_id,
                'student_id' => $student_id,
                'status'     => 'active',
                'joined_at'  => current_time('mysql')
            ]
        ) !== false;
    }

    /**
     * Rimuove studente da classe
     */
    public function remove_student_from_class($class_id, $student_id) {
        return $this->db->update(
            $this->class_students,
            [
                'status'     => 'removed',
                'removed_at' => current_time('mysql')
            ],
            [
                'class_id'   => $class_id,
                'student_id' => $student_id
            ]
        ) !== false;
    }

    /**
     * Lista studenti di una classe
     */
    public function get_class_students($class_id, $status = 'active') {
        $where = 'cs.class_id = %d';
        $params = [$class_id];
        
        if ($status) {
            $where .= ' AND cs.status = %s';
            $params[] = $status;
        }
        
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT cs.student_id, u.ID, u.display_name, u.user_email, cs.status, cs.joined_at
                 FROM {$this->class_students} cs
                 INNER JOIN {$this->db->users} u ON cs.student_id = u.ID
                 WHERE $where
                 ORDER BY u.display_name ASC",
                $params
            )
        );
    }

    /**
     * Conta studenti attivi in una classe
     */
    public function count_class_students($class_id) {
        return (int) $this->db->get_var(
            $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->class_students} 
                 WHERE class_id = %d AND status = 'active'",
                $class_id
            )
        );
    }

    /**
     * Verifica se studente è in classe
     */
    public function is_student_in_class($class_id, $student_id) {
        return (bool) $this->db->get_var(
            $this->db->prepare(
                "SELECT id FROM {$this->class_students} 
                 WHERE class_id = %d AND student_id = %d AND status = 'active'",
                $class_id,
                $student_id
            )
        );
    }

    // =========================================================================
    // ASSIGNMENTS
    // =========================================================================

    /**
     * Crea assegnazione
     */
    public function create_assignment($data) {
        $defaults = [
            'class_id'            => 0,
            'template_id'         => 0,
            'title'               => '',
            'instructions'        => '',
            'due_date'            => '',
            'allow_late'          => 0,
            'late_penalty'        => 0,
            'auto_lock'           => 1,
            'show_solution_after' => 0,
            'solution_id'         => null,
            'status'              => 'draft',
            'created_at'          => current_time('mysql'),
            'updated_at'          => current_time('mysql')
        ];
        
        $data = wp_parse_args($data, $defaults);
        
        $data['title'] = sanitize_text_field($data['title']);
        $data['instructions'] = wp_kses_post($data['instructions']);
        
        $result = $this->db->insert($this->assignments, $data);
        
        return $result ? $this->db->insert_id : false;
    }

    /**
     * Ottiene assegnazione
     */
    public function get_assignment($id) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->assignments} WHERE id = %d",
                $id
            )
        );
    }

    /**
     * Lista assegnazioni per classe
     */
    public function get_class_assignments($class_id, $status = null) {
        $where = 'class_id = %d';
        $params = [$class_id];
        
        if ($status) {
            $where .= ' AND status = %s';
            $params[] = $status;
        }
        
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->assignments} 
                 WHERE $where 
                 ORDER BY due_date ASC",
                $params
            )
        );
    }

    /**
     * Lista assegnazioni per studente
     */
    public function get_student_assignments($student_id) {
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT a.*, c.name as class_name
                 FROM {$this->assignments} a
                 INNER JOIN {$this->classes} c ON a.class_id = c.id
                 INNER JOIN {$this->class_students} cs ON c.id = cs.class_id
                 WHERE cs.student_id = %d AND cs.status = 'active' AND a.status = 'published'
                 ORDER BY a.due_date ASC",
                $student_id
            )
        );
    }

    /**
     * Aggiorna assegnazione
     */
    public function update_assignment($id, $data) {
        $data['updated_at'] = current_time('mysql');
        
        if (isset($data['title'])) {
            $data['title'] = sanitize_text_field($data['title']);
        }
        if (isset($data['instructions'])) {
            $data['instructions'] = wp_kses_post($data['instructions']);
        }
        
        return $this->db->update($this->assignments, $data, ['id' => $id]) !== false;
    }

    /**
     * Pubblica assegnazione
     */
    public function publish_assignment($id) {
        return $this->update_assignment($id, [
            'status'       => 'published',
            'published_at' => current_time('mysql')
        ]);
    }

    /**
     * Chiude assegnazione
     */
    public function close_assignment($id) {
        return $this->update_assignment($id, [
            'status'    => 'closed',
            'closed_at' => current_time('mysql')
        ]);
    }

    /**
     * Ottiene submissions per assegnazione
     */
    public function get_assignment_submissions($assignment_id) {
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT p.*, u.display_name as student_name
                 FROM {$this->projects} p
                 INNER JOIN {$this->db->users} u ON p.user_id = u.ID
                 WHERE p.assignment_id = %d AND p.type = 'submission'
                 ORDER BY u.display_name ASC",
                $assignment_id
            )
        );
    }

    /**
     * Conta submissions per assegnazione
     */
    public function count_assignment_submissions($assignment_id, $status = null) {
        $where = 'assignment_id = %d AND type = %s';
        $params = [$assignment_id, 'submission'];
        
        if ($status) {
            $where .= ' AND status = %s';
            $params[] = $status;
        }
        
        return (int) $this->db->get_var(
            $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->projects} WHERE $where",
                $params
            )
        );
    }

    /**
     * Ottiene submission di uno studente per assegnazione
     */
    public function get_student_submission($assignment_id, $student_id) {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->projects} 
                 WHERE assignment_id = %d AND user_id = %d AND type = 'submission'",
                $assignment_id,
                $student_id
            )
        );
    }

    // =========================================================================
    // ACTIVITY LOG
    // =========================================================================

    /**
     * Registra attività
     */
    public function log_activity($user_id, $project_id, $action, $details = null) {
        return $this->db->insert(
            $this->activity_log,
            [
                'user_id'    => $user_id,
                'project_id' => $project_id,
                'action'     => $action,
                'details'    => $details ? wp_json_encode($details) : null,
                'ip_address' => $this->get_client_ip(),
                'user_agent' => isset($_SERVER['HTTP_USER_AGENT']) 
                    ? sanitize_text_field($_SERVER['HTTP_USER_AGENT']) 
                    : null,
                'created_at' => current_time('mysql')
            ]
        );
    }

    /**
     * Ottiene IP client
     */
    private function get_client_ip() {
        $ip_keys = ['HTTP_X_FORWARDED_FOR', 'HTTP_CLIENT_IP', 'REMOTE_ADDR'];
        
        foreach ($ip_keys as $key) {
            if (!empty($_SERVER[$key])) {
                $ip = sanitize_text_field($_SERVER[$key]);
                // Prendi solo il primo IP se ce ne sono multipli
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        
        return '0.0.0.0';
    }

    /**
     * Ottiene log attività per progetto
     */
    public function get_project_activity($project_id, $limit = 50) {
        return $this->db->get_results(
            $this->db->prepare(
                "SELECT l.*, u.display_name 
                 FROM {$this->activity_log} l
                 INNER JOIN {$this->db->users} u ON l.user_id = u.ID
                 WHERE l.project_id = %d
                 ORDER BY l.created_at DESC
                 LIMIT %d",
                $project_id,
                $limit
            )
        );
    }

    /**
     * Pulisce log vecchi
     */
    public function cleanup_old_logs($days = 90) {
        return $this->db->query(
            $this->db->prepare(
                "DELETE FROM {$this->activity_log} 
                 WHERE created_at < DATE_SUB(NOW(), INTERVAL %d DAY)",
                $days
            )
        );
    }
}
