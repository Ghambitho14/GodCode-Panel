import React from 'react';
import { cn } from '@/lib/utils';
import { textScale } from './manualOrderStyles';

/**
 * Encabezado de sección reutilizable para el flujo de Pedido Manual.
 *
 * @param {{ icon?: React.ElementType, children: React.ReactNode, tone?: 'muted' | 'accent', className?: string }} props
 */
const SectionHeader = ({ icon: Icon, children, tone = 'muted', className }) => (
	<div
		className={cn(
			`mb-3 flex items-center gap-2 ${textScale.micro} font-extrabold uppercase tracking-[0.06em] leading-none text-gc-text`,
			className,
		)}
	>
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
