import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { createMoneyFormatter } from '@/shared/utils/money';
import { useManualOrder } from '../hooks/useManualOrder';
import { useOrderEdit } from '../hooks/useOrderEdit';
import { buildDeliveryAddressRecord, isLocalOpenSessionOrder, isOrderPaymentDeferred } from '@/shared/utils/orderUtils';
import { printOrderTicket } from '@/modules/cash/admin/utils/receiptPrinting';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { resolveEffectiveCountry } from '@/lib/geo/tenant-locale';
import { canOverrideDeliveryFee } from '../utils/deliveryFeePermissions';
import ManualOrderCatalog from './manual-order/ManualOrderCatalog';
import CloseTableModal from './CloseTableModal';
import ManualOrderCheckout, {
	DESKTOP_WIZARD_STEPS,
	MOBILE_WIZARD_STEPS,
	TABLET_WIZARD_STEPS,
	useManualOrderCheckoutFlow,
} from './manual-order/ManualOrderCheckout';
import ManualOrderCloseConfirm from './manual-order/ManualOrderCloseConfirm';
import useManualOrderBranchConfig from './manual-order/useManualOrderBranchConfig';
import { isOpenOrderSessionStatus } from '../hooks/manual-order/manualOrderShared';
import { ADMIN_MOBILE_MQ, ADMIN_TABLET_MQ } from '../constants/responsive';
import { Button } from "@/components/ui/button";
import { useLockBodyScroll } from '@/shared/hooks/useLockBodyScroll';
import {
	loadManualOrderDraft,
	saveManualOrderDraft,
	deleteManualOrderDraft,
} from '../services/manualOrderDrafts';
import { manualOrderV2Service } from '../services/manualOrderV2Service';

const ManualOrderModal = ({
	isOpen,
	onClose,
	products = [],
	categories = [],
	clients = [],
	editOrder = null,
	moveOrder = null,
	onOrderSaved,
	showNotify,
	branch,
	logoUrl,
	companyName,
	resyncOrderSale = null,
	openMesaMode = false,
	localOrderChannels = null,
}) => {
	const { userRole, userEmail, markOrderSessionPaid, orders, companyProfile } = useAdmin();
	useLockBodyScroll(isOpen);
	const canEditDeliveryFee = canOverrideDeliveryFee(userRole);
	const isEditMode = Boolean(editOrder?.id);
	const liveEditOrder = useMemo(() => {
		if (!editOrder?.id) return editOrder;
		return orders.find((o) => o.id === editOrder.id) ?? editOrder;
	}, [editOrder, orders]);
	const isLocalSessionEdit = isEditMode && isLocalOpenSessionOrder(liveEditOrder);
	const effectiveOpenMesaMode = openMesaMode || isLocalSessionEdit;
	// En venta rápida el método elegido determina automáticamente si se paga.
	// El selector explícito se conserva solo para las sesiones.
	const showOpenMesaPaymentChoice = !isEditMode && effectiveOpenMesaMode;

	const {
		branchDeliveryCfg,
		branchDeliveryCfgLoading,
		branchConfigError,
		manualOrderSettings,
		paymentMethods,
		cartUpsellCatalogs,
		retryBranchConfig,
	} =
		useManualOrderBranchConfig(isOpen, branch);
	const { formatMoney } = useMemo(() => createMoneyFormatter(branch, companyProfile), [branch, companyProfile]);

	const createHook = useManualOrder(
		showNotify,
		isEditMode ? undefined : onOrderSaved,
		onClose,
		branch,
		branchDeliveryCfg,
		userRole,
		openMesaMode,
		localOrderChannels,
		companyProfile,
		manualOrderSettings,
		paymentMethods,
		branchConfigError,
	);

	const editHook = useOrderEdit(
		showNotify,
		isEditMode ? onOrderSaved : undefined,
		onClose,
		branch,
		branchDeliveryCfg,
		isEditMode ? liveEditOrder : null,
		resyncOrderSale,
		userRole,
		resolveEffectiveCountry(branch, companyProfile),
	);

	const hookActions = isEditMode ? editHook : createHook;
	const {
		manualOrder, loading, rutValid, phoneValid,
		receiptFile, receiptPreview,
		updateClientName, updateCouponCode, couponPreview, updatePaymentType,
		updatePaymentMode, updateCashAmount, updateCardAmount, updateCashTendered, updateChargeNow,
		updatePaymentLines,
		handleRutChange,
		handlePhoneChange, handleFileChange, removeReceipt, addItem, updateQuantity, removeItem,
		updateItemNote,
		updateOrderType, updateLocalFulfillmentMode, updateMesaPartyMode, updateDeliveryAddress, updateDeliveryReference, updateDeliveryKm,
		updateDeliveryFee, updateDeliveryNamedAreaId,
		applyClientRecord,
		applySavedAddress,
		submitOrder, resetOrder, getInputStyle,
		restoreOrder, restoreReceipt, draftSnapshot,
		acknowledgeQuoteRevision,
	} = hookActions;
	const effectiveBranchConfigError = branchConfigError || manualOrder?.branchConfigError || null;

	const openMesaChargeNow = showOpenMesaPaymentChoice && Boolean(manualOrder?.charge_now);
	const showClassicPaymentStep = !effectiveOpenMesaMode && !isEditMode;

	const [orderStep, setOrderStep] = useState(1);
	const [isCompactNav, setIsCompactNav] = useState(() => {
		if (typeof window === 'undefined') return false;
		return window.matchMedia(ADMIN_MOBILE_MQ).matches;
	});
	const [isTabletNav, setIsTabletNav] = useState(() => {
		if (typeof window === 'undefined') return false;
		return window.matchMedia(ADMIN_TABLET_MQ).matches;
	});

	const [touchStart, setTouchStart] = useState(null);
	const [touchEnd, setTouchEnd] = useState(null);
	const [payModalOpen, setPayModalOpen] = useState(false);
	const [closePromptOpen, setClosePromptOpen] = useState(false);
	const [closeAction, setCloseAction] = useState(null);
	const wasOpenRef = useRef(false);
	const dialogRef = useRef(null);
	const closePromptRef = useRef(null);
	const closeButtonRef = useRef(null);
	const closePromptContinueRef = useRef(null);
	const closePromptTriggerRef = useRef(null);
	const shouldRestorePromptFocusRef = useRef(false);
	const previouslyFocusedRef = useRef(null);
	const draftSaveErrorShownRef = useRef(false);
	const draftIdentity = useMemo(() => ({
		companyId: branch?.company_id,
		branchId: branch?.id,
		userId: userEmail || 'authenticated-user',
		mode: openMesaMode ? 'session' : 'quick_sale',
	}), [branch?.company_id, branch?.id, userEmail, openMesaMode]);
	const isDirty = !isEditMode && Boolean(
		manualOrder?.items?.length
		|| String(manualOrder?.client_name ?? '').trim()
		|| String(manualOrder?.note ?? '').trim()
		|| String(manualOrder?.coupon_code ?? '').trim()
		|| receiptFile,
	);

	const sessionPaymentDeferred = isEditMode && isOrderPaymentDeferred(liveEditOrder);
	const canMarkPaidSession =
		isLocalSessionEdit &&
		Boolean(markOrderSessionPaid) &&
		sessionPaymentDeferred &&
		isOpenOrderSessionStatus(liveEditOrder?.status);

	const wizardStepCount = effectiveOpenMesaMode
		? (openMesaChargeNow && isCompactNav ? 3 : 2)
		: (isCompactNav
			? MOBILE_WIZARD_STEPS
			: (isTabletNav ? TABLET_WIZARD_STEPS : DESKTOP_WIZARD_STEPS));

	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			resetOrder();
			setOrderStep(1);
			setPayModalOpen(false);
			setClosePromptOpen(false);
			setCloseAction(null);
			if (!isEditMode && restoreOrder && draftIdentity.companyId && draftIdentity.branchId) {
				void loadManualOrderDraft(draftIdentity).then((saved) => {
					if (!saved?.draft || !window.confirm('Encontramos un borrador de pedido de las últimas 24 horas. ¿Quieres restaurarlo?')) return;
					restoreOrder(saved.draft);
					restoreReceipt?.(saved.receiptBlob);
					showNotify?.('Borrador restaurado. Los precios se validarán de nuevo.', 'info');
				});
			}
		}
		wasOpenRef.current = isOpen;
	}, [isOpen, resetOrder, restoreOrder, restoreReceipt, draftIdentity, isEditMode, showNotify]);

	useEffect(() => {
		if (!isOpen || isEditMode || !draftSnapshot || !draftIdentity.companyId || !draftIdentity.branchId) return undefined;
		const timer = window.setTimeout(() => {
			if (isDirty) void saveManualOrderDraft(draftIdentity, draftSnapshot, receiptFile).then(() => {
				draftSaveErrorShownRef.current = false;
			}).catch(() => {
				if (!draftSaveErrorShownRef.current) showNotify?.('No se pudo guardar el borrador local. Revisa el espacio disponible del navegador.', 'warning');
				draftSaveErrorShownRef.current = true;
			});
			else void deleteManualOrderDraft(draftIdentity).catch(() => {});
		}, 500);
		return () => window.clearTimeout(timer);
	}, [isOpen, isEditMode, draftIdentity, draftSnapshot, receiptFile, isDirty, showNotify]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia(ADMIN_MOBILE_MQ);
		const sync = () => setIsCompactNav(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia(ADMIN_TABLET_MQ);
		const sync = () => setIsTabletNav(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);

	useEffect(() => {
		setOrderStep((prev) => {
			const max = isCompactNav
				? MOBILE_WIZARD_STEPS
				: (isTabletNav ? TABLET_WIZARD_STEPS : DESKTOP_WIZARD_STEPS);
			if (prev <= max) return prev;
			if (!isCompactNav && prev === 3) return 2;
			return max;
		});
	}, [isCompactNav, isTabletNav]);

	const manualOrderForTicket = useMemo(() => {
		if (manualOrder.order_type !== 'delivery') return manualOrder;
		const nid = String(manualOrder.delivery_named_area_id ?? '').trim();
		const nlab = nid && branchDeliveryCfg?.namedAreas?.length
			? String(branchDeliveryCfg.namedAreas.find((z) => z.id === nid)?.name ?? '')
			: '';
		const da = buildDeliveryAddressRecord({
			rawAddress: manualOrder.delivery_address,
			deliveryReference: manualOrder.delivery_reference,
			namedAreaId: nid || null,
			namedAreaLabel: nlab || null,
		});
		return {
			...manualOrder,
			delivery_address: da,
			delivery_fee: Number(manualOrder.delivery_fee) || 0,
			channel: 'delivery',
		};
	}, [manualOrder, branchDeliveryCfg]);

	const ticketOpts = (variant) => ({
		variant,
		branchAddress: branch?.address ?? null,
		orderChannel: 'PDV',
		companyName: companyName ?? null,
	});

	const printManualKitchen = () => {
		printOrderTicket(manualOrderForTicket, branch?.name, logoUrl ?? null, ticketOpts('kitchen'));
	};

	const printManualCaja = () => {
		printOrderTicket(manualOrderForTicket, branch?.name, logoUrl ?? null, ticketOpts('cashier'));
	};

	const requestClose = React.useCallback(() => {
		if (loading || closeAction) return;
		if (isDirty) {
			const activeElement = document.activeElement;
			closePromptTriggerRef.current = activeElement instanceof HTMLElement && dialogRef.current?.contains(activeElement)
				? activeElement
				: closeButtonRef.current;
			shouldRestorePromptFocusRef.current = true;
			setClosePromptOpen(true);
			return;
		}
		onClose?.();
	}, [loading, closeAction, isDirty, onClose]);
	const dismissClosePrompt = React.useCallback(() => {
		if (closeAction) return;
		shouldRestorePromptFocusRef.current = true;
		setClosePromptOpen(false);
	}, [closeAction]);
	const recordAbandonment = React.useCallback(() => {
		if (!manualOrder?.v2Enabled) return;
		const localFulfillment = manualOrder?.order_type === 'delivery'
			? 'delivery'
			: (openMesaMode && manualOrder?.local_fulfillment_mode === 'mesa' ? 'table' : 'pickup');
		void manualOrderV2Service.recordMetric({
			branchId: branch?.id,
			eventName: 'abandoned',
			mode: openMesaMode ? 'session' : 'quick_sale',
			fulfillment: localFulfillment,
			step: orderStep,
		});
	}, [manualOrder?.v2Enabled, manualOrder?.order_type, manualOrder?.local_fulfillment_mode, openMesaMode, branch?.id, orderStep]);
	const closeWithDraft = React.useCallback(async () => {
		if (closeAction) return;
		setCloseAction('saving');
		try {
			await saveManualOrderDraft(draftIdentity, draftSnapshot, receiptFile);
			recordAbandonment();
			shouldRestorePromptFocusRef.current = false;
			setClosePromptOpen(false);
			onClose?.();
		} catch {
			showNotify?.('No se pudo guardar el borrador. El pedido seguirá abierto para evitar perder datos.', 'error');
		} finally {
			setCloseAction(null);
		}
	}, [closeAction, draftIdentity, draftSnapshot, receiptFile, onClose, showNotify, recordAbandonment]);
	const discardAndClose = React.useCallback(async () => {
		if (closeAction) return;
		setCloseAction('discarding');
		try {
			await deleteManualOrderDraft(draftIdentity);
			recordAbandonment();
			resetOrder();
			shouldRestorePromptFocusRef.current = false;
			setClosePromptOpen(false);
			onClose?.();
		} catch {
			showNotify?.('No se pudo descartar el borrador local. El pedido seguirá abierto.', 'error');
		} finally {
			setCloseAction(null);
		}
	}, [closeAction, resetOrder, draftIdentity, onClose, showNotify, recordAbandonment]);

	const submitAndClearDraft = React.useCallback(async () => {
		const savedOrder = await submitOrder?.();
		if (savedOrder && !isEditMode) await deleteManualOrderDraft(draftIdentity);
		return savedOrder;
	}, [submitOrder, isEditMode, draftIdentity]);

	useEffect(() => {
		if (!isOpen) return undefined;
		previouslyFocusedRef.current = document.activeElement;
		const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
		return () => {
			window.clearTimeout(focusTimer);
			previouslyFocusedRef.current?.focus?.();
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return undefined;
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				if (closePromptOpen) dismissClosePrompt(); else requestClose();
				return;
			}
			const trapRoot = closePromptOpen ? closePromptRef.current : dialogRef.current;
			if (event.key !== 'Tab' || !trapRoot) return;
			const focusable = [...trapRoot.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
				.filter((element) => element.getAttribute('aria-hidden') !== 'true');
			if (!focusable.length) { event.preventDefault(); trapRoot.focus(); return; }
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!trapRoot.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
			else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, requestClose, closePromptOpen, dismissClosePrompt]);

	useEffect(() => {
		if (!closePromptOpen) return undefined;
		const focusTimer = window.setTimeout(() => closePromptContinueRef.current?.focus(), 0);
		return () => {
			window.clearTimeout(focusTimer);
			if (!shouldRestorePromptFocusRef.current) return;
			const focusTarget = closePromptTriggerRef.current?.isConnected
				? closePromptTriggerRef.current
				: closeButtonRef.current;
			window.setTimeout(() => focusTarget?.focus?.(), 0);
		};
	}, [closePromptOpen]);

	const onTouchStart = (e) => {
		setTouchEnd(null);
		setTouchStart(e.targetTouches[0].clientY);
	};
	const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientY);
	const onTouchEnd = () => {
		if (!touchStart || !touchEnd) return;
		const distance = touchStart - touchEnd;
		if (distance < -50) requestClose();
	};

	const checkoutFlow = useManualOrderCheckoutFlow({
		manualOrder,
		couponPreview,
		branchDeliveryCfg,
		branchDeliveryCfgLoading,
		branchConfigError: effectiveBranchConfigError,
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
	});

	const canCancelOrder = Boolean(
		isEditMode &&
		moveOrder &&
		editOrder?.id &&
		String(editOrder?.status ?? '').toLowerCase() !== 'cancelled',
	);

	const handleMarkPaidConfirm = async (targetOrder, paymentPatch) => {
		if (!markOrderSessionPaid) return false;
		const result = await markOrderSessionPaid(targetOrder, paymentPatch);
		if (result) setPayModalOpen(false);
		return Boolean(result);
	};

	const handleCancelOrder = async () => {
		if (!canCancelOrder || loading) return;
		const status = String(editOrder?.status ?? '').toLowerCase();
		const stageLabel =
			status === 'pending' ? 'Pendiente' :
			status === 'active' ? 'En cocina' :
			status === 'completed' ? 'Listo' :
			status === 'picked_up' ? 'Entregado' :
			status;
		const refundWarning = '\n\nSi el pedido tiene venta registrada en caja, se aplicará una devolución automática.';
		const ok = typeof window !== 'undefined'
			? window.confirm(`Cancelar pedido #${editOrder.id} (estado: ${stageLabel})?${refundWarning}`)
			: true;
		if (!ok) return;
		try {
			await moveOrder(editOrder.id, 'cancelled');
			onClose?.();
		} catch {
			// moveOrder ya notifica errores
		}
	};

	if (!isOpen) return null;

	const catalogBlock = (
		<ManualOrderCatalog
			products={products}
			categories={categories}
			cartUpsellCatalogs={cartUpsellCatalogs}
			addItem={addItem}
			updateQuantity={updateQuantity}
			removeItem={removeItem}
			getQty={(id) => {
				const key = id == null ? '' : String(id);
				return manualOrder.items.find((i) => String(i.id) === key)?.quantity || 0;
			}}
		/>
	);

	if (typeof document === 'undefined') return null;
	return createPortal(
		<div className={`manual-order-portal-scope${closePromptOpen ? ' manual-order-portal-scope--confirming' : ''}`}>
			<div
				className="manual-order-overlay"
				onClick={requestClose}
				aria-hidden={closePromptOpen ? 'true' : undefined}
				inert={closePromptOpen ? true : undefined}
			>
				<div
					ref={dialogRef}
					role="dialog"
					aria-modal="true"
					aria-labelledby="manual-order-dialog-title"
					tabIndex={-1}
					className={`manual-order-container manual-order-wizard manual-order-step-${orderStep}${isCompactNav ? ' manual-order--mobile' : ''}${isTabletNav ? ' manual-order--tablet' : ''}${effectiveOpenMesaMode ? ' manual-order--open-mesa' : ''} flex h-full flex-col overflow-hidden`}
					onClick={e => e.stopPropagation()}
				>
					<div
						className="manual-order-drag-zone"
						onTouchStart={onTouchStart}
						onTouchMove={onTouchMove}
						onTouchEnd={onTouchEnd}
					/>

					<Button
						ref={closeButtonRef}
						variant="default"
						type="button"
						onClick={requestClose}
						className="manual-order-floating-close"
						title="Cerrar (Esc)"
						aria-label={loading ? 'Pedido en proceso' : 'Cerrar pedido manual'}
						disabled={loading || closePromptOpen}
						aria-hidden={closePromptOpen ? 'true' : undefined}
						tabIndex={closePromptOpen ? -1 : undefined}
					>
						<X size={18} strokeWidth={2.2} aria-hidden="true" />
						<span className="manual-order-floating-close__label">Cerrar</span>
					</Button>

					<ManualOrderCheckout
						orderStep={orderStep}
						setOrderStep={setOrderStep}
						wizardStepCount={wizardStepCount}
						isCompactNav={isCompactNav}
						isTabletNav={isTabletNav}
						isEditMode={isEditMode}
						effectiveOpenMesaMode={effectiveOpenMesaMode}
						showClassicPaymentStep={showClassicPaymentStep}
						showOpenMesaPaymentChoice={showOpenMesaPaymentChoice}
						openMesaChargeNow={openMesaChargeNow}
						loading={loading}
						manualOrder={manualOrder}
						liveEditOrder={liveEditOrder}
						clients={clients}
						branch={branch}
						branchDeliveryCfg={branchDeliveryCfg}
						branchDeliveryCfgLoading={branchDeliveryCfgLoading}
						branchConfigError={effectiveBranchConfigError}
						retryBranchConfig={retryBranchConfig}
						localOrderChannels={localOrderChannels}
						canEditDeliveryFee={canEditDeliveryFee}
						showNotify={showNotify}
						formatMoney={formatMoney}
						catalogBlock={catalogBlock}
						checkoutFlow={checkoutFlow}
						hookActions={{
							updateClientName,
							updateCouponCode,
							couponPreview,
							updatePaymentType,
							updatePaymentMode,
							updateCashAmount,
							updateCardAmount,
							updateCashTendered,
							updateChargeNow,
							updatePaymentLines,
							acknowledgeQuoteRevision,
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
						}}
						printManualKitchen={isEditMode ? printManualKitchen : null}
						printManualCaja={isEditMode ? printManualCaja : null}
						submitOrder={submitAndClearDraft}
						canCancelOrder={canCancelOrder}
						handleCancelOrder={handleCancelOrder}
						sessionPaymentDeferred={sessionPaymentDeferred}
						canMarkPaidSession={canMarkPaidSession}
						setPayModalOpen={setPayModalOpen}
					/>
					<span id="manual-order-dialog-title" className="sr-only">{openMesaMode ? 'Abrir sesión' : 'Venta rápida'}</span>
				</div>
			</div>
			{closePromptOpen ? (
				<ManualOrderCloseConfirm
					ref={closePromptRef}
					action={closeAction}
					continueButtonRef={closePromptContinueRef}
					onContinue={dismissClosePrompt}
					onSaveDraft={() => { void closeWithDraft(); }}
					onDiscard={() => { void discardAndClose(); }}
				/>
			) : null}
			{payModalOpen && liveEditOrder ? (
				<CloseTableModal
					isOpen
					intent="pay"
					stackAboveManualOrder
					onClose={() => setPayModalOpen(false)}
					order={liveEditOrder}
					branch={branch}
					showNotify={showNotify}
					onConfirm={handleMarkPaidConfirm}
				/>
			) : null}
		</div>,
		document.body,
	);
};

export default ManualOrderModal;
