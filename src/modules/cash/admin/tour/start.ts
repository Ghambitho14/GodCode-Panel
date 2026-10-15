export const ADMIN_TOUR_EVENT = "gcode:tour";

/** Abre la guía de la pestaña actual (la escucha AdminTour). */
export function startAdminTour() {
	window.dispatchEvent(new Event(ADMIN_TOUR_EVENT));
}
