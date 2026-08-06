/**
 * Duración y rango horario de turnos de caja.
 * Un turno olvidado abierto varios días no debe verse como “1h” con pill “145h”.
 */

/**
 * @param {string|Date|null|undefined} openedAt
 * @param {string|Date|null|undefined} [closedAt] — si falta, usa ahora
 * @returns {number} minutos enteros (>= 0); NaN si fechas inválidas
 */
export function getShiftDurationMinutes(openedAt, closedAt = null) {
	const start = openedAt ? new Date(openedAt).getTime() : NaN;
	const end = closedAt ? new Date(closedAt).getTime() : Date.now();
	if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return NaN;
	return Math.max(0, Math.round((end - start) / 60000));
}

/**
 * @param {number} minutes
 * @returns {string}
 */
export function formatShiftDurationMinutes(minutes) {
	if (!Number.isFinite(minutes) || minutes < 0) return '—';
	const total = Math.round(minutes);
	const days = Math.floor(total / (60 * 24));
	const hours = Math.floor((total % (60 * 24)) / 60);
	const mins = total % 60;

	if (days > 0) {
		if (hours > 0) return `${days}d ${hours}h`;
		if (mins > 0) return `${days}d ${mins}m`;
		return `${days}d`;
	}
	if (hours > 0) {
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}
	return `${mins}m`;
}

/**
 * @param {string|Date|null|undefined} openedAt
 * @param {string|Date|null|undefined} [closedAt]
 * @returns {string}
 */
export function formatShiftDuration(openedAt, closedAt = null) {
	return formatShiftDurationMinutes(getShiftDurationMinutes(openedAt, closedAt));
}

const TIME_OPTS = { hour: '2-digit', minute: '2-digit' };
const DAY_OPTS = { day: '2-digit', month: 'short' };

function sameLocalDay(a, b) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Etiqueta de día de apertura (historial).
 * @param {string|Date} openedAt
 * @returns {string}
 */
export function formatShiftOpenedDay(openedAt) {
	const d = new Date(openedAt);
	if (!Number.isFinite(d.getTime())) return '—';
	return d.toLocaleDateString('es-CL', DAY_OPTS);
}

/**
 * Rango horario; si cruza días, incluye fechas en ambos extremos.
 * @param {string|Date} openedAt
 * @param {string|Date} closedAt
 * @returns {string}
 */
export function formatShiftHoursRange(openedAt, closedAt) {
	const start = new Date(openedAt);
	const end = new Date(closedAt);
	if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '—';

	const startTime = start.toLocaleTimeString('es-CL', TIME_OPTS);
	const endTime = end.toLocaleTimeString('es-CL', TIME_OPTS);

	if (sameLocalDay(start, end)) {
		return `${startTime} → ${endTime}`;
	}

	const startDay = start.toLocaleDateString('es-CL', DAY_OPTS);
	const endDay = end.toLocaleDateString('es-CL', DAY_OPTS);
	return `${startDay} ${startTime} → ${endDay} ${endTime}`;
}
