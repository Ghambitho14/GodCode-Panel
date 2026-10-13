import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import "./AddonFrame.css";

type AddonFrameProps = {
	/** Nombre del extra (el del catálogo). */
	title: string;
	/** Vuelve a la pantalla de Addons. Sin ella no se muestra la flecha. */
	onBack?: () => void;
	children: ReactNode;
};

/**
 * El marco común de todo extra abierto en el panel: una barra arriba con la flecha para volver
 * a «Addons» y el nombre del extra. Lo de abajo es la pantalla propia de cada extra.
 */
export default function AddonFrame({ title, onBack, children }: AddonFrameProps) {
	return (
		<div className="addon-frame">
			<div className="addon-frame__bar">
				{onBack ? (
					<button type="button" className="addon-frame__back" onClick={onBack}>
						<ArrowLeft size={16} aria-hidden />
						Addons
					</button>
				) : null}
				<span className="addon-frame__title">{title}</span>
			</div>
			<div className="addon-frame__body">{children}</div>
		</div>
	);
}
