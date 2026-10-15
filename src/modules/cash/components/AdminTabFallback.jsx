import React from 'react';

/**
 * Esqueleto que se ve mientras carga una pestaña: una barra de herramientas y
 * tres tarjetas, en los grises del panel claro (los estilos van en
 * AdminShared.css, `.admin-tab-skeleton`).
 */
export function AdminTabFallback() {
	return (
		<div className="admin-tab-skeleton" role="status" aria-label="Cargando…">
			<div className="admin-tab-skeleton__toolbar">
				<div className="admin-skeleton-block admin-skeleton-block--search" />
				<div className="admin-skeleton-block admin-skeleton-block--chip" />
				<div className="admin-skeleton-block admin-skeleton-block--chip" />
			</div>
			<div className="admin-tab-skeleton__grid">
				{[0, 1, 2].map((i) => (
					<div key={i} className="admin-tab-skeleton__card">
						<div className="admin-skeleton-block admin-skeleton-block--line admin-skeleton-block--short" />
						<div className="admin-skeleton-block admin-skeleton-block--value" />
						<div className="admin-skeleton-block admin-skeleton-block--line" />
					</div>
				))}
			</div>
			<div className="admin-skeleton-block admin-skeleton-block--panel" />
		</div>
	);
}

export default AdminTabFallback;
