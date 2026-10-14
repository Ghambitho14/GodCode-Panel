import type { ReactNode } from "react";
import { ChevronDown, Grid2x2, PanelBottom, PanelLeft, PanelRight, PanelTop, Square, SquareDashed } from "lucide-react";

import type { BorderMode } from "./hoja-calculo";
import { usePopover } from "./usePopover";

const OPTIONS: Array<{ mode: BorderMode; label: string; icon: ReactNode }> = [
	{ mode: "all", label: "Todos los bordes", icon: <Grid2x2 size={15} aria-hidden="true" /> },
	{ mode: "outer", label: "Borde exterior", icon: <Square size={15} aria-hidden="true" /> },
	{ mode: "bottom", label: "Borde inferior", icon: <PanelBottom size={15} aria-hidden="true" /> },
	{ mode: "top", label: "Borde superior", icon: <PanelTop size={15} aria-hidden="true" /> },
	{ mode: "left", label: "Borde izquierdo", icon: <PanelLeft size={15} aria-hidden="true" /> },
	{ mode: "right", label: "Borde derecho", icon: <PanelRight size={15} aria-hidden="true" /> },
	{ mode: "none", label: "Sin bordes", icon: <SquareDashed size={15} aria-hidden="true" /> },
];

type BordesMenuProps = {
	onPick: (mode: BorderMode) => void;
	/** Después de elegir (para devolver el foco a la hoja). */
	onDone?: () => void;
};

/** Botón «Bordes» con las opciones del menú de Excel; se aplican a todo lo marcado. */
export default function BordesMenu({ onPick, onDone }: BordesMenuProps) {
	const { open, setOpen, rootRef, buttonRef, panelId } = usePopover();

	const pick = (mode: BorderMode) => {
		onPick(mode);
		setOpen(false);
		onDone?.();
	};

	return (
		<div className="hoja-color" ref={rootRef}>
			<button
				ref={buttonRef}
				type="button"
				className="hoja-color__btn"
				title="Bordes"
				aria-label="Bordes"
				aria-haspopup="true"
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				onClick={() => setOpen((v) => !v)}
			>
				<Grid2x2 size={15} aria-hidden="true" />
				<ChevronDown size={12} aria-hidden="true" />
			</button>
			{open ? (
				<div className="hoja-color__panel hoja-bordes__panel" id={panelId} role="group" aria-label="Bordes">
					{OPTIONS.map((option) => (
						<button key={option.mode} type="button" className="hoja-bordes__item" onClick={() => pick(option.mode)}>
							{option.icon}
							{option.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
