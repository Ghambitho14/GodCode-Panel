/**
 * Datos de los extras a medida en Supabase: tabla `addon_data`, un JSON por empresa, extra y
 * clave (p. ej. la sucursal). La crea `GodCode/Addons/sql/2026-10-13_addon_data.sql`; RLS deja a
 * cada empresa solo con lo suyo.
 *
 * Además queda una copia en el navegador: si se corta la conexión, lo último no se pierde y se
 * sube al volver (ver `chooseInitial`).
 */

export type AddonDataTarget = { companyId: string; addon: string; key: string };

export type RemoteAddonData = { data: unknown; updatedAt: string | null };

/** Copia en el navegador. `dirty`: hay cambios que todavía no llegaron a la base. */
export type LocalAddonData = { v: 2; data: unknown; dirty: boolean; at: string };

/** Lo mínimo del cliente de Supabase que se usa (así se puede probar con uno falso). */
type QueryResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type AddonDataClient = {
	from: (table: "addon_data") => {
		select: (columns: string) => {
			eq: (column: string, value: string) => {
				eq: (column: string, value: string) => {
					eq: (column: string, value: string) => { maybeSingle: () => QueryResult };
				};
			};
		};
		upsert: (
			row: Record<string, unknown>,
			options: { onConflict: string },
		) => { select: (columns: string) => { single: () => QueryResult } };
	};
};

export async function loadAddonData(client: AddonDataClient, target: AddonDataTarget): Promise<RemoteAddonData | null> {
	const { data, error } = await client
		.from("addon_data")
		.select("data, updated_at")
		.eq("company_id", target.companyId)
		.eq("addon", target.addon)
		.eq("key", target.key)
		.maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	const row = data as { data?: unknown; updated_at?: string | null };
	return { data: row.data ?? null, updatedAt: row.updated_at ?? null };
}

/** Guarda el JSON entero (gana el último que guarda). Devuelve la hora del servidor. */
export async function saveAddonData(client: AddonDataClient, target: AddonDataTarget, value: unknown): Promise<string | null> {
	const { data, error } = await client
		.from("addon_data")
		.upsert({ company_id: target.companyId, addon: target.addon, key: target.key, data: value }, { onConflict: "company_id,addon,key" })
		.select("updated_at")
		.single();
	if (error) throw new Error(error.message);
	return (data as { updated_at?: string | null } | null)?.updated_at ?? null;
}

/**
 * Lee la copia del navegador. Un valor sin el envoltorio `v: 2` es de antes de la base (se
 * guardaba el JSON tal cual): cuenta como cambios sin subir, pero más viejos que cualquier cosa
 * de la base.
 */
export function readLocalCopy(raw: string | null): LocalAddonData | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const value = parsed as Partial<LocalAddonData>;
	if (value.v === 2 && "data" in value) {
		return { v: 2, data: value.data, dirty: Boolean(value.dirty), at: typeof value.at === "string" ? value.at : new Date(0).toISOString() };
	}
	return { v: 2, data: parsed, dirty: true, at: new Date(0).toISOString() };
}

/**
 * Con qué se abre: lo de la base, salvo que el navegador tenga cambios sin subir más nuevos (se
 * cortó la conexión antes de guardar) o la base todavía no tenga nada. `push`: hay que subirlo.
 */
export function chooseInitial(local: LocalAddonData | null, remote: RemoteAddonData | null): { data: unknown; push: boolean } {
	if (local?.dirty) {
		const remoteTime = remote?.updatedAt ? Date.parse(remote.updatedAt) : Number.NEGATIVE_INFINITY;
		if (!remote || Date.parse(local.at) > remoteTime) return { data: local.data, push: true };
	}
	return { data: remote ? remote.data : null, push: false };
}
