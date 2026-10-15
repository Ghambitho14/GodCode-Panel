import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { useHistoryBack } from '@/modules/cash/hooks/useHistoryBack';
import { AlertTriangle, Info } from 'lucide-react';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import {
	getConfirmDialogState,
	resolveConfirmDialog,
	subscribeConfirmDialog,
} from '../admin/utils/confirmDialog';
import '../styles/AdminConfirmDialog.css';

/**
 * Ventana de confirmación del panel: título, texto, Cancelar y la acción.
 * Con `danger` la acción va en rojo y el foco arranca en Cancelar. Con
 * `alertOnly` solo hay un botón. Esc y clic fuera equivalen a cancelar.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.text]
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {boolean} [props.danger]
 * @param {boolean} [props.alertOnly]
 * @param {boolean} [props.busy]
 * @param {() => void} [props.onConfirm]
 * @param {() => void} [props.onCancel]
 */
export function AdminConfirmDialog({
	open,
	title,
	text,
	confirmLabel = 'Confirmar',
	cancelLabel = 'Cancelar',
	danger = false,
	alertOnly = false,
	busy = false,
	onConfirm,
	onCancel,
}) {
	const titleId = useId();
	const textId = useId();
	const confirmRef = useRef(null);
	const cancelRef = useRef(null);
	useLockBodyScroll(open);

	const dismiss = alertOnly ? onConfirm : onCancel;
	useHistoryBack(open, () => {
		if (!busy) dismiss?.();
	});

	useEffect(() => {
		if (!open) return undefined;
		const previous = document.activeElement;
		// En acciones destructivas el foco arranca en Cancelar: Enter no borra nada por accidente.
		const first = danger && !alertOnly ? cancelRef.current : confirmRef.current;
		first?.focus();
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				if (!busy) dismiss?.();
				return;
			}
			if (e.key !== 'Tab') return;
			// El foco se queda dentro de la ventana
			const items = [cancelRef.current, confirmRef.current].filter(Boolean);
			e.preventDefault();
			if (items.length < 2) return;
			const i = items.indexOf(document.activeElement);
			const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i >= items.length - 1 ? 0 : i + 1);
			items[next].focus();
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			if (previous instanceof HTMLElement) previous.focus?.();
		};
	}, [open, danger, alertOnly, busy, dismiss]);

	if (!open) return null;

	return (
		<div
			className="admin-confirm-dialog__overlay"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget && !busy) dismiss?.();
			}}
		>
			<div
				className="admin-confirm-dialog"
				role={alertOnly ? 'alertdialog' : 'dialog'}
				aria-modal="true"
				aria-labelledby={title ? titleId : undefined}
				aria-describedby={text ? textId : undefined}
			>
				<div className="admin-confirm-dialog__head">
					<span className={`admin-confirm-dialog__icon${danger ? ' admin-confirm-dialog__icon--danger' : ''}`} aria-hidden>
						{danger ? <AlertTriangle size={20} strokeWidth={2} /> : <Info size={20} strokeWidth={2} />}
					</span>
					<div className="admin-confirm-dialog__copy">
						{title ? <h2 id={titleId} className="admin-confirm-dialog__title">{title}</h2> : null}
						{text ? <p id={textId} className="admin-confirm-dialog__text">{text}</p> : null}
					</div>
				</div>
				<div className="admin-confirm-dialog__actions">
					{!alertOnly ? (
						<button
							ref={cancelRef}
							type="button"
							className="admin-confirm-dialog__btn admin-confirm-dialog__btn--cancel"
							onClick={onCancel}
							disabled={busy}
						>
							{cancelLabel}
						</button>
					) : null}
					<button
						ref={confirmRef}
						type="button"
						className={`admin-confirm-dialog__btn ${danger ? 'admin-confirm-dialog__btn--danger' : 'admin-confirm-dialog__btn--confirm'}`}
						onClick={onConfirm}
						disabled={busy}
						aria-busy={busy || undefined}
					>
						{busy ? 'Un momento…' : confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}

/** Dibuja lo que piden `confirmDialog` / `alertDialog`. Va una vez, en Admin.jsx. */
export function AdminConfirmDialogHost() {
	const request = useSyncExternalStore(subscribeConfirmDialog, getConfirmDialogState, () => null);
	if (!request) return null;
	const isAlert = request.kind === 'alert';
	return (
		<AdminConfirmDialog
			open
			title={request.title}
			text={request.text}
			confirmLabel={request.confirmLabel ?? (isAlert ? 'Entendido' : 'Confirmar')}
			cancelLabel={request.cancelLabel ?? 'Cancelar'}
			danger={Boolean(request.danger)}
			alertOnly={isAlert}
			onConfirm={() => resolveConfirmDialog(isAlert ? undefined : true)}
			onCancel={() => resolveConfirmDialog(false)}
		/>
	);
}

export default AdminConfirmDialog;
