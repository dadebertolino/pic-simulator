<?php
/**
 * Plugin Activator
 * 
 * Gestisce l'attivazione del plugin: creazione tabelle DB, ruoli, capabilities.
 *
 * @package    PicSim
 * @subpackage PicSim/includes
 */

namespace PicSim;

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

class Activator {

    /**
     * Versione dello schema database
     */
    const DB_VERSION = '1.0.0';

    /**
     * Eseguito all'attivazione del plugin
     */
    public static function activate() {
        self::create_tables();
        self::add_capabilities();
        self::create_default_options();
        
        // Salva versione DB
        update_option('picsim_db_version', self::DB_VERSION);
        
        // Flush rewrite rules per REST API
        flush_rewrite_rules();
    }

    /**
     * Crea tutte le tabelle del plugin
     */
    private static function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');

        // Tabella progetti
        self::create_projects_table($charset_collate);
        
        // Tabella files
        self::create_files_table($charset_collate);
        
        // Tabella classi
        self::create_classes_table($charset_collate);
        
        // Tabella studenti-classi
        self::create_class_students_table($charset_collate);
        
        // Tabella assegnazioni
        self::create_assignments_table($charset_collate);
        
        // Tabella log attivitÃ 
        self::create_activity_log_table($charset_collate);
    }

    /**
     * Tabella: picsim_projects
     * 
     * Contiene tutti i progetti: personali, template, assegnazioni, submissions
     */
    private static function create_projects_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_projects';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id bigint(20) UNSIGNED NOT NULL,
            name varchar(255) NOT NULL,
            description text,
            device varchar(50) NOT NULL,
            clock int(10) UNSIGNED NOT NULL DEFAULT 4000000,
            
            type enum('personal','template','assignment','submission') NOT NULL DEFAULT 'personal',
            
            parent_id bigint(20) UNSIGNED DEFAULT NULL,
            class_id bigint(20) UNSIGNED DEFAULT NULL,
            assignment_id bigint(20) UNSIGNED DEFAULT NULL,
            
            status enum('draft','active','submitted','graded') NOT NULL DEFAULT 'draft',
            
            grade decimal(4,2) DEFAULT NULL,
            grade_max decimal(4,2) DEFAULT 10.00,
            teacher_notes text,
            
            due_date datetime DEFAULT NULL,
            submitted_at datetime DEFAULT NULL,
            locked tinyint(1) NOT NULL DEFAULT 0,
            locked_at datetime DEFAULT NULL,
            locked_by bigint(20) UNSIGNED DEFAULT NULL,
            
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            PRIMARY KEY (id),
            KEY idx_user_id (user_id),
            KEY idx_type (type),
            KEY idx_class_id (class_id),
            KEY idx_assignment_id (assignment_id),
            KEY idx_status (status),
            KEY idx_user_type_updated (user_id, type, updated_at)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Tabella: picsim_files
     * 
     * File sorgente appartenenti ai progetti
     */
    private static function create_files_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_files';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            project_id bigint(20) UNSIGNED NOT NULL,
            filename varchar(255) NOT NULL,
            type enum('asm','inc','txt','hex') NOT NULL DEFAULT 'asm',
            content longtext,
            
            is_main tinyint(1) NOT NULL DEFAULT 0,
            is_readonly tinyint(1) NOT NULL DEFAULT 0,
            is_provided tinyint(1) NOT NULL DEFAULT 0,
            
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            PRIMARY KEY (id),
            UNIQUE KEY idx_project_filename (project_id, filename),
            KEY idx_type (type),
            KEY idx_is_main (is_main)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Tabella: picsim_classes
     * 
     * Classi gestite dai docenti
     */
    private static function create_classes_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_classes';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            teacher_id bigint(20) UNSIGNED NOT NULL,
            name varchar(255) NOT NULL,
            description text,
            year varchar(20) DEFAULT NULL,
            section varchar(50) DEFAULT NULL,
            
            join_code varchar(20) DEFAULT NULL,
            join_enabled tinyint(1) NOT NULL DEFAULT 1,
            
            is_active tinyint(1) NOT NULL DEFAULT 1,
            archived_at datetime DEFAULT NULL,
            
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            PRIMARY KEY (id),
            UNIQUE KEY idx_join_code (join_code),
            KEY idx_teacher_id (teacher_id),
            KEY idx_year (year),
            KEY idx_is_active (is_active)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Tabella: picsim_class_students
     * 
     * Relazione molti-a-molti tra classi e studenti
     */
    private static function create_class_students_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_class_students';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            class_id bigint(20) UNSIGNED NOT NULL,
            student_id bigint(20) UNSIGNED NOT NULL,
            
            status enum('active','suspended','removed') NOT NULL DEFAULT 'active',
            
            joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            removed_at datetime DEFAULT NULL,
            
            PRIMARY KEY (id),
            UNIQUE KEY idx_class_student (class_id, student_id),
            KEY idx_student_id (student_id),
            KEY idx_status (status)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Tabella: picsim_assignments
     * 
     * Assegnazioni create dai docenti per le classi
     */
    private static function create_assignments_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_assignments';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            class_id bigint(20) UNSIGNED NOT NULL,
            template_id bigint(20) UNSIGNED NOT NULL,
            
            title varchar(255) NOT NULL,
            instructions text,
            
            due_date datetime NOT NULL,
            allow_late tinyint(1) NOT NULL DEFAULT 0,
            late_penalty decimal(4,2) DEFAULT 0.00,
            
            auto_lock tinyint(1) NOT NULL DEFAULT 1,
            show_solution_after tinyint(1) NOT NULL DEFAULT 0,
            solution_id bigint(20) UNSIGNED DEFAULT NULL,
            
            status enum('draft','published','closed','archived') NOT NULL DEFAULT 'draft',
            published_at datetime DEFAULT NULL,
            closed_at datetime DEFAULT NULL,
            
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            PRIMARY KEY (id),
            KEY idx_class_id (class_id),
            KEY idx_template_id (template_id),
            KEY idx_status (status),
            KEY idx_due_date (due_date),
            KEY idx_class_status_due (class_id, status, due_date)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Tabella: picsim_activity_log
     * 
     * Log attivitÃ  per audit e statistiche
     */
    private static function create_activity_log_table($charset_collate) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'picsim_activity_log';
        
        $sql = "CREATE TABLE $table_name (
            id bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id bigint(20) UNSIGNED NOT NULL,
            project_id bigint(20) UNSIGNED DEFAULT NULL,
            
            action varchar(50) NOT NULL,
            details longtext,
            
            ip_address varchar(45) DEFAULT NULL,
            user_agent varchar(255) DEFAULT NULL,
            
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            
            PRIMARY KEY (id),
            KEY idx_user_id (user_id),
            KEY idx_project_id (project_id),
            KEY idx_action (action),
            KEY idx_created_at (created_at)
        ) $charset_collate;";
        
        dbDelta($sql);
    }

    /**
     * Aggiunge capabilities ai ruoli WordPress
     */
    private static function add_capabilities() {
        // Ruoli che possono gestire classi (docenti)
        $teacher_roles = ['administrator', 'editor', 'author'];
        
        foreach ($teacher_roles as $role_name) {
            $role = get_role($role_name);
            if ($role) {
                $role->add_cap('picsim_manage_classes');
                $role->add_cap('picsim_create_assignments');
                $role->add_cap('picsim_grade_submissions');
                $role->add_cap('picsim_view_class_projects');
            }
        }
        
        // Admin ha tutto
        $admin = get_role('administrator');
        if ($admin) {
            $admin->add_cap('picsim_manage_all');
        }
    }

    /**
     * Crea opzioni di default del plugin
     */
    private static function create_default_options() {
        // Opzioni generali
        add_option('picsim_default_device', 'PIC16F84A');
        add_option('picsim_default_clock', 4000000);
        add_option('picsim_max_files_per_project', 10);
        add_option('picsim_max_file_size', 65536); // 64KB
        add_option('picsim_autosave_interval', 60); // secondi
        
        // Opzioni didattiche
        add_option('picsim_enable_classes', true);
        add_option('picsim_enable_assignments', true);
        add_option('picsim_join_code_length', 6);
    }

    /**
     * Verifica se le tabelle esistono
     */
    public static function tables_exist() {
        global $wpdb;
        
        $tables = [
            $wpdb->prefix . 'picsim_projects',
            $wpdb->prefix . 'picsim_files',
            $wpdb->prefix . 'picsim_classes',
            $wpdb->prefix . 'picsim_class_students',
            $wpdb->prefix . 'picsim_assignments',
            $wpdb->prefix . 'picsim_activity_log'
        ];
        
        foreach ($tables as $table) {
            if ($wpdb->get_var("SHOW TABLES LIKE '$table'") !== $table) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Ottiene la versione corrente dello schema
     */
    public static function get_db_version() {
        return get_option('picsim_db_version', '0.0.0');
    }

    /**
     * Verifica se serve aggiornamento DB
     */
    public static function needs_upgrade() {
        return version_compare(self::get_db_version(), self::DB_VERSION, '<');
    }
}
