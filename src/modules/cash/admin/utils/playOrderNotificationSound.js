/**
 * Sonido al recibir un pedido nuevo (realtime): una campanita de un solo toque,
 * corta y fuerte, sintetizada con Web Audio API (sin archivo que descargar).
 */

/** Frecuencia fundamental del "ding" (Mi6: brillante pero no chillón). */
const BELL_FREQ = 1318.5;
/** Parciales de campana: [multiplicador de frecuencia, ganancia relativa, duración s]. */
const BELL_PARTIALS = [
	[1, 1, 0.7],
	[2.76, 0.18, 0.35],
	[5.4, 0.06, 0.18],
];
/* Tiene que oírse sobre el ruido de un local. Los tres parciales suman 1,24 en
   el golpe inicial: 0,8 lo deja en ~0,99, justo bajo el recorte digital. */
const BELL_VOLUME = 0.8;

/** @type {AudioContext | null} */
let sharedCtx = null;

function getAudioContext() {
	if (typeof window === 'undefined') return null;
	if (sharedCtx) return sharedCtx;
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return null;
	try {
		sharedCtx = new AC();
	} catch {
		sharedCtx = null;
	}
	return sharedCtx;
}

/** @param {AudioContext} ctx */
function playBell(ctx) {
	const now = ctx.currentTime;
	const master = ctx.createGain();
	master.gain.value = BELL_VOLUME;
	master.connect(ctx.destination);

	BELL_PARTIALS.forEach(([ratio, gain, duration]) => {
		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = BELL_FREQ * ratio;

		const env = ctx.createGain();
		env.gain.setValueAtTime(0.0001, now);
		env.gain.exponentialRampToValueAtTime(gain, now + 0.005);
		env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

		osc.connect(env);
		env.connect(master);
		osc.start(now);
		osc.stop(now + duration + 0.05);
	});
}

/**
 * Reproduce el aviso sonoro (no bloquea). Seguro de llamar solo en el cliente.
 */
export function playOrderNotificationSound() {
	const ctx = getAudioContext();
	if (!ctx) return;
	try {
		if (ctx.state === 'suspended') {
			ctx.resume().then(() => playBell(ctx)).catch(() => {});
			return;
		}
		playBell(ctx);
	} catch {
		/* ignore */
	}
}

/** Primera interacción en el panel: desbloquea audio para que suene con pedidos en tiempo real. */
export function primeOrderNotificationAudio() {
	const ctx = getAudioContext();
	if (!ctx || ctx.state !== 'suspended') return;
	ctx.resume().catch(() => {});
}
