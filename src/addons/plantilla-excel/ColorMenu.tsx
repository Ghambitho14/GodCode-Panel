import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ban, ChevronDown, Pipette } from "lucide-react";

import type { ColorOption } from "./colores";

type ColorMenuProps = {
	/** «Relleno», «Color de letra». */
	label: string;
	icon: ReactNode;
	colors: ColorOption[];
	/** «Sin relleno», «Automático». */
	noneLabel: string;
	/** Color de la celda activa (se ve en la barrita del botón). */
	current: string | null;
	/** `null` quita el color. */
	onPick: (color: string | null) => void;
	/** Después de elegir (para devolver el foco a la hoja). */
	onDone?: () => void;
};

/** Botón con paleta flotante: colores fijos, «sin color» y el selector del sistema. */
export default function ColorMenu({ label, icon, colors, noneLabel, current, onPick, onDone }: ColorMenuProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelId = useId();

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpen(false);
			buttonRef.current?.focus();
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const pick = (color: string | null) => {
		onPick(color);
		setOpen(false);
		onDone?.();
	};

	return (
		<div className="hoja-color" ref={rootRef}>
			<button
				ref={buttonRef}
				type="button"
				className="hoja-color__btn"
				title={label}
				aria-label={label}
				aria-haspopup="true"
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				onClick={() => setOpen((v) => !v)}
			>
				<span className="hoja-color__icon">
					{icon}
					<span className="hoja-color__bar" style={{ background: current ?? "transparent" }} aria-hidden="true" />
				</span>
				<ChevronDown size={12} aria-hidden="true" />
			</button>
			{open ? (
				<div className="hoja-color__panel" id={panelId} role="group" aria-label={label}>
					<button type="button" className="hoja-color__none" onClick={() => pick(null)}>
						<Ban size={14} aria-hidden="true" />
						{noneLabel}
					</button>
					<div className="hoja-color__grid">
						{colors.map((c) => (
							<button
								key={c.value}
								type="button"
								className={`hoja-color__swatch${current === c.value ? " is-current" : ""}`}
								style={{ background: c.value }}
								title={c.name}
								aria-label={c.name}
								aria-pressed={current === c.value}
								onClick={() => pick(c.value)}
							/>
						))}
					</div>
					<label className="hoja-color__more">
						<Pipette size={14} aria-hidden="true" />
						Más colores…
						<input
							type="color"
							className="hoja-color__native"
							value={current ?? "#000000"}
							onChange={(event) => onPick(event.target.value.toLowerCase())}
						/>
					</label>
				</div>
			) : null}
		</div>
	);
}
