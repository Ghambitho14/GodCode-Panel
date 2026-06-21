/** Max viewport width (px) for admin mobile/tablet shell layout. */
export const ADMIN_MOBILE_MAX = 1024;

/** Media query string for admin mobile/tablet layout. */
export const ADMIN_MOBILE_MQ = `(max-width: ${ADMIN_MOBILE_MAX}px)`;

/** Returns true when viewport is within admin mobile/tablet range. */
export function matchAdminMobile() {
	if (typeof window === 'undefined') return false;
	return window.matchMedia(ADMIN_MOBILE_MQ).matches;
}
