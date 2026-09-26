import { useState, useSyncExternalStore } from "react";
import { RefreshCw, X } from "lucide-react";
import { applyAppUpdate, isAppUpdateReady, subscribeAppUpdate } from "./app-update";
import "./AppUpdateBanner.css";

/** Aviso de versión nueva del panel. La región viva existe siempre para que el lector la anuncie. */
export function AppUpdateBanner() {
	const ready = useSyncExternalStore(subscribeAppUpdate, isAppUpdateReady, () => false);
	const [dismissed, setDismissed] = useState(false);

	return (
		<div className="app-update-region" aria-live="polite">
			{ready && !dismissed ? (
				<div className="app-update" role="status">
					<RefreshCw size={18} strokeWidth={2} className="app-update__icon" aria-hidden />
					<p className="app-update__text">Hay una versión nueva del panel</p>
					<button type="button" className="app-update__action" onClick={applyAppUpdate}>
						Actualizar
					</button>
					<button
						type="button"
						className="app-update__dismiss"
						aria-label="Más tarde"
						onClick={() => setDismissed(true)}
					>
						<X size={16} strokeWidth={2} aria-hidden />
					</button>
				</div>
			) : null}
		</div>
	);
}
