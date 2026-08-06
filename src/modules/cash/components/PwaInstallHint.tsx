import { useCallback, useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	dismissInstallHint,
	isStandaloneDisplayMode,
	shouldShowIosInstallHint,
} from "../utils/pwa-install";
import "../styles/PwaInstallHint.css";

/**
 * iOS no expone beforeinstallprompt: solo "Compartir → Añadir a pantalla de inicio".
 * En Android/Chrome el banner nativo aparece solo; aquí guiamos en Safari iOS.
 */
export function PwaInstallHint() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const show = () => setVisible(shouldShowIosInstallHint());
		show();
		window.addEventListener("visibilitychange", show);
		return () => window.removeEventListener("visibilitychange", show);
	}, []);

	const close = useCallback(() => {
		dismissInstallHint();
		setVisible(false);
	}, []);

	if (!visible || isStandaloneDisplayMode()) return null;

	return (
		<div className="pwa-install-hint" role="region" aria-label="Instalar aplicación">
			<div className="pwa-install-hint__body">
				<span className="pwa-install-hint__icon" aria-hidden>
					<Share size={18} strokeWidth={1.75} />
				</span>
				<p className="pwa-install-hint__text">
					<strong>Instalar en el iPhone:</strong> toca{" "}
					<strong>Compartir</strong>{" "}
					<span className="pwa-install-hint__ios-share" aria-hidden>⎋</span> y luego{" "}
					<strong>Añadir a pantalla de inicio</strong>. Así se oculta la barra del navegador.
				</p>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="pwa-install-hint__close"
				onClick={close}
				aria-label="Cerrar"
			>
				<X size={18} aria-hidden />
			</Button>
		</div>
	);
}
