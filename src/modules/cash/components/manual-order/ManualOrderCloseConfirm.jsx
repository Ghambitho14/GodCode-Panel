import React from 'react';
import { Button } from '@/components/ui/button';

const ManualOrderCloseConfirm = React.forwardRef(function ManualOrderCloseConfirm({
	action = null,
	continueButtonRef,
	onContinue,
	onSaveDraft,
	onDiscard,
}, ref) {
	const busy = Boolean(action);

	return (
		<div
			ref={ref}
			className="manual-order-close-confirm"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="manual-order-close-title"
			aria-describedby="manual-order-close-description"
			aria-busy={busy ? 'true' : undefined}
			tabIndex={-1}
			onClick={(event) => {
				if (event.target === event.currentTarget) onContinue?.();
			}}
		>
			<div className="manual-order-close-confirm__card">
				<h2 id="manual-order-close-title">¿Cerrar este pedido?</h2>
				<p id="manual-order-close-description">Puedes continuar editando, conservar el borrador 24 horas o descartarlo.</p>
				<div className="manual-order-close-confirm__actions">
					<Button ref={continueButtonRef} variant="outline" type="button" onClick={onContinue} disabled={busy}>Continuar</Button>
					<Button variant="secondary" type="button" onClick={onSaveDraft} disabled={busy}>{action === 'saving' ? 'Guardando…' : 'Cerrar con borrador'}</Button>
					<Button variant="destructive" type="button" onClick={onDiscard} disabled={busy}>{action === 'discarding' ? 'Descartando…' : 'Descartar'}</Button>
				</div>
			</div>
		</div>
	);
});

export default ManualOrderCloseConfirm;
