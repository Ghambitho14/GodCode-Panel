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
			<header className="glass animate-fade admin-menu-options-intro">
				<p className="admin-menu-options-eyebrow">Menú digital</p>
				<h2 className="admin-menu-options-title">Opciones de menú</h2>
				<p className="admin-menu-options-lead">
					Ajustes del menú público de tu negocio. Aquí iremos sumando más opciones cuando hagan falta.
				</p>
			</header>

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
