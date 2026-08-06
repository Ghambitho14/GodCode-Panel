import React, { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign } from 'lucide-react';
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { Button } from '@/components/ui/button';

/**
 * @param {'income' | 'cash_withdrawal' | 'operating_expense'} variant
 */
const CashMovementModal = ({ isOpen, onClose, variant = 'income', onConfirm }) => {
	const { currency } = useBranchMoney();
	const [formData, setFormData] = useState({
		amount: '',
		description: '',
		paymentMethod: 'cash',
	});
	const [error, setError] = useState('');

	const isIncome = variant === 'income';
	const isCashWithdrawal = variant === 'cash_withdrawal';
	const isOperatingExpense = variant === 'operating_expense';

	useEffect(() => {
		if (isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setFormData({
				amount: '',
				description: '',
				paymentMethod: 'cash',
			});
			setError('');
		}
	}, [isOpen, variant]);

	useLockBodyScroll(isOpen);

	if (!isOpen) return null;

	const handleSubmit = (e) => {
		e.preventDefault();
		const numAmount = parseFloat(formData.amount);

		if (isNaN(numAmount) || numAmount <= 0) {
			setError('Ingresa un monto válido');
			return;
		}

		if (!formData.description.trim()) {
			setError('La descripción es obligatoria');
			return;
		}

		if (isCashWithdrawal) {
			onConfirm('expense', numAmount, formData.description, 'cash');
		} else {
			onConfirm(isIncome ? 'income' : 'expense', numAmount, formData.description, formData.paymentMethod);
		}
		onClose();
	};

	const title = isIncome
		? 'Registrar ingreso'
		: isCashWithdrawal
			? 'Sacar efectivo'
			: 'Gasto del local';

	const descPlaceholder = isIncome
		? 'Ej: Aporte extra, ajuste…'
		: isCashWithdrawal
			? 'Ej: Compra urgente, vuelto, taxi…'
			: 'Ej: Mercadería, arriendo, sueldo…';

	const submitLabel = isCashWithdrawal ? 'Registrar retiro' : 'Guardar movimiento';
	const submitClass = isIncome
		? 'cash-dialog__btn cash-dialog__btn--income'
		: 'cash-dialog__btn cash-dialog__btn--expense';

	return (
		<div className="modal-overlay" onClick={onClose} role="presentation">
			<div
				className={`modal-content cash-dialog cash-movement-modal cash-movement-modal--${variant}`}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="cash-movement-modal-title"
			>
				<header className="modal-header cash-dialog__header">
					<h3 id="cash-movement-modal-title" className="cash-dialog__title">
						{title}
					</h3>
					<button type="button" onClick={onClose} className="cash-dialog__dismiss" aria-label="Cerrar">
						<X size={16} strokeWidth={2} />
					</button>
				</header>

				<form onSubmit={handleSubmit} className="cash-dialog__form">
					<div className="modal-form cash-dialog__body">
						{isCashWithdrawal ? (
							<p className="cash-dialog__hint">
								Para mercadería, arriendo o sueldo usa <strong>Ventas → Gastos del local</strong>.
							</p>
						) : null}
						{isOperatingExpense ? (
							<p className="cash-dialog__hint">
								Gastos operativos del negocio (mercadería, arriendo, sueldo, servicios).
							</p>
						) : null}

						<div className="form-group">
							<label htmlFor="cash-movement-amount">Monto</label>
							<div className="cash-dialog__amount-wrap">
								<span className="cash-dialog__currency" aria-hidden>
									{currency}
								</span>
								<input
									id="cash-movement-amount"
									type="number"
									min="0"
									step="any"
									className="form-input cash-dialog__amount-input"
									placeholder="0"
									autoFocus
									value={formData.amount}
									onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
									required
								/>
							</div>
						</div>

						<div className="form-group">
							<label htmlFor="cash-movement-desc">Descripción / Motivo</label>
							<textarea
								id="cash-movement-desc"
								className="form-input cash-dialog__textarea"
								placeholder={descPlaceholder}
								value={formData.description}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, description: e.target.value }))
								}
								required
							/>
						</div>

						{!isCashWithdrawal ? (
							<div className="form-group">
								<span className="cash-dialog__field-label" id="cash-movement-method-label">
									Método
								</span>
								<div
									className="cash-dialog__pay-options"
									role="group"
									aria-labelledby="cash-movement-method-label"
								>
									<button
										type="button"
										className={`cash-dialog__pay-option${formData.paymentMethod === 'cash' ? ' is-active' : ''}`}
										onClick={() => setFormData((prev) => ({ ...prev, paymentMethod: 'cash' }))}
										aria-pressed={formData.paymentMethod === 'cash'}
									>
										<DollarSign size={15} strokeWidth={1.75} aria-hidden />
										Efectivo
									</button>
									<button
										type="button"
										className={`cash-dialog__pay-option${formData.paymentMethod === 'card' ? ' is-active' : ''}`}
										onClick={() => setFormData((prev) => ({ ...prev, paymentMethod: 'card' }))}
										aria-pressed={formData.paymentMethod === 'card'}
									>
										<CreditCard size={15} strokeWidth={1.75} aria-hidden />
										{isIncome ? 'Tarjeta / Transf.' : 'Tarjeta'}
									</button>
								</div>
								<p className="cash-dialog__field-hint">
									Solo los movimientos en <strong>efectivo</strong> afectan el arqueo físico.
								</p>
							</div>
						) : (
							<p className="cash-dialog__hint cash-dialog__hint--muted">
								Este retiro se registra solo en <strong>efectivo</strong> y reduce el balance esperado
								del turno.
							</p>
						)}

						{error ? (
							<p className="cash-dialog__error" role="alert">
								{error}
							</p>
						) : null}
					</div>

					<div className="cash-dialog__footer">
						<Button variant="outline" type="button" onClick={onClose} className="cash-dialog__btn cash-dialog__btn--ghost">
							Cancelar
						</Button>
						<Button variant="default" type="submit" className={submitClass}>
							{submitLabel}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default CashMovementModal;
