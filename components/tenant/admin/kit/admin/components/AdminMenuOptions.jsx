"use client";

import React from "react";
import AdminMenuDeliverySection from "./AdminMenuDeliverySection";
import AdminMenuCarousel from "./AdminMenuCarousel";
import "../styles/AdminMenuOptions.css";

/**
 * Punto único para la pestaña "Opciones de menú": aquí se apilan secciones
 * (delivery, carrusel, futuras flags del menú público / SaaS).
 */
export default function AdminMenuOptions({ showNotify, selectedBranch, companyId, onDeliverySaved }) {
	return (
		<div className="admin-menu-options" data-tab="menu-options">
			<AdminMenuDeliverySection
				showNotify={showNotify}
				selectedBranch={selectedBranch}
				onSaved={onDeliverySaved}
			/>

			<div className="admin-menu-options-carousel-wrap">
				<p className="admin-menu-options-section-label">Carrusel por sucursal</p>
				<AdminMenuCarousel
					showNotify={showNotify}
					selectedBranch={selectedBranch}
					companyId={companyId}
				/>
			</div>
		</div>
	);
}
