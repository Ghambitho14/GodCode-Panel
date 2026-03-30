import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../utils/supabase/server";

/** Bbox aproximado (minLon,minLat,maxLon,maxLat) para acotar resultados OSM. */
const REGION_BBOX: Record<string, string> = {
	cl: "-75.8,-56.5,-65.2,-17.0",
	ve: "-73.6,0.4,-59.4,12.6",
};

const PHOTON = "https://photon.komoot.io/api/";
const MAX_Q = 96;
const MIN_LEN = 2;

type PhotonFeature = {
	properties?: {
		name?: string;
		street?: string;
		city?: string;
		district?: string;
		locality?: string;
		state?: string;
		county?: string;
		country?: string;
		/** ISO-3166 alpha-2; Photon lo envía más fiable que `country`. */
		countrycode?: string;
		type?: string;
	};
};

function normalizeCountryHint(raw: string | null): "cl" | "ve" {
	const u = (raw ?? "cl").trim().toLowerCase();
	if (u === "ve" || u === "venezuela") return "ve";
	return "cl";
}

function matchesRegion(
	region: "cl" | "ve",
	p: NonNullable<PhotonFeature["properties"]>,
): boolean {
	const cc = String(p.countrycode ?? "")
		.trim()
		.toUpperCase();
	if (region === "cl") {
		if (cc === "CL") return true;
		const c = String(p.country ?? "")
			.trim()
			.toLowerCase();
		if (c.includes("chile")) return true;
		// Sin país explícito: ya acotamos por bbox; aceptar por si Photon omite campos.
		return !cc && !c;
	}
	if (cc === "VE") return true;
	const c = String(p.country ?? "")
		.trim()
		.toLowerCase();
	if (c.includes("venezuela")) return true;
	return !cc && !c;
}

function labelFromProps(p: NonNullable<PhotonFeature["properties"]>): string {
	const name =
		p.name ||
		p.city ||
		p.district ||
		p.locality ||
		p.county ||
		"";
	if (!name) return "";
	const region = p.state || p.county || "";
	const parts = [name.trim()];
	if (region && !name.toLowerCase().includes(region.toLowerCase())) {
		parts.push(region.trim());
	}
	return parts.join(" · ").slice(0, 120);
}

/**
 * Sugerencias de lugares (comunas, ciudades, barrios) vía Photon sobre OpenStreetMap.
 * Sin API key; solo usuarios con sesión tenant (evita abuso público).
 */
export async function GET(req: NextRequest) {
	try {
		const supabase = await createSupabaseServerClient("tenant");
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: "No autenticado" }, { status: 403 });
		}

		const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
		if (q.length < MIN_LEN) {
			return NextResponse.json({ suggestions: [] });
		}
		if (q.length > MAX_Q) {
			return NextResponse.json({ error: "Búsqueda demasiado larga" }, { status: 400 });
		}

		const region = normalizeCountryHint(req.nextUrl.searchParams.get("region"));
		const bbox = REGION_BBOX[region];
		const latRaw = req.nextUrl.searchParams.get("lat");
		const lngRaw = req.nextUrl.searchParams.get("lng");
		const lat = latRaw != null ? Number(latRaw) : NaN;
		const lng = lngRaw != null ? Number(lngRaw) : NaN;

		const url = new URL(PHOTON);
		url.searchParams.set("q", q);
		// Photon solo admite lang: default | de | en | fr (no "es"); si no, devuelve error sin features.
		url.searchParams.set("lang", "default");
		url.searchParams.set("limit", "14");
		url.searchParams.set("bbox", bbox);
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			url.searchParams.set("lat", String(lat));
			url.searchParams.set("lon", String(lng));
		}

		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 12_000);
		const res = await fetch(url.toString(), {
			signal: ctrl.signal,
			cache: "no-store",
			headers: {
				Accept: "application/json",
			},
		});
		clearTimeout(t);

		if (!res.ok) {
			return NextResponse.json(
				{ error: "Servicio de mapas no disponible", suggestions: [] },
				{ status: 502 },
			);
		}

		const data = (await res.json()) as {
			features?: PhotonFeature[];
			lang?: unknown;
		};
		const features = Array.isArray(data.features) ? data.features : [];
		const seen = new Set<string>();
		const suggestions: { label: string }[] = [];

		for (const f of features) {
			const p = f.properties;
			if (!p) continue;
			if (!matchesRegion(region, p)) continue;
			const label = labelFromProps(p);
			if (!label) continue;
			const key = label.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			suggestions.push({ label });
			if (suggestions.length >= 10) break;
		}

		return NextResponse.json({ suggestions });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Error";
		if (message.includes("abort")) {
			return NextResponse.json({ suggestions: [] }, { status: 504 });
		}
		return NextResponse.json({ error: message, suggestions: [] }, { status: 500 });
	}
}
