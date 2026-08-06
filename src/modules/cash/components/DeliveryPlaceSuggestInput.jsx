import React, { useCallback, useEffect, useId, useRef, useState } from "react";

import { searchPlaces } from "../services/placesService";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 380;

/**
 * Input de dirección/lugar con sugerencias (Photon / OpenStreetMap).
 * Permite texto libre; las sugerencias son opcionales.
 *
 * @param {'admin' | 'manual'} [variant='admin']
 */
export default function DeliveryPlaceSuggestInput({
	id: idProp,
	value,
	onChange,
	onPick,
	placeholder,
	biasLat,
	biasLng,
	maxKm,
	state,
	region = "cl",
	disabled,
	variant = "admin",
	inputClassName,
	wrapClassName,
	ariaRequired = false,
	"aria-label": ariaLabel,
}) {
	const genId = useId();
	const id = idProp || genId;
	const listId = `${id}-suggestions`;
	const wrapRef = useRef(null);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [fetchError, setFetchError] = useState(null);
	const [items, setItems] = useState([]);
	const [highlight, setHighlight] = useState(-1);
	const debounceRef = useRef(null);
	const abortRef = useRef(null);
	const isManual = variant === "manual";

	const runSearch = useCallback(
		(q) => {
			const trimmed = String(q ?? "").trim();
			if (trimmed.length < 2) {
				setItems([]);
				setFetchError(null);
				setLoading(false);
				return;
			}
			if (abortRef.current) abortRef.current.abort();
			const ac = new AbortController();
			abortRef.current = ac;
			setLoading(true);
			setFetchError(null);
			searchPlaces({
				q: trimmed,
				region,
				lat: biasLat,
				lng: biasLng,
				maxKm,
				state,
				signal: ac.signal,
			})
				.then((suggestions) => {
					if (ac.signal.aborted) return;
					setFetchError(null);
					setItems(suggestions);
				})
				.catch((err) => {
					if (ac.signal.aborted) return;
					if (err?.name === "AbortError") return;
					setItems([]);
					setFetchError(
						typeof err?.message === "string" && err.message
							? err.message
							: "Error de red al buscar lugares",
					);
				})
				.finally(() => {
					if (!ac.signal.aborted) setLoading(false);
				});
		},
		[biasLat, biasLng, maxKm, region, state],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (abortRef.current) abortRef.current.abort();
		};
	}, []);

	useEffect(() => {
		const onDoc = (e) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target)) {
				setOpen(false);
				setHighlight(-1);
			}
		};
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, []);

	const scheduleSearch = useCallback(
		(q) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
		},
		[runSearch],
	);

	const pick = useCallback(
		(item) => {
			const label = typeof item === "string" ? item : String(item?.label ?? "");
			onChange(label);
			onPick?.(typeof item === "string" ? { label } : item);
			setOpen(false);
			setItems([]);
			setHighlight(-1);
		},
		[onChange, onPick],
	);

	return (
		<div
			ref={wrapRef}
			className={cn(
				isManual ? "manual-order-place-suggest-wrap" : "admin-delivery-place-suggest-wrap",
				wrapClassName,
			)}
		>
			<input
				id={id}
				type="text"
				className={cn(isManual ? undefined : "form-input", inputClassName)}
				placeholder={placeholder}
				value={value}
				disabled={disabled}
				autoComplete="off"
				aria-label={ariaLabel}
				aria-required={ariaRequired || undefined}
				aria-autocomplete="list"
				aria-expanded={open && items.length > 0}
				aria-controls={listId}
				aria-activedescendant={
					highlight >= 0 ? `${listId}-option-${highlight}` : undefined
				}
				role="combobox"
				onFocus={() => {
					setOpen(true);
					if (String(value).trim().length >= 2) runSearch(value);
				}}
				onChange={(ev) => {
					const v = ev.target.value;
					onChange(v);
					setOpen(true);
					setHighlight(-1);
					scheduleSearch(v);
				}}
				onKeyDown={(ev) => {
					if (!open || items.length === 0) return;
					if (ev.key === "ArrowDown") {
						ev.preventDefault();
						setHighlight((h) => Math.min(items.length - 1, h + 1));
					} else if (ev.key === "ArrowUp") {
						ev.preventDefault();
						setHighlight((h) => Math.max(0, h - 1));
					} else if (ev.key === "Enter" && highlight >= 0) {
						ev.preventDefault();
						pick(items[highlight]);
					} else if (ev.key === "Escape") {
						setOpen(false);
						setHighlight(-1);
					}
				}}
			/>
			{loading ? (
				<span
					className={cn(
						isManual
							? "manual-order-place-suggest-hint"
							: "admin-delivery-place-suggest-hint",
					)}
				>
					Buscando direcciones…
				</span>
			) : null}
			{!loading && fetchError ? (
				<span
					className={cn(
						isManual
							? "manual-order-place-suggest-hint manual-order-place-suggest-error"
							: "admin-delivery-place-suggest-hint admin-delivery-place-suggest-error",
					)}
				>
					{fetchError}
				</span>
			) : null}
			{open && items.length > 0 ? (
				<ul
					id={listId}
					className={cn(
						isManual
							? "manual-order-client-suggestions"
							: "admin-delivery-place-suggest-list",
					)}
					role="listbox"
				>
					{items.map((it, i) => (
						<li key={`${it.label}-${i}`} role="presentation">
							<Button
								variant="ghost"
								type="button"
								id={`${listId}-option-${i}`}
								role="option"
								aria-selected={highlight === i}
								className={cn(
									isManual
										? "manual-order-client-suggestion"
										: "admin-delivery-place-suggest-item",
									highlight === i && "is-active",
									isManual && "h-auto justify-start px-0 py-0 font-normal shadow-none",
								)}
								onMouseDown={(e) => e.preventDefault()}
								onMouseEnter={() => setHighlight(i)}
								onClick={() => pick(it)}
							>
								{isManual ? (
									<>
										<span className="manual-order-client-suggestion__name">{it.label}</span>
										{Number.isFinite(it.km) ? (
											<span className="manual-order-client-suggestion__meta">
												{it.km.toFixed(1)} km del local
												{it.state ? ` · ${it.state}` : ''}
											</span>
										) : it.state ? (
											<span className="manual-order-client-suggestion__meta">{it.state}</span>
										) : null}
									</>
								) : (
									it.label
								)}
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
