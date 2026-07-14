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
import useManualOrderBranchConfig from './manual-order/useManualOrderBranchConfig';
import { isOpenOrderSessionStatus } from '../hooks/manual-order/manualOrderShared';
import { ADMIN_MOBILE_MQ, ADMIN_TABLET_MQ } from '../constants/responsive';
import { Button } from "@/components/ui/button";

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
	const { userRole, markOrderSessionPaid, orders, companyProfile } = useAdmin();
	const canEditDeliveryFee = canOverrideDeliveryFee(userRole);
	const isEditMode = Boolean(editOrder?.id);
	const liveEditOrder = useMemo(() => {
		if (!editOrder?.id) return editOrder;
		return orders.find((o) => o.id === editOrder.id) ?? editOrder;
	}, [editOrder, orders]);
	const isLocalSessionEdit = isEditMode && isLocalOpenSessionOrder(liveEditOrder);
	const effectiveOpenMesaMode = openMesaMode || isLocalSessionEdit;
	const showClassicPaymentStep = !effectiveOpenMesaMode;
	const showOpenMesaPaymentChoice = openMesaMode && !isEditMode;

	const { branchDeliveryCfg, branchDeliveryCfgLoading, cartUpsellCatalogs } =
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
		handleRutChange,
		handlePhoneChange, handleFileChange, removeReceipt, addItem, updateQuantity, removeItem,
		updateItemNote,
		updateOrderType, updateLocalFulfillmentMode, updateMesaPartyMode, updateDeliveryAddress, updateDeliveryReference, updateDeliveryKm,
		updateDeliveryFee, updateDeliveryNamedAreaId,
		applyClientRecord,
		applySavedAddress,
		submitOrder, resetOrder, getInputStyle,
	} = hookActions;

	const openMesaChargeNow = showOpenMesaPaymentChoice && Boolean(manualOrder?.charge_now);

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
	const wasOpenRef = useRef(false);

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
		}
		wasOpenRef.current = isOpen;
	}, [isOpen, resetOrder]);

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

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') onClose();
		};
		if (isOpen) window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	const onTouchStart = (e) => {
		setTouchEnd(null);
		setTouchStart(e.targetTouches[0].clientY);
	};
	const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientY);
	const onTouchEnd = () => {
		if (!touchStart || !touchEnd) return;
		const distance = touchStart - touchEnd;
		if (distance < -50) onClose();
	};

	const checkoutFlow = useManualOrderCheckoutFlow({
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
		<div className="manual-order-portal-scope">
			<div className="manual-order-overlay" onClick={onClose}>
				<div
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
						variant="default"
						type="button"
						onClick={onClose}
						className="manual-order-floating-close"
						title="Cerrar (Esc)"
						aria-label="Cerrar pedido manual"
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
						printManualKitchen={printManualKitchen}
						printManualCaja={printManualCaja}
						submitOrder={submitOrder}
						canCancelOrder={canCancelOrder}
						handleCancelOrder={handleCancelOrder}
						sessionPaymentDeferred={sessionPaymentDeferred}
						canMarkPaidSession={canMarkPaidSession}
						setPayModalOpen={setPayModalOpen}
					/>
				</div>
			</div>
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
