/**
 * Geo helpers para delivery (port literal de `panel-viejo/lib/geo.ts`).
 *
 * - `haversineKm`: distancia en km entre dos puntos WGS84.
 * - `isValidLatLng`: validacion de coords numericas dentro del rango terrestre.
 * - `buildGoogleMapsDirectionsUrl`: link de navegacion para el delivery.
 *
 * Todo client-side: Photon devuelve coords en `feature.geometry.coordinates`
 * y `branchSettingsService` devuelve `originLat/originLng` desde RLS, asi que
 * no hace falta server-side para autocalcular la distancia del pedido.
 */

const EARTH_RADIUS_KM = 6371;

export type GeoPoint = { lat: number; lng: number };

/** Bbox aproximado por pais soportado (minLat, maxLat, minLng, maxLng). */
const COUNTRY_BOUNDS = {
	ve: { minLat: 0.4, maxLat: 12.6, minLng: -73.6, maxLng: -59.4 },
	cl: { minLat: -56.5, maxLat: -17.0, minLng: -75.8, maxLng: -65.2 },
} as const;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function normalizeCountryKey(country: unknown): "ve" | "cl" | null {
	const c = String(country ?? "")
		.trim()
		.toLowerCase();
	if (c === "ve" || c === "ven" || c === "venezuela") return "ve";
	if (c === "cl" || c === "chile") return "cl";
	return null;
}

function inBounds(
	lat: number,
	lng: number,
	bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
	return (
		lat >= bounds.minLat &&
		lat <= bounds.maxLat &&
		lng >= bounds.minLng &&
		lng <= bounds.maxLng
	);
}

/** Distancia en km entre dos puntos WGS84 (formula haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const sinDLat = Math.sin(dLat / 2);
	const sinDLng = Math.sin(dLng / 2);
	const h =
		sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
	const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
	return Math.round(EARTH_RADIUS_KM * c * 1000) / 1000;
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
	const la = Number(lat);
	const ln = Number(lng);
	return (
		Number.isFinite(la) &&
		Number.isFinite(ln) &&
		la >= -90 &&
		la <= 90 &&
		ln >= -180 &&
		ln <= 180 &&
		// (0,0) casi nunca es un local real; suele ser default/no configurado.
		!(Math.abs(la) < 1e-9 && Math.abs(ln) < 1e-9)
	);
}

/**
 * Normaliza lat/lng del local según el pais de la sucursal.
 * Corrige el error frecuente de longitud positiva en VE/CL (hemisferio oeste).
 */
export function normalizeBranchOrigin(
	lat: unknown,
	lng: unknown,
	country?: unknown,
): {
	lat: number | null;
	lng: number | null;
	fixed: boolean;
	warning: string | null;
} {
	const la = Number(lat);
	const ln = Number(lng);
	if (!Number.isFinite(la) || !Number.isFinite(ln)) {
		return { lat: null, lng: null, fixed: false, warning: null };
	}
	if (Math.abs(la) < 1e-9 && Math.abs(ln) < 1e-9) {
		return {
			lat: null,
			lng: null,
			fixed: false,
			warning: "Configura la ubicacion real del local (lat/lng).",
		};
	}
	if (la < -90 || la > 90 || ln < -180 || ln > 180) {
		return {
			lat: null,
			lng: null,
			fixed: false,
			warning: "Las coordenadas del local no son validas.",
		};
	}

	const key = normalizeCountryKey(country);
	if (!key) {
		return { lat: la, lng: ln, fixed: false, warning: null };
	}

	const bounds = COUNTRY_BOUNDS[key];
	if (inBounds(la, ln, bounds)) {
		return { lat: la, lng: ln, fixed: false, warning: null };
	}

	// Longitud con signo invertido (ej. 63.89 en vez de -63.89 en Venezuela).
	if (inBounds(la, -ln, bounds)) {
		return {
			lat: la,
			lng: -ln,
			fixed: true,
			warning:
				key === "ve"
					? "La longitud en Venezuela debe ser negativa (oeste). Se corrigio el signo."
					: "La longitud en Chile debe ser negativa (oeste). Se corrigio el signo.",
		};
	}

	// Lat/lng intercambiados.
	if (inBounds(ln, la, bounds)) {
		return {
			lat: ln,
			lng: la,
			fixed: true,
			warning: "Latitud y longitud parecian intercambiadas. Se reordenaron.",
		};
	}
	if (inBounds(ln, -la, bounds)) {
		return {
			lat: ln,
			lng: -la,
			fixed: true,
			warning: "Se corrigieron lat/lng (orden y/o signo) para el pais de la sucursal.",
		};
	}

	return {
		lat: la,
		lng: ln,
		fixed: false,
		warning:
			key === "ve"
				? "Esas coordenadas no caen en Venezuela. Revisa lat/lng (longitud VE ≈ -63 a -73)."
				: "Esas coordenadas no caen en Chile. Revisa lat/lng (longitud CL ≈ -66 a -75).",
	};
}

/** Enlace para abrir navegacion hacia el punto de entrega. */
export function buildGoogleMapsDirectionsUrl(lat: number, lng: number): string {
	return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}
