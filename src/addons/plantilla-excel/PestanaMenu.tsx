import { useState, type CSSProperties } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { usePopover } from "./usePopover";

type PestanaMenuProps = {
	/** Nombre de la hoja, para las etiquetas. */
	name: string;
	/** La última hoja no se puede borrar. */
	canDelete: boolean;
	onDuplicate: () => void;
	onRename: () => void;
	onDelete: () => void;
};

/**
 * Botón ⋯ de la pestaña abierta: duplicar, cambiar nombre y borrar. El menú va con posición fija
 * porque la fila de pestañas se desplaza a lo ancho y lo recortaría; se abre hacia arriba.
 */
export default function PestanaMenu({ name, canDelete, onDuplicate, onRename, onDelete }: PestanaMenuProps) {
	const { open, setOpen, rootRef, buttonRef, panelId } = usePopover();
	const [place, setPlace] = useState<CSSProperties>({});

	const toggle = () => {
		if (!open && buttonRef.current) {
			const rect = buttonRef.current.getBoundingClientRect();
			setPlace({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 188)), bottom: window.innerHeight - rect.top + 6 });
		}
		setOpen((v) => !v);
	};

	const pick = (action: () => void) => {
		setOpen(false);
		action();
	};

	return (
		<div className="hoja-pestana" ref={rootRef}>
			<button
				ref={buttonRef}
				type="button"
				className="hoja__tab-more"
				title="Más opciones"
				aria-label={`Opciones de la hoja ${name}`}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				onClick={toggle}
			>
				<MoreHorizontal size={14} aria-hidden="true" />
			</button>
			{open ? (
				<div className="hoja-pestana__panel" id={panelId} role="menu" aria-label={`Opciones de la hoja ${name}`} style={place}>
					<button type="button" role="menuitem" className="hoja-bordes__item" onClick={() => pick(onDuplicate)}>
						<Copy size={15} aria-hidden="true" />
						Duplicar
					</button>
					<button type="button" role="menuitem" className="hoja-bordes__item" onClick={() => pick(onRename)}>
						<Pencil size={15} aria-hidden="true" />
						Cambiar nombre
					</button>
					{canDelete ? (
						<button type="button" role="menuitem" className="hoja-bordes__item hoja-pestana__danger" onClick={() => pick(onDelete)}>
							<Trash2 size={15} aria-hidden="true" />
							Borrar hoja
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
