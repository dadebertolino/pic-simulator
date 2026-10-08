<?php
/**
 * Template Name: Dashboard
 * Template Post Type: page
 */

if (!is_user_logged_in()) {
    wp_redirect(wp_login_url(get_permalink()));
    exit;
}

get_header();
$user = picsim_edu_get_user_info();
$menu = picsim_edu_get_dashboard_menu();
?>

<div class="dashboard-layout">
    <aside class="dashboard-sidebar">
        <nav>
            <ul class="sidebar-nav">
                <?php foreach ($menu as $item) : ?>
                    <?php if (!empty($item['section'])) : ?>
                        <li class="sidebar-nav-section"><?php echo esc_html($item['title']); ?></li>
                    <?php else : ?>
                        <li class="sidebar-nav-item">
                            <a href="<?php echo esc_url($item['url']); ?>" class="sidebar-nav-link<?php echo (get_permalink() === $item['url']) ? ' active' : ''; ?>">
                                <?php echo picsim_edu_icon($item['icon'], 20); ?>
                                <span><?php echo esc_html($item['title']); ?></span>
                            </a>
                        </li>
                    <?php endif; ?>
                <?php endforeach; ?>
            </ul>
        </nav>
    </aside>
    
    <div class="dashboard-content">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <div>
                <h1 style="margin: 0;">Ciao, <?php echo esc_html($user['name']); ?>!</h1>
                <p class="text-muted" style="margin: 0.5rem 0 0;">Benvenuto nella tua dashboard</p>
            </div>
            <a href="<?php echo esc_url(home_url('/simulator/')); ?>" class="btn btn--primary">
                <?php echo picsim_edu_icon('plus', 18); ?> Nuovo Progetto
            </a>
        </div>
        
        <!-- Stats Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="card">
                <div class="card-body" style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 48px; height: 48px; background: var(--primary-50); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--primary);">
                        <?php echo picsim_edu_icon('folder', 24); ?>
                    </div>
                    <div>
                        <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Progetti</p>
                        <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">--</p>
                    </div>
                </div>
            </div>
            
            <?php if ($user['is_teacher']) : ?>
                <div class="card">
                    <div class="card-body" style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; background: #dcfce7; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: #166534;">
                            <?php echo picsim_edu_icon('users', 24); ?>
                        </div>
                        <div>
                            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Classi</p>
                            <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">--</p>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-body" style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; background: #fef3c7; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: #92400e;">
                            <?php echo picsim_edu_icon('clipboard', 24); ?>
                        </div>
                        <div>
                            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Da Valutare</p>
                            <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">--</p>
                        </div>
                    </div>
                </div>
            <?php else : ?>
                <div class="card">
                    <div class="card-body" style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; background: #dcfce7; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: #166534;">
                            <?php echo picsim_edu_icon('book', 24); ?>
                        </div>
                        <div>
                            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">Classi Iscritto</p>
                            <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">--</p>
                        </div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-body" style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; background: #fef3c7; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: #92400e;">
                            <?php echo picsim_edu_icon('clock', 24); ?>
                        </div>
                        <div>
                            <p class="text-muted" style="margin: 0; font-size: 0.875rem;">In Scadenza</p>
                            <p style="margin: 0; font-size: 1.5rem; font-weight: 600;">--</p>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </div>
        
        <!-- Recent Projects -->
        <div class="card">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">Progetti Recenti</h2>
                <a href="<?php echo esc_url(home_url('/dashboard/projects/')); ?>" class="btn btn--secondary btn--sm">Vedi tutti</a>
            </div>
            <div class="card-body">
                <?php if (picsim_edu_is_plugin_active()) : ?>
                    <div id="recent-projects-list">
                        <p class="text-muted text-center">Caricamento progetti...</p>
                    </div>
                <?php else : ?>
                    <p class="text-muted text-center">Plugin WebPicSimulator non attivo.</p>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php get_footer(); ?>
