"use client";

import React from "react";
import { Bell } from "lucide-react";

/**
 * Cabecera de página del admin: título + campana (comunicados) + acciones.
 * hideTitleVisual: oculta el H1 en pantalla (p. ej. móvil en Cocina en vivo); mantiene texto para lectores de pantalla.
 */
export default function AdminTopBar({ title, showBroadcastsCue, children, hideTitleVisual = false }) {
	const scrollBroadcasts = () => {
		document.getElementById("admin-broadcasts-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<header className="content-header admin-top-bar">
			<div
				className={
					hideTitleVisual
						? "content-header-title-block content-header-title-block--visually-collapsed"
						: "content-header-title-block"
				}
			>
				<h1 className={hideTitleVisual ? "admin-visually-hidden" : undefined}>{title}</h1>
			</div>
			<div className="header-actions header-actions--mobile-toolbar">
				{showBroadcastsCue ? (
					<button
						type="button"
						className="btn-icon-refresh admin-icon-btn header-action-bell"
						onClick={scrollBroadcasts}
						title="Ver comunicados"
						aria-label="Ver comunicados"
					>
						<Bell size={24} strokeWidth={1.65} />
					</button>
				) : null}
				{children}
			</div>
		</header>
	);
}
