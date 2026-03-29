"use client";

import { useEffect } from "react";

/**
 * Registra el SW en la raíz para que Chrome/Edge puedan ofrecer «Instalar app».
 * El SW solo reenvía al network (no cachea rutas dinámicas ni API).
 */
export function PwaServiceWorkerRegister() {
	useEffect(() => {
		if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

		const register = () => {
			navigator.serviceWorker
				.register("/sw.js", { scope: "/" })
				.catch(() => {
					/* ignorar en dev o si el origen no permite SW */
				});
		};

		if (document.readyState === "complete") {
			register();
		} else {
			window.addEventListener("load", register, { once: true });
		}
	}, []);

	return null;
}
