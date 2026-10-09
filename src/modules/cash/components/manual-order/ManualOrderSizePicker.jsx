import React, { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { productSizes } from '../../hooks/manual-order/cartLines';
import { textScale } from './manualOrderStyles';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getOptionButtons = (root) => [...(root?.querySelectorAll('[data-size-option]') ?? [])];

/**
 * Elegir tamaño al agregar desde la caja un producto con tamaños: una fila por tamaño
 * con nombre y precio; al elegir se agrega la línea y se cierra.
 *
 * Teclado: flechas, Inicio y Fin recorren los tamaños; Enter o Espacio eligen; Tab no
 * sale del diálogo y Escape lo cierra. Escape y Tab no se propagan: el modal del pedido
 * los escucha en `window` y cerraría el pedido o se llevaría el foco.
 */
export default function ManualOrderSizePicker({ product, onPick, onClose }) {
	const { formatMoney } = useBranchMoney();
	const sizes = useMemo(() => productSizes(product), [product]);
	const titleId = useId();
	const hintId = useId();
	const dialogRef = useRef(null);
	// Un Espacio que empezó en la tarjeta del producto no elige tamaño al soltarse aquí.
	const spaceDownInsideRef = useRef(false);

	useEffect(() => {
		const opener = document.activeElement;
		const [firstOption] = getOptionButtons(dialogRef.current);
		(firstOption ?? dialogRef.current)?.focus();
		return () => {
			// Al cerrar, el foco vuelve a la tarjeta o al «+» que abrió el selector.
			if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
		};
	}, []);

	const handleKeyDown = (event) => {
		if (event.key === ' ') spaceDownInsideRef.current = true;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onClose();
			return;
		}
		if (event.key === 'Tab') {
			event.stopPropagation();
			const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) ?? [])];
			if (focusable.length === 0) {
				event.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
			return;
		}
		const options = getOptionButtons(dialogRef.current);
		if (options.length === 0) return;
		const current = options.indexOf(document.activeElement);
		let next = null;
		if (event.key === 'ArrowDown') next = current === -1 ? 0 : (current + 1) % options.length;
		else if (event.key === 'ArrowUp') next = current === -1 ? options.length - 1 : (current - 1 + options.length) % options.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = options.length - 1;
		if (next != null) {
			event.preventDefault();
			options[next].focus();
		}
	};

	const handleKeyUp = (event) => {
		if (event.key !== ' ') return;
		if (!spaceDownInsideRef.current) event.preventDefault();
		spaceDownInsideRef.current = false;
	};

	const content = (
		<div
			// `.manual-order-portal-scope` lleva pointer-events: none; sin esto los toques caen al catálogo de atrás.
			className="pointer-events-auto fixed inset-0 z-[1200] flex touch-manipulation items-end justify-center bg-black/45 sm:items-center sm:p-4"
			onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={hintId}
				tabIndex={-1}
				onKeyDown={handleKeyDown}
				onKeyUp={handleKeyUp}
				className="flex max-h-[min(560px,92vh)] w-full max-w-sm flex-col overflow-hidden rounded-t-[22px] border border-gc-border bg-gc-page shadow-xl outline-none sm:rounded-[22px]"
			>
				<header className="flex items-center gap-2 border-b border-gc-border bg-gc-card px-4 py-3">
					<div className="min-w-0 flex-1">
						<h2 id={titleId} className={cn(textScale.emphasis, 'truncate font-bold text-gc-text')}>
							{product.name}
						</h2>
						<p id={hintId} className={cn(textScale.micro, 'text-gc-text-muted')}>Elige el tamaño</p>
					</div>
					<Button
						variant="ghost"
						type="button"
						onClick={onClose}
						className="h-10 w-10 shrink-0 rounded-full p-0 text-gc-text-muted"
						aria-label="Cerrar"
					>
						<X size={18} aria-hidden />
					</Button>
				</header>

				<div
					className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
					role="group"
					aria-label={`Tamaños de ${product.name}`}
				>
					{sizes.map((size) => (
						<button
							key={size.id}
							type="button"
							data-size-option=""
							onClick={() => onPick(size)}
							className={cn(
								'flex min-h-[52px] w-full items-center gap-3 rounded-[14px] border border-gc-border bg-gc-card px-4 py-3 text-left transition-colors hover:border-gc-accent/40 hover:bg-gc-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent/40',
								textScale.body,
							)}
						>
							<span className="min-w-0 flex-1 truncate font-semibold text-gc-text">{size.name}</span>
							<span className="shrink-0 font-bold tabular-nums text-gc-text">{formatMoney(size.price)}</span>
						</button>
					))}
				</div>
			</div>
		</div>
	);

	return createPortal(content, document.querySelector('.manual-order-portal-scope') ?? document.body);
}
