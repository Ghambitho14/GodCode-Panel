/** Max viewport width (px) for admin phone layout. */
export const ADMIN_MOBILE_MAX = 767;

/** Media query string for admin phone layout. */
export const ADMIN_MOBILE_MQ = `(max-width: ${ADMIN_MOBILE_MAX}px)`;

/** Max viewport width (px) for the compact admin shell (bottom nav bar + stage tabs).
 *  Debe seguir alineado con los bloques `@media (max-width: 1024px)` de
 *  AdminSidebar.css, AdminKanban.css y AdminLayout.css: si JS y CSS se separan,
 *  la franja 768-1024 pinta el shell compacto pero la logica cree que es escritorio. */
export const ADMIN_SHELL_COMPACT_MAX = 1024;

/** Media query string for the compact admin shell. */
export const ADMIN_SHELL_COMPACT_MQ = `(max-width: ${ADMIN_SHELL_COMPACT_MAX}px)`;

/** Viewport range for admin tablet layout (portrait ~768px up to just before desktop). */
export const ADMIN_TABLET_MIN = 768;
export const ADMIN_TABLET_MAX = 1279;

/** Media query string for admin tablet layout. */
export const ADMIN_TABLET_MQ = `(min-width: ${ADMIN_TABLET_MIN}px) and (max-width: ${ADMIN_TABLET_MAX}px)`;
