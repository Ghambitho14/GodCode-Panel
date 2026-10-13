import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { supabase } from "@/integrations/supabase";

import {
	chooseInitial,
	loadAddonData,
	readLocalCopy,
	saveAddonData,
	type AddonDataClient,
	type AddonDataTarget,
	type LocalAddonData,
} from "./addon-data";

/** `loading`: abriendo · `saved`: al día · `saving`: subiendo · `offline`: no se pudo subir, se reintenta. */
export type AddonDataStatus = "loading" | "saved" | "saving" | "offline";

type Options<T> = {
	/** Carpeta del extra en `src/addons/`. */
	addon: string;
	/** Lo decide el extra (p. ej. la sucursal); `""` = uno para toda la empresa. */
	dataKey: string;
	companyId: string | null | undefined;
	/** Valida lo leído (de la base o del navegador) y da el valor inicial si no hay nada. */
	revive: (raw: unknown) => T;
	/** Dónde va la copia en el navegador. */
	localKey: string;
	/** Espera tras el último cambio antes de subir. */
	delayMs?: number;
};

const RETRY_MS = 5000;

const client = supabase as unknown as AddonDataClient;

function writeLocal(localKey: string, copy: LocalAddonData) {
	try {
		window.localStorage.setItem(localKey, JSON.stringify(copy));
	} catch {
		// Sin almacenamiento (modo privado, lleno): queda solo la base.
	}
}

function readLocal(localKey: string): LocalAddonData | null {
	try {
		return readLocalCopy(window.localStorage.getItem(localKey));
	} catch {
		return null;
	}
}

/**
 * Estado de un extra guardado en `addon_data`: se carga al abrir y se sube solo, poco después
 * de cada cambio (el JSON entero; si dos personas editan a la vez, gana el último que guarda).
 * Mientras no llega a la base, queda una copia en el navegador.
 */
export function useAddonData<T>({ addon, dataKey, companyId, revive, localKey, delayMs = 800 }: Options<T>) {
	const [data, setDataState] = useState<T | null>(null);
	const [status, setStatus] = useState<AddonDataStatus>("loading");
	const [savedAt, setSavedAt] = useState<Date | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [loadNonce, setLoadNonce] = useState(0);

	const target = useMemo<AddonDataTarget | null>(
		() => (companyId ? { companyId, addon, key: dataKey } : null),
		[companyId, addon, dataKey],
	);

	const latest = useRef<T | null>(null);
	const dirty = useRef(false);
	const inFlight = useRef(false);
	const timer = useRef(0);
	const reviveRef = useRef(revive);
	const saveRef = useRef<() => Promise<void>>(async () => {});

	const schedule = useCallback((ms: number) => {
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => void saveRef.current(), ms);
	}, []);

	useEffect(() => {
		reviveRef.current = revive;
		saveRef.current = async () => {
			window.clearTimeout(timer.current);
			if (!target || !dirty.current || inFlight.current) return;
			inFlight.current = true;
			const snapshot = latest.current;
			setStatus("saving");
			try {
				const updatedAt = await saveAddonData(client, target, snapshot);
				inFlight.current = false;
				if (latest.current !== snapshot) {
					// Cambió mientras subía: sube de nuevo lo último.
					schedule(delayMs);
					return;
				}
				dirty.current = false;
				writeLocal(localKey, { v: 2, data: snapshot, dirty: false, at: updatedAt ?? new Date().toISOString() });
				setSavedAt(updatedAt ? new Date(updatedAt) : new Date());
				setStatus("saved");
			} catch {
				inFlight.current = false;
				setStatus("offline");
				schedule(RETRY_MS);
			}
		};
	});

	// Abrir: lo de la base, o lo del navegador si tiene cambios sin subir más nuevos.
	useEffect(() => {
		let alive = true;
		if (!target) return undefined;
		loadAddonData(client, target)
			.then((remote) => {
				if (!alive) return;
				const initial = chooseInitial(readLocal(localKey), remote);
				const value = reviveRef.current(initial.data);
				latest.current = value;
				setDataState(value);
				setSavedAt(remote?.updatedAt ? new Date(remote.updatedAt) : null);
				setStatus("saved");
				if (initial.push) {
					dirty.current = true;
					void saveRef.current();
				}
			})
			.catch((err: unknown) => {
				if (!alive) return;
				setLoadError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			alive = false;
		};
	}, [target, localKey, loadNonce]);

	const setData = useCallback<Dispatch<SetStateAction<T>>>(
		(action) => {
			const prev = latest.current;
			if (prev === null) return;
			const next = typeof action === "function" ? (action as (value: T) => T)(prev) : action;
			if (next === prev) return;
			latest.current = next;
			setDataState(next);
			dirty.current = true;
			writeLocal(localKey, { v: 2, data: next, dirty: true, at: new Date().toISOString() });
			schedule(delayMs);
		},
		[delayMs, localKey, schedule],
	);

	// Al esconder la pestaña, cerrar o salir de la pantalla, sube lo pendiente sin esperar.
	useEffect(() => {
		const flush = () => {
			if (dirty.current) void saveRef.current();
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		window.addEventListener("pagehide", flush);
		window.addEventListener("online", flush);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("pagehide", flush);
			window.removeEventListener("online", flush);
			document.removeEventListener("visibilitychange", onVisibility);
			flush();
		};
	}, []);

	const reload = useCallback(() => {
		setLoadError(null);
		setStatus("loading");
		setLoadNonce((n) => n + 1);
	}, []);

	return {
		data,
		setData,
		status,
		savedAt,
		loadError: target ? loadError : "No sabemos de qué empresa es esta hoja.",
		reload,
	};
}
