import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Unlock, Lock, History, 
    Clock, Calendar, TrendingUp, TrendingDown,
    ArrowUpCircle, ArrowDownCircle, Eye, XCircle,
    DollarSign, CreditCard, Smartphone, ChevronRight, Truck,
    MapPin, Calculator,
} from 'lucide-react';
import { useAdmin } from '@/modules/cash/admin/pages/AdminProvider';
import { isValidBranchId } from '@/shared/utils/safeIds';
import CashShiftModal from './CashShiftModal';
import CashMovementModal from './CashMovementModal';
import CashShiftDetailModal from './CashShiftDetailModal';
import CashOrderDetailPanel from './CashOrderDetailPanel';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { getPaymentLabel, getOrderTileKind } from '@/shared/utils/orderUtils';
import AdminIconSlot from '../AdminIconSlot';
import PickupBagIcon from '../PickupBagIcon';
import TableRestaurantIcon from '../TableRestaurantIcon';
import DeliveryMotoIcon from '../DeliveryMotoIcon';
import ReportPeriodSelect from '../ReportPeriodSelect';
import {
    getCashShiftHistoryPeriodOptions,
    isInReportRange,
    resolveReportPeriodRange,
} from '../../utils/reportPeriodRange';
import { getOrderForMovement } from '../../utils/getOrderForMovement';
import { Button } from "@/components/ui/button";

const CASH_SHIFT_HISTORY_PERIOD_OPTIONS = getCashShiftHistoryPeriodOptions();

function RecentMovementIcon({ type, order, isCancel }) {
    if (isCancel) return <XCircle size={16} aria-hidden />;

    const linkedOrder = order && (type === 'sale' || type === 'cancel' || type === 'expense');
    if (linkedOrder) {
        const kind = getOrderTileKind(order);
        if (kind === 'moto') return <DeliveryMotoIcon size={16} aria-hidden />;
        if (kind === 'mesa') return <TableRestaurantIcon size={16} aria-hidden />;
        return <PickupBagIcon size={16} aria-hidden />;
    }

    if (type === 'expense') return <ArrowDownCircle size={16} aria-hidden />;
    if (type === 'income') return <ArrowUpCircle size={16} aria-hidden />;
    return <ArrowUpCircle size={16} aria-hidden />;
}

const ElapsedTime = ({ since }) => {
    const [elapsed, setElapsed] = useState('');
    useEffect(() => {
        const calc = () => {
            const diff = Date.now() - new Date(since).getTime();
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
        };
        calc();
        const id = setInterval(calc, 60000);
        return () => clearInterval(id);
    }, [since]);
    return <span>{elapsed}</span>;
};

const CashManager = ({
    showNotify,
    selectedBranchId,
    selectedBranch = null,
    orders = [],
    logoUrl = null,
    companyName = null,
}) => {
    const { cashSystem, companyProfile } = useAdmin();
    const { formatMoney: fmt } = useBranchMoney();
    const { formatOrderAmount } = useOrderMoney();
    const {
        activeShift, loading: loadingSystem, movements,
        openShift, closeShift, addManualMovement,
        getPastShifts, getTotals,
    } = cashSystem;

    const [pastShifts, setPastShifts] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [viewingShift, setViewingShift] = useState(null);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    /** @type {'income' | 'cash_withdrawal'} */
    const [movementModalVariant, setMovementModalVariant] = useState('income');
    const [filterPeriod, setFilterPeriod] = useState('30');
    const [selectedMovementOrder, setSelectedMovementOrder] = useState(null);

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const data = await getPastShifts();
            setPastShifts(data || []);
        } catch {
            showNotify('Error al cargar historial', 'error');
        } finally {
            setLoadingHistory(false);
        }
    }, [getPastShifts, showNotify]);

    useEffect(() => { loadHistory(); }, [loadHistory, activeShift]);

    const totals = useMemo(() => getTotals(movements), [movements, getTotals]);
    const expectedCashBalance =
        (Number(activeShift?.opening_balance) || 0)
        + (Number(totals.cashBalanceDelta) || 0);
    const deliveryNet = Math.max(
        0,
        (Number(totals.deliveryCollected) || 0) - (Number(totals.deliveryRefunded) || 0)
    );
    const deliveryPendingToPay = Math.max(
        0,
        deliveryNet - (Number(totals.deliveryPaidToCourier) || 0)
    );

    const salesCount = useMemo(() => movements.filter(m => m.type === 'sale').length, [movements]);
    const movementCount = movements.length;

    const [shiftHistoryAnchorDate] = useState(() => new Date());
    const shiftHistoryRange = useMemo(
        () => resolveReportPeriodRange(filterPeriod, shiftHistoryAnchorDate),
        [filterPeriod, shiftHistoryAnchorDate],
    );

    const filteredShifts = useMemo(() => {
        return pastShifts.filter((s) => {
            if (!s?.closed_at) return false;
            return isInReportRange(new Date(s.closed_at), shiftHistoryRange);
        });
    }, [pastShifts, shiftHistoryRange]);

    const cancelledOrdersInShift = useMemo(() => {
        if (!activeShift || !selectedBranchId || selectedBranchId === 'all') return [];
        const openedAt = activeShift.opened_at ? new Date(activeShift.opened_at).getTime() : null;
        if (!openedAt) return [];
        return (orders || [])
            .filter((o) => o?.status === 'cancelled' && o?.branch_id === selectedBranchId && new Date(o.created_at).getTime() >= openedAt)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [activeShift, selectedBranchId, orders]);

    const recentMovements = useMemo(() => {
        const cancelled = (cancelledOrdersInShift || []).map((order) => ({
            id: `cancel-${order.id}`,
            type: 'cancel',
            orderId: order.id,
            description: `Pedido #${String(order.id).slice(-4)} cancelado`,
            created_at: order.created_at,
            amount: 0,
        }));
        return [...(movements || []), ...cancelled]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 8);
    }, [movements, cancelledOrdersInShift]);

    const handleMovementClick = useCallback((m) => {
        const order = getOrderForMovement(m, orders);
        if (order) setSelectedMovementOrder(order);
    }, [orders]);

    if (loadingSystem) return (
        <div className="cash-loading">
            <div className="cash-spinner" />
            <span>Cargando caja...</span>
        </div>
    );

    if (!selectedBranchId || selectedBranchId === 'all' || !isValidBranchId(selectedBranchId)) {
        return (
            <div className="cash-empty-state">
                <div className="cash-empty-icon"><MapPin size={48} /></div>
                <h3>Selecciona una sucursal</h3>
                <p>Elige una sucursal en el menú superior para gestionar la caja de ese local.</p>
            </div>
        );
    }

    return (
        <div className="cash-container animate-fade">
            {/* HEADER */}
            <header className="cash-header">
                <div className="cash-header-left">
                    <AdminIconSlot Icon={Calculator} slotSize="lg" tone="accent" className="cash-header-brand-icon" />
                    {activeShift ? (
                        <div className="cash-header-status">
                            <span className="cash-pulse" />
                            Turno activo · <ElapsedTime since={activeShift.opened_at} />
                        </div>
                    ) : null}
                </div>
                <div className="cash-header-actions">
                    {activeShift ? (
                        <>
                            <Button variant="default"
                                type="button"
                                className="btn-income"
                                onClick={() => {
                                    setMovementModalVariant('income');
                                    setIsMovementModalOpen(true);
                                }}
                            >
                                <ArrowUpCircle size={16} /> Ingreso
                            </Button>
                            <Button variant="default"
                                type="button"
                                className="btn-expense btn-cash-withdrawal"
                                onClick={() => {
                                    setMovementModalVariant('cash_withdrawal');
                                    setIsMovementModalOpen(true);
                                }}
                                title="Retiro de efectivo del turno (compras menores, vuelto). Gastos grandes: Ventas → Gastos del local."
                            >
                                <ArrowDownCircle size={16} /> Sacar efectivo
                            </Button>
                            <Button variant="destructive" type="button" className="" onClick={() => setIsShiftModalOpen(true)}>
                                <Lock size={16} /> Cerrar caja
                            </Button>
                        </>
                    ) : (
                        <Button variant="default" type="button" className="btn-open-shift" onClick={() => setIsShiftModalOpen(true)}>
                            <Unlock size={18} /> Abrir caja
                        </Button>
                    )}
                </div>
            </header>

            {/* TURNO ACTIVO: KPI DASHBOARD */}
            {activeShift ? (
                <section className="cash-section">
                    <div className="cash-kpi-grid">
                        <div className="cash-kpi balance">
                            <div className="cash-kpi-header">
                                <AdminIconSlot
                                    Icon={DollarSign}
                                    slotSize="sm"
                                    style={{
                                        color: 'var(--c-balance)',
                                        background: 'rgba(2, 132, 199, 0.12)',
                                        borderColor: 'rgba(2, 132, 199, 0.28)',
                                    }}
                                />
                                <span>Balance Esperado</span>
                            </div>
                            <div className="cash-kpi-value">{fmt(expectedCashBalance)}</div>
                            <div className="cash-kpi-sub">Base: {fmt(activeShift.opening_balance || 0)}</div>
                        </div>

                        <div className="cash-kpi income">
                            <div className="cash-kpi-header">
                                <AdminIconSlot
                                    Icon={TrendingUp}
                                    slotSize="sm"
                                    style={{
                                        color: 'var(--c-income)',
                                        background: 'rgba(37, 211, 102, 0.12)',
                                        borderColor: 'rgba(37, 211, 102, 0.28)',
                                    }}
                                />
                                <span>Ingresos</span>
                            </div>
                            <div className="cash-kpi-value">{fmt(totals.income)}</div>
                            <div className="cash-kpi-sub">{salesCount} ventas · {movementCount - salesCount > 0 ? `${movements.filter(m => m.type === 'income').length} manuales` : 'sin manuales'}</div>
                        </div>

                        <div className="cash-kpi expense">
                            <div className="cash-kpi-header">
                                <AdminIconSlot
                                    Icon={TrendingDown}
                                    slotSize="sm"
                                    style={{
                                        color: 'var(--c-expense)',
                                        background: 'rgba(220, 38, 38, 0.1)',
                                        borderColor: 'rgba(220, 38, 38, 0.28)',
                                    }}
                                />
                                <span>Retiros de efectivo</span>
                            </div>
                            <div className="cash-kpi-value">{fmt(Number(totals.cashWithdrawals) || 0)}</div>
                            <div className="cash-kpi-sub">
                                {Number(totals.cashWithdrawalCount) || 0} retiro
                                {(Number(totals.cashWithdrawalCount) || 0) === 1 ? '' : 's'}
                                {(totals.operatingExpenseCount ?? 0) > 0
                                    ? ` · Gastos operativos: ${totals.operatingExpenseCount} (${fmt(totals.operatingExpenses ?? 0)})`
                                    : ''}
                                {(totals.refundExpenseCount ?? 0) > 0
                                    ? ` · Devoluciones: ${totals.refundExpenseCount} (${fmt(totals.refundExpenses ?? 0)})`
                                    : ''}
                            </div>
                        </div>

                        <div className="cash-kpi methods">
                            <div className="cash-kpi-header">
                                <AdminIconSlot
                                    Icon={CreditCard}
                                    slotSize="sm"
                                    style={{
                                        color: 'var(--c-text-secondary)',
                                        background: 'var(--admin-icon-bg)',
                                        borderColor: 'var(--admin-border)',
                                    }}
                                />
                                <span>Cobros por método</span>
                            </div>
                            <div className="cash-methods-grid">
                                <div className="cash-method-row">
                                    <AdminIconSlot Icon={DollarSign} slotSize="xxs" style={{ color: 'var(--c-income)', background: 'rgba(37, 211, 102, 0.1)', borderColor: 'rgba(37, 211, 102, 0.22)' }} />
                                    <span>Efectivo</span>
                                    <strong>{fmt(totals.cash)}</strong>
                                </div>
                                <div className="cash-method-row">
                                    <AdminIconSlot Icon={CreditCard} slotSize="xxs" style={{ color: '#3b82f6', background: 'rgba(37, 99, 235, 0.08)', borderColor: 'rgba(37, 99, 235, 0.22)' }} />
                                    <span>Tarjeta</span>
                                    <strong>{fmt(totals.card)}</strong>
                                </div>
                                <div className="cash-method-row">
                                    <AdminIconSlot Icon={Smartphone} slotSize="xxs" style={{ color: '#7c3aed', background: 'rgba(124, 58, 237, 0.08)', borderColor: 'rgba(124, 58, 237, 0.22)' }} />
                                    <span>Transf.</span>
                                    <strong>{fmt(totals.online)}</strong>
                                </div>
                            </div>
                            <div className="cash-kpi-sub">Solo ventas de pedidos</div>
                        </div>

                        <div className="cash-kpi delivery">
                            <div className="cash-kpi-header">
                                <AdminIconSlot
                                    Icon={Truck}
                                    slotSize="sm"
                                    style={{
                                        color: 'var(--fulfillment-delivery-fg)',
                                        background: 'var(--fulfillment-delivery-bg)',
                                        borderColor: 'var(--fulfillment-delivery-border)',
                                    }}
                                />
                                <span>Delivery a pagar</span>
                            </div>
                            <div className="cash-kpi-value">{fmt(deliveryPendingToPay)}</div>
                            <div className="cash-kpi-sub">
                                Cobrado: {fmt(deliveryNet)} · Pagado: {fmt(totals.deliveryPaidToCourier || 0)}
                            </div>
                        </div>
                    </div>

                    {/* ÚLTIMOS MOVIMIENTOS */}
                    {recentMovements.length > 0 && (
                        <div className="cash-recent">
                            <div className="cash-recent-header">
                                <h4><AdminIconSlot Icon={Clock} slotSize="sm" tone="accent" /> Últimos movimientos</h4>
                                <Button variant="default" className="btn-text" onClick={() => setViewingShift(activeShift)}>
                                    Ver todos <ChevronRight size={14} />
                                </Button>
                            </div>
                            <div className="cash-recent-list">
                                {recentMovements.map(m => {
                                    const order = getOrderForMovement(m, orders);
                                    const clickable = Boolean(order);
                                    const isCancel = m.type === 'cancel';
                                    const paymentMethod = m.payment_method ?? order?.payment_type;
                                    const fulfillmentKind = order && !isCancel ? getOrderTileKind(order) : null;
                                    const paymentLabel = order ? getPaymentLabel(order) : (paymentMethod === 'cash' ? 'Efectivo' : paymentMethod === 'card' || paymentMethod === 'tarjeta' ? 'Tarjeta' : 'Transf.');
                                    return (
                                        <div
                                            key={m.id}
                                            className={`cash-recent-item ${clickable ? 'cash-recent-item-clickable' : ''} ${isCancel ? 'cash-recent-item--cancelled' : ''}${fulfillmentKind ? ` cash-recent-item--fulfillment-${fulfillmentKind}` : ''}`}
                                            onClick={clickable ? () => handleMovementClick(m) : undefined}
                                            onKeyDown={
                                                clickable
                                                    ? (e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                handleMovementClick(m);
                                                            }
                                                        }
                                                    : undefined
                                            }
                                            role={clickable ? 'button' : undefined}
                                            tabIndex={clickable ? 0 : -1}
                                        >
                                            <div
                                                className={`cash-recent-icon ${m.type}${fulfillmentKind ? ` cash-recent-icon--${fulfillmentKind}` : ''}${isCancel ? ' cash-recent-icon--cancel' : ''}`}
                                            >
                                                <RecentMovementIcon type={m.type} order={order} isCancel={isCancel} />
                                            </div>
                                            <div className="cash-recent-info">
                                                <span className="cash-recent-desc">{m.description || (m.type === 'sale' ? 'Venta' : m.type === 'income' ? 'Ingreso' : m.type === 'cancel' ? 'Cancelado' : 'Egreso')}</span>
                                                <span className="cash-recent-time">
                                                    {new Date(m.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                                    {isCancel ? ' · Cancelado' : ''}
                                                    {!isCancel && order && Number(order.delivery_fee) > 0
                                                        ? ` · Envío ${formatOrderAmount({
                                                            amountUsd: Number(order.delivery_fee),
                                                            order,
                                                            paymentMethod: order.payment_method_specific,
                                                        })}`
                                                        : ''}
                                                </span>
                                            </div>
                                            {m.type === 'cancel' ? (
                                                <span className="cash-recent-amount cash-recent-amount-cancel">Cancelado</span>
                                            ) : (
                                                <div className="cash-recent-amount-col">
                                                    <span className={`cash-recent-amount ${m.type === 'expense' ? 'negative' : 'positive'}`}>
                                                        {m.type === 'expense' ? '-' : '+'}
                                                        {order && m.type === 'sale'
                                                            ? formatOrderAmount({
                                                                amountUsd: m.amount,
                                                                order,
                                                                paymentMethod: order.payment_method_specific,
                                                            })
                                                            : fmt(m.amount)}
                                                    </span>
                                                    {paymentLabel ? (
                                                        <span className="cash-recent-pay-method">{paymentLabel}</span>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </section>
            ) : (
                <section className="cash-empty-state">
                    <div className="cash-empty-icon">
                        <Lock size={48} />
                    </div>
                    <h3>Caja cerrada</h3>
                    <p>Abre un turno para comenzar a registrar ventas e ingresos.</p>
                    <Button variant="default" className="" onClick={() => setIsShiftModalOpen(true)}>
                        <Unlock size={18} /> Abrir caja
                    </Button>
                </section>
            )}

            {/* HISTORIAL DE TURNOS */}
            <section className="cash-section">
                <div className="cash-section-header">
                    <h3 className="cash-section-title cash-section-title--with-icon"><AdminIconSlot Icon={History} slotSize="sm" tone="accent" /> Historial de turnos</h3>
                    <div className="cash-filters-inline">
                        <ReportPeriodSelect
                            value={filterPeriod}
                            onChange={setFilterPeriod}
                            options={CASH_SHIFT_HISTORY_PERIOD_OPTIONS}
                            aria-label="Período del historial de turnos"
                            dateInputAriaLabel="Fecha del historial de turnos"
                            icon={<Calendar size={18} strokeWidth={1.65} className="text-accent" />}
                        />
                    </div>
                </div>

                {loadingHistory ? (
                    <div className="cash-history-loading">Cargando historial...</div>
                ) : filteredShifts.length === 0 ? (
                    <div className="cash-history-empty">
                        <Calendar size={32} />
                        <span>No hay turnos cerrados en este período.</span>
                    </div>
                ) : (
                    <div className="cash-history-list">
                        {filteredShifts.map(shift => {
                            const diff = shift.difference ?? ((shift.actual_balance || 0) - (shift.expected_balance || 0));
                            const duration = shift.closed_at && shift.opened_at
                                ? Math.round((new Date(shift.closed_at) - new Date(shift.opened_at)) / 60000)
                                : 0;
                            const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${duration}m`;

                            return (
                                <div key={shift.id} className="cash-history-card" onClick={() => setViewingShift(shift)}>
                                    <div className="cash-history-date">
                                        <span className="cash-history-day">
                                            {new Date(shift.opened_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                        </span>
                                        <span className="cash-history-hours">
                                            {new Date(shift.opened_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                            {' → '}
                                            {new Date(shift.closed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="cash-history-duration">
                                            <Clock size={12} /> {durationStr}
                                        </span>
                                        <span className="cash-history-orders">
                                            {Number(shift.orders_count ?? 0)} {Number(shift.orders_count ?? 0) === 1 ? 'pedido' : 'pedidos'}
                                        </span>
                                    </div>

                                    <div className="cash-history-amounts">
                                        <div className="cash-history-col">
                                            <label>Sistema</label>
                                            <span>{fmt(shift.expected_balance)}</span>
                                        </div>
                                        <div className="cash-history-col">
                                            <label>Conteo</label>
                                            <span>{fmt(shift.actual_balance)}</span>
                                        </div>
                                        <div className="cash-history-col">
                                            <label>Diferencia</label>
                                            <span className={diff >= 0 ? 'diff-positive' : 'diff-negative'}>
                                                {diff >= 0 ? '+' : ''}{fmt(Math.abs(diff))}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="cash-history-arrow">
                                        <Eye size={16} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* MODALES */}
            <CashShiftModal
                isOpen={isShiftModalOpen}
                onClose={() => setIsShiftModalOpen(false)}
                type={activeShift ? 'close' : 'open'}
                activeShift={activeShift}
                movements={movements}
                orders={orders}
                getTotals={getTotals}
                onConfirm={activeShift ? closeShift : openShift}
            />

            <CashMovementModal
                isOpen={isMovementModalOpen}
                onClose={() => setIsMovementModalOpen(false)}
                variant={movementModalVariant}
                onConfirm={async (type, amount, description, paymentMethod) => {
                    const opts =
                        movementModalVariant === 'cash_withdrawal'
                            ? {
                                  expenseKind: 'cash_withdrawal',
                                  successMessage: 'Retiro de efectivo registrado',
                              }
                            : {};
                    return addManualMovement(type, amount, description, paymentMethod, opts);
                }}
            />

            <CashShiftDetailModal
                isOpen={!!viewingShift}
                onClose={() => setViewingShift(null)}
                shift={viewingShift}
                getTotals={getTotals}
                orders={orders}
                onMovementClick={handleMovementClick}
            />

            <CashOrderDetailPanel
                order={selectedMovementOrder}
                branch={selectedBranch}
                showNotify={showNotify}
                logoUrl={logoUrl}
                companyName={companyName}
                companyProfile={companyProfile}
                onClose={() => setSelectedMovementOrder(null)}
            />
        </div>
    );
};

export default CashManager;
