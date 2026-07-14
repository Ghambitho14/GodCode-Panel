import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Encabezado de sección reutilizable para el flujo de Pedido Manual.
 * Usa tipografía 11px uppercase extrabold con icono opcional.
 *
 * @param {{ icon?: React.ElementType, children: React.ReactNode, tone?: 'muted' | 'accent' }} props
 */
const SectionHeader = ({ icon: Icon, children, tone = 'muted', className }) => (
	<div className={cn('mb-3 flex items-center gap-2 text-[13px] font-bold leading-none text-gc-text', className)}>
		{Icon ? (
			<Icon
				size={15}
				className={tone === 'accent' ? 'text-gc-accent' : 'text-gc-text-muted'}
				aria-hidden
			/>
		) : null}
		{children}
	</div>
);

export default SectionHeader;
