/**
 * Servicio de autocompletado y geocoding de lugares via Photon.
 *
 * Photon (https://photon.komoot.io/) es un proxy publico sobre OpenStreetMap.
 * No requiere API key, soporta CORS abierto, uso libre documentado.
 *
 * Las sugerencias de delivery se sesgan hacia el local, se limitan al radio
 * de cobertura (`maxKm`) y al mismo pais (y estado cuando se conoce).
 */

import { haversineKm, isValidLatLng } from '@/lib/geo';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';

/** Bbox aproximado (minLon,minLat,maxLon,maxLat) por region soportada. */
const REGION_BBOX = {
	cl: '-75.8,-56.5,-65.2,-17.0',
	ve: '-73.6,0.4,-59.4,12.6',
};

const REGION_COUNTRYCODE = {
	cl: 'CL',
	ve: 'VE',
};

const MIN_LEN = 2;
const MAX_Q = 96;
const MAX_RESULTS = 10;
/** Radio de búsqueda por defecto cerca del local si no hay maxDeliveryKm. */
const DEFAULT_NEARBY_KM = 40;
/** Holgura al filtrar por radio (geometría vs calle). */
const RADIUS_SLACK_KM = 0.75;

/**
 * @param {unknown} raw
 * @returns {'cl' | 've'}
 */
function normalizeRegion(raw) {
	const u = String(raw ?? 'cl').trim().toLowerCase();
	if (u === 've' || u === 'venezuela') return 've';
	return 'cl';
}

function normalizePlaceToken(raw) {
	return String(raw ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

/**
 * Filtra features de Photon por pais. Acepta countrycode ISO o country textual.
 * @param {'cl' | 've'} region
 * @param {Record<string, unknown>} p
 */
function matchesRegion(region, p) {
	const cc = String(p.countrycode ?? '').trim().toUpperCase();
	if (region === 'cl') {
		if (cc === 'CL') return true;
		const c = String(p.country ?? '').trim().toLowerCase();
		return c.includes('chile');
	}
	if (cc === 'VE') return true;
	const c = String(p.country ?? '').trim().toLowerCase();
	return c.includes('venezuela');
}

/**
 * ¿El resultado cae en el mismo estado/región administrativa del local?
 * Si no hay estado preferido, no filtra.
 * @param {string} preferredState
 * @param {Record<string, unknown>} p
 */
function matchesPreferredState(preferredState, p) {
	const wanted = normalizePlaceToken(preferredState);
	if (!wanted) return true;
	const candidates = [p.state, p.county, p.city, p.district]
		.map(normalizePlaceToken)
		.filter(Boolean);
	return candidates.some(
		(c) => c === wanted || c.includes(wanted) || wanted.includes(c),
	);
}

/**
 * Construye un label legible a partir de las propiedades de Photon.
 * Prioriza calle + número cuando existen (útil para direcciones de entrega).
 * @param {Record<string, unknown>} p
 * @returns {string}
 */
function labelFromProps(p) {
	const street = String(p.street ?? '').trim();
	const housenumber = String(p.housenumber ?? '').trim();
	const name = String(p.name ?? '').trim();
	const city = String(p.city ?? p.district ?? p.locality ?? '').trim();
	const state = String(p.state ?? p.county ?? '').trim();

	let primary = '';
	if (street) {
		const streetLine = [housenumber, street].filter(Boolean).join(' ').trim();
		primary =
			name && name.toLowerCase() !== street.toLowerCase()
				? `${name}, ${streetLine}`
				: streetLine;
	} else {
		primary = name || city || state;
	}
	if (!primary) return '';

	const parts = [primary];
	const lowerPrimary = primary.toLowerCase();
	if (city && !lowerPrimary.includes(city.toLowerCase())) parts.push(city);
	if (state && !parts.some((part) => part.toLowerCase().includes(state.toLowerCase()))) {
		parts.push(state);
	}
	return parts.join(', ').slice(0, 160);
}

/**
 * Bbox alrededor de un punto (km → grados aproximados).
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {string} minLon,minLat,maxLon,maxLat
 */
function bboxAround(lat, lng, radiusKm) {
	const safeKm = Math.max(1, Number(radiusKm) || DEFAULT_NEARBY_KM);
	const dLat = safeKm / 111;
	const cos = Math.cos((lat * Math.PI) / 180);
	const dLng = safeKm / (111 * Math.max(0.2, Math.abs(cos)));
	const minLon = Math.max(-180, lng - dLng);
	const maxLon = Math.min(180, lng + dLng);
	const minLat = Math.max(-90, lat - dLat);
	const maxLat = Math.min(90, lat + dLat);
	return `${minLon.toFixed(5)},${minLat.toFixed(5)},${maxLon.toFixed(5)},${maxLat.toFixed(5)}`;
}

function zoomForRadiusKm(radiusKm) {
	const km = Number(radiusKm);
	if (!Number.isFinite(km) || km <= 0) return 12;
	if (km <= 5) return 14;
	if (km <= 12) return 13;
	if (km <= 25) return 12;
	if (km <= 50) return 11;
	return 10;
}

/**
 * Resuelve estado/ciudad del local por reverse geocode (cacheable en UI).
 * @param {object} args
 * @param {number} args.lat
 * @param {number} args.lng
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ state: string, city: string, countryCode: string, label: string } | null>}
 */
export async function reverseGeocodeLocality({ lat, lng, signal } = {}) {
	if (!isValidLatLng(lat, lng)) return null;
	const url = new URL(PHOTON_REVERSE_URL);
	url.searchParams.set('lat', String(lat));
	url.searchParams.set('lon', String(lng));
	url.searchParams.set('lang', 'default');
	url.searchParams.set('limit', '1');

	const res = await fetch(url.toString(), {
		signal,
		cache: 'no-store',
		headers: { Accept: 'application/json' },
	});
	if (!res.ok) return null;
	const data = await res.json().catch(() => ({}));
	const feat = Array.isArray(data?.features) ? data.features[0] : null;
	const p = feat?.properties && typeof feat.properties === 'object' ? feat.properties : null;
	if (!p) return null;
	return {
		state: String(p.state ?? p.county ?? '').trim(),
		city: String(p.city ?? p.district ?? p.locality ?? '').trim(),
		countryCode: String(p.countrycode ?? '').trim().toUpperCase(),
		label: labelFromProps(p),
	};
}

/**
 * Busca sugerencias de lugares cerca del local.
 *
 * @param {object} args
 * @param {string} args.q
 * @param {string} [args.region='cl']
 * @param {number} [args.lat] - latitud del local
 * @param {number} [args.lng] - longitud del local
 * @param {number} [args.maxKm] - radio máximo de delivery
 * @param {string} [args.state] - estado/región preferido del local
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<{ label: string, lat?: number, lng?: number, km?: number, state?: string }[]>}
 */
export async function searchPlaces({
	q,
	region,
	lat,
	lng,
	maxKm,
	state,
	signal,
} = {}) {
	const trimmed = String(q ?? '').trim();
	if (trimmed.length < MIN_LEN) return [];
	if (trimmed.length > MAX_Q) return [];

	const reg = normalizeRegion(region);
	const originOk = isValidLatLng(lat, lng);
	const radiusKmRaw = Number(maxKm);
	const radiusKm =
		Number.isFinite(radiusKmRaw) && radiusKmRaw > 0
			? radiusKmRaw
			: originOk
				? DEFAULT_NEARBY_KM
				: null;

	const url = new URL(PHOTON_URL);
	url.searchParams.set('q', trimmed);
	url.searchParams.set('lang', 'default');
	url.searchParams.set('limit', '24');
	url.searchParams.set('countrycode', REGION_COUNTRYCODE[reg]);

	if (originOk && radiusKm != null) {
		url.searchParams.set('lat', String(lat));
		url.searchParams.set('lon', String(lng));
		url.searchParams.set('location_bias_scale', '0.15');
		url.searchParams.set('zoom', String(zoomForRadiusKm(radiusKm)));
		url.searchParams.set('bbox', bboxAround(Number(lat), Number(lng), radiusKm + RADIUS_SLACK_KM));
	} else {
		url.searchParams.set('bbox', REGION_BBOX[reg]);
	}

	const res = await fetch(url.toString(), {
		signal,
		cache: 'no-store',
		headers: { Accept: 'application/json' },
	});
	if (!res.ok) {
		throw new Error('Servicio de mapas no disponible');
	}

	const data = await res.json().catch(() => ({}));
	const features = Array.isArray(data?.features) ? data.features : [];
	const preferredState = String(state ?? '').trim();

	/** @type {{ label: string, lat?: number, lng?: number, km?: number, state?: string, sameState: boolean }[]} */
	const scored = [];
	const seen = new Set();

	for (const f of features) {
		const p = f?.properties;
		if (!p || !matchesRegion(reg, p)) continue;

		const label = labelFromProps(p);
		if (!label) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : null;
		const lngVal = coords != null ? Number(coords[0]) : NaN;
		const latVal = coords != null ? Number(coords[1]) : NaN;
		const hasCoords = Number.isFinite(latVal) && Number.isFinite(lngVal);

		let km;
		if (originOk && hasCoords) {
			km = haversineKm(
				{ lat: Number(lat), lng: Number(lng) },
				{ lat: latVal, lng: lngVal },
			);
			if (radiusKm != null && Number.isFinite(km) && km > radiusKm + RADIUS_SLACK_KM) {
				continue;
			}
		} else if (originOk && radiusKm != null) {
			// Sin coords no podemos garantizar cobertura: descartar.
			continue;
		}

		const placeState = String(p.state ?? p.county ?? '').trim();
		scored.push({
			label,
			...(hasCoords ? { lat: latVal, lng: lngVal } : {}),
			...(Number.isFinite(km) ? { km: Math.round(km * 100) / 100 } : {}),
			...(placeState ? { state: placeState } : {}),
			sameState: matchesPreferredState(preferredState, p),
		});
	}

	const withState = preferredState
		? scored.filter((item) => item.sameState)
		: scored;
	const pool = withState.length > 0 ? withState : scored;

	pool.sort((a, b) => {
		if (a.sameState !== b.sameState) return a.sameState ? -1 : 1;
		const ka = Number.isFinite(a.km) ? a.km : Number.POSITIVE_INFINITY;
		const kb = Number.isFinite(b.km) ? b.km : Number.POSITIVE_INFINITY;
		if (ka !== kb) return ka - kb;
		return a.label.localeCompare(b.label, 'es');
	});

	return pool.slice(0, MAX_RESULTS).map(({ sameState: _sameState, ...item }) => item);
}

const MIN_GEOCODE_LEN = 8;
const MAX_GEOCODE_Q = 200;

/**
 * Geocodifica una direccion en texto a coordenadas WGS84 para autocalcular
 * distancia (modo `distance` del delivery). Codigos de error consistentes con
 * `geocodeService.js` (`short_address`, `geocode_failed`).
 *
 * @param {object} args
 * @param {string} args.address
 * @param {string} [args.region='cl']
 * @param {number} [args.lat] - latitud del local (bias)
 * @param {number} [args.lng] - longitud del local (bias)
 * @param {number} [args.maxKm]
 * @param {string} [args.state]
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<
 *   | { ok: true, lat: number, lng: number, label: string, km?: number }
 *   | { ok: false, code: 'short_address'|'geocode_failed'|'out_of_range', message: string }
 * >}
 */
export async function geocodeToCoords({
	address,
	region,
	lat,
	lng,
	maxKm,
	state,
	signal,
} = {}) {
	const trimmed = String(address ?? '').trim();
	if (trimmed.length < MIN_GEOCODE_LEN) {
		return {
			ok: false,
			code: 'short_address',
			message: 'Escribe una direccion mas completa para calcular la distancia.',
		};
	}
	if (trimmed.length > MAX_GEOCODE_Q) {
		return {
			ok: false,
			code: 'short_address',
			message: 'La direccion es demasiado larga.',
		};
	}

	const suggestions = await searchPlaces({
		q: trimmed,
		region,
		lat,
		lng,
		maxKm,
		state,
		signal,
	});
	const best = suggestions.find((s) => isValidLatLng(s.lat, s.lng));
	if (!best) {
		const radius = Number(maxKm);
		return {
			ok: false,
			code: Number.isFinite(radius) && radius > 0 ? 'out_of_range' : 'geocode_failed',
			message: Number.isFinite(radius) && radius > 0
				? `No encontramos esa direccion dentro del radio de delivery (${radius} km).`
				: 'No pudimos ubicar esa direccion. Revisa e intenta de nuevo.',
		};
	}

	return {
		ok: true,
		lat: Number(best.lat),
		lng: Number(best.lng),
		label: best.label || trimmed,
		...(Number.isFinite(best.km) ? { km: best.km } : {}),
	};
}
