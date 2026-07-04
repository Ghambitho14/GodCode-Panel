import React from 'react';
import { CheckCircle2, ShoppingBag, Banknote } from 'lucide-react';
import { effectiveDeliveryPricingMode } from '@/lib/delivery-settings';
import { getLocalFulfillmentMode, isOpenMesaMeseroMode } from '../../hooks/manual-order/manualOrderShared';
import {
	validateCheckoutPayment,
	isLocalOpenSessionOrder,
	getPaymentLabel,
} from '@/shared/utils/orderUtils';
import { cn } from '@/lib/utils';
import ClientForm from './ClientForm';
import OrderSummary from './OrderSummary';
import PaymentDetails from './PaymentDetails';

export const DESKTOP_WIZARD_STEPS = 2;
export const MOBILE_WIZARD_STEPS = 3;

export const stepNavBackClass =
	'flex max-w-[40%] flex-1 items-center justify-center rounded-[4px] border border-gc-border bg-gc-muted px-3.5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-all';
export const stepNavNextClass =
	'flex min-h-[44px] flex-1 items-center justify-center rounded-[4px] bg-gc-accent px-6 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(79,91,255,0.35)] transition-all hover:-translate-y-0.5 hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border disabled:border-gc-border disabled:bg-gc-muted disabled:text-gc-text-muted disabled:shadow-none disabled:hover:translate-y-0';
export const confirmBtnClass =
	'manual-order-checkout-actions__confirm flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-[4px] border border-transparent bg-gc-accent px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white shadow-[0_4px_12px_rgba(79,91,255,0.35)] transition-[background,border-color,color,box-shadow,transform] enabled:hover:-translate-y-0.5 enabled:hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:border-gc-accent/40 disabled:bg-gc-accent/10 disabled:text-gc-accent disabled:shadow-none disabled:hover:translate-y-0';
export const checkoutColBase =
	'manual-order-checkout-col flex min-h-0 min-w-0 flex-col overflow-hidden';
export const checkoutColCard =
	'rounded-[4px] border border-gc-border bg-gc-card';
export const openMesaPaymentCardClass = 'rounded-[4px] border border-gc-border bg-gc-card p-5';
export const openMesaSectionTitleClass =
	'mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gc-text-muted';
export const openMesaToggleClass =
	'flex min-h-[44px] items-center justify-center rounded-[4px] border border-gc-border bg-gc-page px-2.5 py-3 text-xs font-semibold text-gc-text transition-colors sm:px-3';
export const openMesaToggleActiveClass = 'border-gc-accent bg-gc-accent/10 text-gc-accent';
export const openMesaHintClass =
	'mt-3 rounded-[4px] border border-gc-accent/25 bg-gc-accent/10 px-3 py-2.5 text-xs leading-relaxed text-gc-text-muted';
export const checkoutActionsClass =
	'manual-order-checkout-actions flex w-full min-w-0 flex-shrink-0 flex-col gap-2 border-t border-gc-border bg-gc-card pt-3';
export const checkoutBackBtnClass =
	'manual-order-checkout-actions__back flex min-h-[44px] w-full min-w-0 items-center justify-center rounded-[4px] border border-gc-border bg-gc-muted px-3 py-3 text-[13px] font-extrabold uppercase tracking-wide text-gc-text transition-colors';

export function useManualOrderCheckoutFlow({
	manualOrder,
	couponPreview,
	branchDeliveryCfg,
	branchDeliveryCfgLoading,
	effectiveOpenMesaMode,
	openMesaChargeNow,
	isEditMode,
	editOrder,
	rutValid,
	phoneValid,
	orderStep,
	setOrderStep,
	wizardStepCount,
	isCompactNav,
	showClassicPaymentStep,
	showNotify,
}) {
	const deliveryFeeAmt =
		manualOrder.order_type === 'delivery' ? (Number(manualOrder.delivery_fee) || 0) : 0;
	const couponDiscountApplied =
		couponPreview?.variant === 'success' && Number(couponPreview.discount) > 0
			? Math.min(manualOrder.total ?? 0, Number(couponPreview.discount))
			: 0;
	const totalToPay = Math.max(0, (manualOrder.total ?? 0) - couponDiscountApplied + deliveryFeeAmt);

	const openMesaFulfillment = effectiveOpenMesaMode ? getLocalFulfillmentMode(manualOrder) : null;
	const openMesaSubmitLabel = ({
		loading,
		isEditMode: edit,
		openMesaFulfillment: fulfillment,
	}) => {
		if (loading) return edit ? 'GUARDANDO…' : 'ABRIENDO…';
		if (edit) return 'GUARDAR CAMBIOS';
		return ({
			mesa: 'ABRIR MESA',
			retiro: 'ABRIR RETIRO',
			delivery: 'ABRIR DELIVERY',
		}[fulfillment ?? 'mesa'] ?? 'ABRIR MESA');
	};

	const isOpenMesaMesero = () =>
		effectiveOpenMesaMode && isOpenMesaMeseroMode(manualOrder);

	const hasOpenMesaClientName = () => {
		if (isOpenMesaMesero()) {
			return String(manualOrder.client_name ?? '').trim().length >= 2;
		}
		return (
			Boolean(String(manualOrder.selected_client_id ?? '').trim()) ||
			Boolean(String(manualOrder.client_name ?? '').trim()) ||
			manualOrder.order_type === 'delivery'
		);
	};

	const isOpenMesaContactValid = () => {
		if (!effectiveOpenMesaMode || isOpenMesaMesero()) return true;
		const exactRutLength = manualOrder.client_rut?.trim().length || 0;
		return exactRutLength > 0 && rutValid && phoneValid === true;
	};

	const isDeliveryValidForOrder = () => {
		if (manualOrder.order_type !== 'delivery') return true;
		if (branchDeliveryCfgLoading) return false;
		const addrOk = Boolean(manualOrder.delivery_address && manualOrder.delivery_address.trim().length >= 5);
		if (!branchDeliveryCfg) return addrOk;
		const pricing = effectiveDeliveryPricingMode(branchDeliveryCfg);
		if (pricing === 'named') {
			return String(manualOrder.delivery_named_area_id ?? '').trim().length > 0;
		}
		if (pricing === 'distance') return addrOk;
		return addrOk || String(manualOrder.delivery_named_area_id ?? '').trim().length > 0;
	};

	const isPaymentValid = () => {
		if (totalToPay <= 0) return true;
		return validateCheckoutPayment({
			payment_mode: manualOrder.payment_mode,
			payment_type: manualOrder.payment_type,
			cash_amount: manualOrder.cash_amount,
			card_amount: manualOrder.card_amount,
			cash_tendered: manualOrder.cash_tendered,
			totalToPay,
		}).valid;
	};

	const isFormValid = () => {
		const hasItems = manualOrder.items && manualOrder.items.length > 0;
		const hasClientName = effectiveOpenMesaMode
			? hasOpenMesaClientName()
			: Boolean(manualOrder.client_name && manualOrder.client_name.trim().length >= 3);
		const hasPaymentType = !!manualOrder.payment_type;
		const paymentOk = effectiveOpenMesaMode
			? (openMesaChargeNow ? isPaymentValid() && manualOrder.payment_type !== 'pendiente' : true)
			: isPaymentValid();

		if (isEditMode) {
			if (effectiveOpenMesaMode) {
				return hasItems && hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
			}
			return hasItems && hasClientName && hasPaymentType && paymentOk;
		}

		if (effectiveOpenMesaMode) {
			const base = hasItems && hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
			return openMesaChargeNow ? base && hasPaymentType && paymentOk : base;
		}

		const exactRutLength = manualOrder.client_rut?.trim().length || 0;
		const isRutRequiredAndValid = exactRutLength > 0 && rutValid;
		const isPhoneStrictlyValid = phoneValid === true;

		return hasItems && hasClientName && hasPaymentType && paymentOk && isRutRequiredAndValid && isPhoneStrictlyValid && isDeliveryValidForOrder();
	};

	const isClientStepValid = () => {
		const hasClientName = effectiveOpenMesaMode
			? hasOpenMesaClientName()
			: Boolean(manualOrder.client_name && manualOrder.client_name.trim().length >= 3);
		if (effectiveOpenMesaMode) {
			return hasClientName && isOpenMesaContactValid() && isDeliveryValidForOrder();
		}
		return Boolean(hasClientName && isDeliveryValidForOrder());
	};

	const hasCartItems = (manualOrder.items?.length ?? 0) > 0;
	const cartItemCount = (manualOrder.items ?? []).reduce((acc, i) => acc + (Number(i.quantity) || 1), 0);

	const goNextStep = () => {
		if (orderStep >= wizardStepCount) return;

		if (orderStep === 1) {
			if (!hasCartItems) {
				showNotify?.('Agrega al menos un producto al carrito.', 'warning');
				return;
			}
			setOrderStep(2);
			return;
		}

		if (isCompactNav && orderStep === 2 && showClassicPaymentStep) {
			if (!isClientStepValid()) {
				showNotify?.('Completa el nombre del cliente y los datos de entrega.', 'warning');
				return;
			}
			setOrderStep(3);
			return;
		}

		if (isCompactNav && orderStep === 2 && openMesaChargeNow) {
			if (!isClientStepValid()) {
				showNotify?.('Completa los datos del cliente.', 'warning');
				return;
			}
			setOrderStep(3);
		}
	};

	const goPrevStep = () => {
		setOrderStep((prev) => (prev > 1 ? prev - 1 : prev));
	};

	const stepLabels = effectiveOpenMesaMode
		? (isEditMode
			? (isCompactNav ? ['Productos', 'Mesa'] : ['Productos', 'Editar sesión'])
			: (openMesaChargeNow && isCompactNav
				? ['Productos', 'Cliente', 'Pago']
				: (isCompactNav ? ['Productos', 'Pedido'] : ['Productos', 'Pedido'])))
		: (isCompactNav
			? ['Productos', 'Cliente', 'Pago']
			: ['Productos', 'Cliente y pago']);

	return {
		totalToPay,
		couponDiscountApplied,
		deliveryFeeAmt,
		openMesaFulfillment,
		openMesaSubmitLabel,
		isFormValid,
		isClientStepValid,
		hasCartItems,
		cartItemCount,
		goNextStep,
		goPrevStep,
		stepLabels,
	};
}

export default function ManualOrderCheckout({
	orderStep,
	setOrderStep,
	wizardStepCount,
	isCompactNav,
	isEditMode,
	effectiveOpenMesaMode,
	showClassicPaymentStep,
	showOpenMesaPaymentChoice,
	openMesaChargeNow,
	loading,
	manualOrder,
	liveEditOrder,
	clients,
	branch,
	branchDeliveryCfg,
	branchDeliveryCfgLoading,
	localOrderChannels,
	canEditDeliveryFee,
	showNotify,
	formatMoney,
	catalogBlock,
	checkoutFlow,
	hookActions,
	printManualKitchen,
	printManualCaja,
	submitOrder,
	canCancelOrder,
	handleCancelOrder,
	sessionPaymentDeferred,
	canMarkPaidSession,
	setPayModalOpen,
}) {
	const {
		openMesaFulfillment,
		openMesaSubmitLabel: getOpenMesaSubmitLabel,
		isFormValid,
		isClientStepValid,
		hasCartItems,
		cartItemCount,
		goNextStep,
		goPrevStep,
		stepLabels,
	} = checkoutFlow;

	const openMesaSubmitLabel = getOpenMesaSubmitLabel({
		loading,
		isEditMode,
		openMesaFulfillment,
	});

	const {
		updateClientName,
		updateCouponCode,
		couponPreview,
		updatePaymentType,
		updatePaymentMode,
		updateCashAmount,
		updateCardAmount,
		updateCashTendered,
		updateChargeNow,
		handleRutChange,
		handlePhoneChange,
		handleFileChange,
		removeReceipt,
		updateQuantity,
		removeItem,
		updateItemNote,
		updateOrderType,
		updateLocalFulfillmentMode,
		updateMesaPartyMode,
		updateDeliveryAddress,
		updateDeliveryReference,
		updateDeliveryKm,
		updateDeliveryFee,
		updateDeliveryNamedAreaId,
		applyClientRecord,
		applySavedAddress,
		getInputStyle,
		rutValid,
		phoneValid,
		receiptFile,
		receiptPreview,
	} = hookActions;

	const clientSection = (
		<ClientForm
			manualOrder={manualOrder}
			branchDeliveryCfg={branchDeliveryCfg}
			clients={clients}
			updateOrderType={updateOrderType}
			updateLocalFulfillmentMode={updateLocalFulfillmentMode}
			updateMesaPartyMode={updateMesaPartyMode}
			updateDeliveryAddress={updateDeliveryAddress}
			updateDeliveryReference={updateDeliveryReference}
			updateDeliveryKm={updateDeliveryKm}
			updateDeliveryFee={updateDeliveryFee}
			updateDeliveryNamedAreaId={updateDeliveryNamedAreaId}
			updateClientName={updateClientName}
			applyClientRecord={applyClientRecord}
			applySavedAddress={applySavedAddress}
			handleRutChange={handleRutChange}
			handlePhoneChange={handlePhoneChange}
			rutValid={rutValid}
			phoneValid={phoneValid}
			getInputStyle={getInputStyle}
			branch={branch}
			showNotify={showNotify}
			canOverrideDeliveryFee={canEditDeliveryFee}
			openMesaMode={effectiveOpenMesaMode}
			branchDeliveryCfgLoading={branchDeliveryCfgLoading}
			enabledLocalChannels={localOrderChannels}
			isEditMode={isEditMode}
		/>
	);

	const showEditSaveOnFooter = isEditMode && orderStep === 1;

	const wizardNavButtons = (
		<div
			className={`manual-order-footer-nav${showEditSaveOnFooter ? ' manual-order-footer-nav--edit' : ''}`}
			role="group"
			aria-label="Navegación del pedido"
		>
			{orderStep > 1 ? (
				<button
					type="button"
					className={stepNavBackClass}
					onClick={goPrevStep}
				>
					ATRÁS
				</button>
			) : (
				<span className="manual-order-steps-nav__spacer" aria-hidden />
			)}
			{showEditSaveOnFooter ? (
				<>
					<button
						type="button"
						className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next-secondary"
						onClick={goNextStep}
						disabled={!hasCartItems}
					>
						Siguiente
					</button>
					<button
						type="button"
						className="manual-order-steps-nav__btn manual-order-steps-nav__btn--save"
						onClick={submitOrder}
						disabled={loading}
					>
						{loading ? 'GUARDANDO...' : 'Guardar cambios'}
					</button>
				</>
			) : orderStep === 1 ? (
				<button
					type="button"
					className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next manual-order-steps-nav__btn--next-step1"
					onClick={goNextStep}
					disabled={!hasCartItems}
				>
					Siguiente
				</button>
			) : null}
		</div>
	);

	const orderSummaryProps = {
		manualOrder,
		updateQuantity,
		removeItem,
		updateItemNote,
		printManualKitchen,
		printManualCaja,
		showCheckoutTotals: effectiveOpenMesaMode,
	};

	const paymentDetailsProps = {
		manualOrder,
		branch,
		branchDeliveryCfg,
		updateCouponCode,
		couponPreview,
		updatePaymentType,
		updatePaymentMode,
		updateCashAmount,
		updateCardAmount,
		updateCashTendered,
		receiptFile,
		receiptPreview,
		handleFileChange,
		removeReceipt,
		submitOrder,
		loading,
		isFormValid,
		goPrevStep,
		confirmLabel: openMesaChargeNow
			? openMesaSubmitLabel
			: (isEditMode ? 'GUARDAR CAMBIOS' : (effectiveOpenMesaMode ? openMesaSubmitLabel : 'CONFIRMAR PEDIDO')),
		onCancelOrder: canCancelOrder ? handleCancelOrder : null,
		isEditMode,
		hideCheckoutActions: false,
	};

	const paymentDetailsMobileProps = {
		...paymentDetailsProps,
		goPrevStep: null,
		hideCheckoutActions: true,
	};

	const openMesaPaymentChoiceSection = showOpenMesaPaymentChoice ? (
		<div className={openMesaPaymentCardClass}>
			<div className={openMesaSectionTitleClass}>
				<Banknote size={14} className="text-gc-accent" aria-hidden />
				Pago
			</div>
			<div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
				<button
					type="button"
					className={cn(
						openMesaToggleClass,
						!manualOrder.charge_now && openMesaToggleActiveClass,
					)}
					onClick={() => updateChargeNow?.(false)}
				>
					Pago pendiente
				</button>
				<button
					type="button"
					className={cn(
						openMesaToggleClass,
						manualOrder.charge_now && openMesaToggleActiveClass,
					)}
					onClick={() => updateChargeNow?.(true)}
				>
					Ya pagado
				</button>
			</div>
			<p className={openMesaHintClass}>
				{manualOrder.charge_now
					? 'Registra el método de pago al abrir la sesión.'
					: 'El cobro se registra al cerrar la mesa, retiro o delivery.'}
			</p>
		</div>
	) : null;

	const isLocalSessionEdit = isEditMode && isLocalOpenSessionOrder(liveEditOrder);

	const openMesaSessionPaymentSection = isEditMode && isLocalSessionEdit ? (
		<div className={openMesaPaymentCardClass}>
			<div className={openMesaSectionTitleClass}>
				<Banknote size={14} className="text-gc-accent" aria-hidden />
				Pago
			</div>
			{sessionPaymentDeferred ? (
				<p className={openMesaHintClass}>
					El cobro se registra al cerrar la mesa, retiro o delivery.
				</p>
			) : (
				<p className={openMesaHintClass}>
					{getPaymentLabel(liveEditOrder)}
				</p>
			)}
			{canMarkPaidSession ? (
				<button
					type="button"
					className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[4px] bg-gc-accent px-4 text-sm font-bold text-white transition-colors hover:bg-gc-accent-hover disabled:cursor-not-allowed disabled:opacity-55"
					onClick={(e) => {
						e.stopPropagation();
						setPayModalOpen(true);
					}}
				>
					Marcar pagado
				</button>
			) : null}
		</div>
	) : null;

	const mobileDock = isCompactNav ? (
		<div className="manual-order-mobile-dock" role="group" aria-label="Navegación del pedido">
			{orderStep === 1 ? (
				<>
					<div className="manual-order-mobile-cart-bar" aria-live="polite">
						<ShoppingBag size={18} aria-hidden />
						<span className="manual-order-mobile-cart-bar__text">
							{hasCartItems
								? `${cartItemCount} ${cartItemCount === 1 ? 'ítem' : 'ítems'} · ${formatMoney(manualOrder.total ?? 0)}`
								: 'Carrito vacío'}
						</span>
					</div>
					{showEditSaveOnFooter ? (
						<div className="manual-order-mobile-dock__actions manual-order-mobile-dock__actions--edit">
							<button
								type="button"
								className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next-secondary"
								onClick={goNextStep}
								disabled={!hasCartItems}
							>
								Siguiente
							</button>
							<button
								type="button"
								className="manual-order-steps-nav__btn manual-order-steps-nav__btn--save"
								onClick={submitOrder}
								disabled={loading}
							>
								{loading ? 'GUARDANDO...' : 'Guardar'}
							</button>
						</div>
					) : (
						<button
							type="button"
							className="manual-order-steps-nav__btn manual-order-steps-nav__btn--next manual-order-steps-nav__btn--next-step1 transition-all duration-200 hover:!-translate-y-0.5 active:!translate-y-0"
							onClick={goNextStep}
							disabled={!hasCartItems}
						>
							Siguiente
						</button>
					)}
				</>
			) : null}
			{orderStep === 2 ? (
				<div className="manual-order-mobile-dock__actions">
					<button
						type="button"
						className={stepNavBackClass}
						onClick={goPrevStep}
					>
						ATRÁS
					</button>
					{effectiveOpenMesaMode && !openMesaChargeNow ? (
						<button
							type="button"
							className={cn(confirmBtnClass, 'manual-order-mobile-dock__confirm')}
							onClick={submitOrder}
							disabled={loading || !isFormValid()}
						>
							{openMesaSubmitLabel}
						</button>
					) : effectiveOpenMesaMode && openMesaChargeNow ? (
						<button
							type="button"
							className={stepNavNextClass}
							onClick={goNextStep}
							disabled={!isClientStepValid()}
						>
							Siguiente
						</button>
					) : (
						<button
							type="button"
							className={stepNavNextClass}
							onClick={goNextStep}
							disabled={!isClientStepValid()}
						>
							Siguiente
						</button>
					)}
				</div>
			) : null}
			{orderStep === 3 && (showClassicPaymentStep || openMesaChargeNow) ? (
				<div className="manual-order-mobile-dock__actions manual-order-mobile-dock__actions--confirm">
					<button
						type="button"
						className={stepNavBackClass}
						onClick={goPrevStep}
					>
						ATRÁS
					</button>
					{canCancelOrder ? (
						<button
							type="button"
							className={cn(
								stepNavBackClass,
								'max-w-[36%] text-[10px] text-gc-danger',
							)}
							onClick={handleCancelOrder}
							disabled={loading}
						>
							Cancelar
						</button>
					) : null}
					<button
						type="button"
						className={cn(confirmBtnClass, 'manual-order-mobile-dock__confirm')}
						onClick={submitOrder}
						disabled={loading || !isFormValid()}
					>
						{loading ? 'PROCESANDO...' : (openMesaChargeNow ? openMesaSubmitLabel : (isEditMode ? 'GUARDAR' : 'CONFIRMAR'))}
					</button>
				</div>
			) : null}
		</div>
	) : null;

	const sidebarSection = (
		<div className={cn(
			'manual-order-sidebar flex min-h-0 w-full min-w-0 flex-shrink-0 flex-col gap-3 overflow-hidden !bg-gc-page lg:w-80',
			orderStep === 2 && '!border-gc-border',
		)}>
			{orderStep === 1 ? (
				<>
					<OrderSummary {...orderSummaryProps} />
					<div className="manual-order-footer relative z-10 flex-shrink-0">
						{showEditSaveOnFooter ? (
							<p className="manual-order-footer-edit-hint" role="status">
								Puedes guardar aquí sin pasar por los otros pasos.
							</p>
						) : null}
						{wizardNavButtons}
					</div>
				</>
			) : (
				<div className={cn(
					'manual-order-checkout-stage grid w-full max-w-[1280px] flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,1.15fr)_minmax(220px,1fr)_minmax(220px,1fr)]',
					effectiveOpenMesaMode && 'manual-order-checkout-stage--open-mesa',
				)}>
					<div className={cn(checkoutColBase, 'manual-order-checkout-col--client')}>
						<div className="manual-order-client-stage flex w-full flex-col gap-3.5">
							{clientSection}
						</div>
					</div>
					<div className={cn(checkoutColBase, 'manual-order-checkout-col--summary')}>
						<OrderSummary {...orderSummaryProps} />
					</div>
					{effectiveOpenMesaMode ? (
						<div className={cn(
							checkoutColBase,
							checkoutColCard,
							'manual-order-checkout-col--payment manual-order-checkout-col--payment-open overflow-hidden p-0',
						)}>
							<div className="manual-order-checkout-col__scroll flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-5">
								{openMesaPaymentChoiceSection}
								{openMesaSessionPaymentSection}
								{openMesaChargeNow ? (
									<PaymentDetails {...paymentDetailsProps} hideCheckoutActions embedded />
								) : null}
							</div>
							<div className={cn(checkoutActionsClass, 'px-5 pb-5')}>
								<button
									type="button"
									className={checkoutBackBtnClass}
									onClick={goPrevStep}
								>
									ATRÁS
								</button>
								<button
									type="button"
									className={confirmBtnClass}
									onClick={submitOrder}
									disabled={loading || !isFormValid()}
								>
									{openMesaSubmitLabel}
								</button>
							</div>
						</div>
					) : (
						<div className={cn(checkoutColBase, checkoutColCard, 'manual-order-checkout-col--payment gap-3.5 p-5')}>
							<PaymentDetails {...paymentDetailsProps} />
						</div>
					)}
				</div>
			)}
		</div>
	);

	return (
		<>
			<div
				className={`manual-order-steps-progress${isEditMode ? ' manual-order-steps-progress--editable' : ''}`}
				aria-label={`Paso ${orderStep} de ${wizardStepCount}`}
			>
				{stepLabels.map((label, idx) => {
					const n = idx + 1;
					const isActive = orderStep === n;
					const isDone = orderStep > n;
					const itemClassName = `manual-order-steps-progress__item ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}${isEditMode ? ' manual-order-steps-progress__item--clickable' : ''}`;

					if (isEditMode) {
						return (
							<button
								key={label}
								type="button"
								className={itemClassName}
								onClick={() => setOrderStep(n)}
								aria-current={isActive ? 'step' : undefined}
								aria-label={`Ir a ${label}`}
							>
								<span className="manual-order-steps-progress__dot">
									{isDone ? <CheckCircle2 size={14} /> : n}
								</span>
								<span className="manual-order-steps-progress__label">{label}</span>
							</button>
						);
					}

					return (
						<div key={label} className={itemClassName}>
							<span className="manual-order-steps-progress__dot">
								{isDone ? <CheckCircle2 size={14} /> : n}
							</span>
							<span className="manual-order-steps-progress__label">{label}</span>
						</div>
					);
				})}
			</div>

			{isCompactNav ? (
				<div className="manual-order-mobile-scene">
					{orderStep === 1 ? (
						<div className="manual-order-stage manual-order-mobile-stage--catalog">
							{catalogBlock}
						</div>
					) : null}
					{orderStep === 2 ? (
						<div className="manual-order-mobile-panel manual-order-mobile-panel--client flex flex-col gap-3">
							{effectiveOpenMesaMode ? (
								<>
									{clientSection}
									{openMesaPaymentChoiceSection}
									{openMesaSessionPaymentSection}
									<OrderSummary {...orderSummaryProps} />
								</>
							) : (
								clientSection
							)}
						</div>
					) : null}
					{orderStep === 3 && (showClassicPaymentStep || openMesaChargeNow) ? (
						<div className="manual-order-mobile-panel manual-order-mobile-panel--payment">
							<OrderSummary {...orderSummaryProps} />
							<PaymentDetails {...paymentDetailsMobileProps} />
						</div>
					) : null}
				</div>
			) : (
				<div className={cn(
					'manual-order-body flex min-h-0 flex-1 gap-5 p-5 !bg-gc-page',
				)}>
					<div className="manual-order-stage min-h-0 flex-1 overflow-hidden">
						{catalogBlock}
					</div>
					{sidebarSection}
				</div>
			)}

			{mobileDock}
		</>
	);
}
