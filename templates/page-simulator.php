<?php
/**
 * Template Name: Simulatore
 * Template Post Type: page
 */
get_header();
?>

<div class="simulator-fullwidth">
    <?php 
    if (function_exists('picsim_edu_is_plugin_active') && picsim_edu_is_plugin_active()) {
        echo do_shortcode('[pic_simulator fullwidth="yes" height="calc(100vh - 70px)"]');
    } else {
        ?>
        <div class="login-required" style="min-height: calc(100vh - 70px);">
            <div style="text-align: center; padding: 2rem;">
                <?php echo picsim_edu_icon('cpu', 64); ?>
                <h2 style="margin-top: 1rem;">Plugin Non Attivo</h2>
                <p class="text-muted">Il plugin WebPicSimulator deve essere installato e attivato per utilizzare il simulatore.</p>
                <?php if (current_user_can('activate_plugins')) : ?>
                    <a href="<?php echo admin_url('plugins.php'); ?>" class="btn btn--primary" style="margin-top: 1rem;">Vai ai Plugin</a>
                <?php endif; ?>
            </div>
        </div>
        <?php
    }
    ?>
</div>

<?php get_footer(); ?>
