import React from 'react';

/**
 * Encabezado de sección reutilizable para el flujo de Pedido Manual.
 * Usa tipografía 11px uppercase extrabold con icono opcional.
 *
 * @param {{ icon?: React.ElementType, children: React.ReactNode, tone?: 'muted' | 'accent' }} props
 */
const SectionHeader = ({ icon: Icon, children, tone = 'muted' }) => (
	<div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-gc-text-muted">
		{Icon ? (
			<Icon
				size={14}
				className={tone === 'accent' ? 'text-gc-accent' : 'text-gc-text-muted'}
				aria-hidden
			/>
		) : null}
		{children}
	</div>
);

export default SectionHeader;
