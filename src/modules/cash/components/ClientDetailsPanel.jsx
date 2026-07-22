import React, { useEffect, useMemo } from 'react';
import { X, Loader2, Image as ImageIcon, Upload, Calendar, DollarSign, Package, TrendingUp, Clock, Eye } from 'lucide-react';
import { getOrderPaymentDisplayLabel, isOnlineOrder } from '@/shared/utils/orderUtils';
import { useOrderMoney } from '@/modules/cash/hooks/useOrderMoney';
import { Button } from "@/components/ui/button";

const ClientDetailsPanel = ({
    selectedClient,
    setSelectedClient,
    clientHistoryLoading,
    selectedClientOrders,
    setReceiptModalOrder,
    onOrderClick,
    orderDetailOpen = false,
}) => {
    const { formatMoney, formatOrderAmount } = useOrderMoney();
    
    // --- 1. CIERRE CON ESCAPE (UX) ---
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && !orderDetailOpen) setSelectedClient(null);
        };
        if (selectedClient) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [selectedClient, setSelectedClient, orderDetailOpen]);

    // --- CÁLCULO DE MÉTRICAS CRM ---
    const stats = useMemo(() => {
        if (!selectedClient) return { avgTicket: 0, daysSince: 'N/A' };

        const totalSpent = selectedClient.total_spent || 0;
        const totalOrders = selectedClient.total_orders || 0;
        const avgTicket = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
        
        let daysSince = 'N/A';
        if (selectedClient.last_order_at) {
            const diff = new Date().getTime() - new Date(selectedClient.last_order_at).getTime();
            daysSince = Math.floor(diff / (1000 * 60 * 60 * 24));
        }
        return { avgTicket, daysSince };
    }, [selectedClient]);

    if (!selectedClient) return null;

    const clientName = selectedClient.name != null && String(selectedClient.name).trim() !== ''
        ? String(selectedClient.name)
        : 'Sin nombre';

    // --- 2. HELPERS DE RENDERIZADO (Limpieza) ---
    
    // Renderiza el botón de acción según estado del pago
    const renderPaymentAction = (order) => {
		if (order.payment_ref) {
            return (
                <div className="payment-actions" onClick={(e) => e.stopPropagation()}>
					<Button variant="default" type="button"
						className="btn-link-icon"
						title="Ver comprobante"
						onClick={(e) => { e.stopPropagation(); setReceiptModalOrder(order); }}
					>
						<ImageIcon size={14} /> <span>Ver</span>
					</Button>
                    <Button variant="default" 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setReceiptModalOrder(order);
                        }} 
                        className="btn-text-sm"
                    >
                        Cambiar
                    </Button>
                </div>
            );
        }
        
        // Solo mostrar botón de subir si es pago online (Transf., Zelle, Pago Móvil, etc.)
        if (isOnlineOrder(order)) {
            return (
                <Button variant="default" 
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setReceiptModalOrder(order);
                    }} 
                    className="btn-upload-sm"
                >
                    <Upload size={12} /> <span>Subir</span>
                </Button>
            );
        }
        
        return null; // Pago efectivo/tarjeta presencial no requiere comprobante
    };

    // Formateo seguro de fecha
    const formatDate = (dateString) => {
        try {
            return new Date(dateString).toLocaleDateString('es-CL', {
                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return 'Fecha inválida';
        }
    };

    // Badge de estado
    const getStatusBadge = (status) => {
        const statusMap = {
            'picked_up': { label: 'Entregado', class: 'success' },
            'completed': { label: 'Completado', class: 'success' },
            'active': { label: 'En Cocina', class: 'warning' },
            'cancelled': { label: 'Cancelado', class: 'danger' },
            'pending': { label: 'Pendiente', class: 'neutral' }
        };
        const config = statusMap[status] || statusMap['pending'];
        
        return <span className={`status-badge ${config.class}`}>{config.label}</span>;
    };

    return (
        <div className="admin-panel-overlay" onClick={() => setSelectedClient(null)}>
            <div 
                className="admin-side-panel glass animate-slide-in-right" 
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {/* HEADER */}
                <div className="admin-side-header">
                    <div className="client-profile">
                        <div className="avatar-placeholder">
                            {clientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="client-info">
                            <h3 className="client-name">{clientName}</h3>
                            <div className="client-meta">
                                <span className="meta-tag">RUT: {selectedClient.rut || 'N/A'}</span>
                                {selectedClient.phone && <span className="meta-tag">{selectedClient.phone}</span>}
                            </div>
                        </div>
                    </div>
                    <Button variant="default" 
                        onClick={() => setSelectedClient(null)} 
                        className="btn-close-sidepanel"
                        aria-label="Cerrar panel"
                    >
                        <X size={24} />
                    </Button>
                </div>

                {/* BODY */}
                <div className="admin-side-body">
                    
                    {/* KPIs */}
                    <div className="kpi-grid panel-kpi">
                        <div className="kpi-card side-kpi">
                            <div className="kpi-icon-sm"><DollarSign size={16}/></div>
                            <div>
                                <span className="kpi-label">GASTO TOTAL</span>
                                <span className="kpi-value text-accent-success">
                                    {formatMoney(selectedClient.total_spent || 0)}
                                </span>
                            </div>
                        </div>
                        <div className="kpi-card side-kpi">
                            <div className="kpi-icon-sm"><Package size={16}/></div>
                            <div>
                                <span className="kpi-label">PEDIDOS</span>
                                <span className="kpi-value">{selectedClient.total_orders || 0}</span>
                            </div>
                        </div>
                        <div className="kpi-card side-kpi">
                            <div className="kpi-icon-sm kpi-icon-trending"><TrendingUp size={16}/></div>
                            <div>
                                <span className="kpi-label">TICKET PROM.</span>
                                <span className="kpi-value kpi-value-light">
                                    {formatMoney(stats.avgTicket)}
                                </span>
                            </div>
                        </div>
                        <div className="kpi-card side-kpi">
                            <div className="kpi-icon-sm kpi-icon-inactive"><Clock size={16}/></div>
                            <div>
                                <span className="kpi-label">INACTIVIDAD</span>
                                <span className="kpi-value kpi-value-light">{stats.daysSince} días</span>
                            </div>
                        </div>
                    </div>

                    <div className="section-divider">
                        <h4 className="section-title">Historial de Compras</h4>
                    </div>

                    {clientHistoryLoading ? (
                        <div className="loading-state">
                            <Loader2 className="animate-spin" size={32} />
                            <span>Cargando historial...</span>
                        </div>
                    ) : (
                        <div className="history-list">
                            {selectedClientOrders.length === 0 ? (
                                <div className="empty-state">
                                    <Package size={40} className="opacity-20" />
                                    <p>No hay compras registradas</p>
                                </div>
                            ) : (
                                selectedClientOrders.map(order => {
                                    const orderTotal = formatOrderAmount({
                                        amountUsd: order.total ?? 0,
                                        order,
                                        paymentMethod: order.payment_method_specific,
                                    });
                                    const orderDateLabel = formatDate(order.created_at);
                                    return (
                                    <div
                                        key={order.id}
                                        className="history-card history-card--clickable"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onOrderClick?.(order)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onOrderClick?.(order);
                                            }
                                        }}
                                        aria-label={`Ver detalle del pedido del ${orderDateLabel}, total ${orderTotal}`}
                                    >
                                        
                                        <div className="history-card-header">
                                            <div className="date-badge">
                                                <Calendar size={12} />
                                                {formatDate(order.created_at)}
                                            </div>
                                            <span className="order-payment-method" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {getOrderPaymentDisplayLabel(order)}
                                            </span>
                                            <span className="order-total">
                                                {formatOrderAmount({
                                                    amountUsd: order.total ?? 0,
                                                    order,
                                                    paymentMethod: order.payment_method_specific,
                                                })}
                                            </span>
                                        </div>

                                        <div className="history-items">
                                            {(Array.isArray(order.items) ? order.items : []).length > 0 ? (
                                                order.items.map((item, idx) => (
                                                    <span key={idx} className="item-pill">
                                                        <b>{item.quantity}x</b> {item.name}
                                                    </span>
                                                ))
                                            ) : null}
                                        </div>

                                        <div className="history-card-footer">
                                            {getStatusBadge(order.status)}
                                            <span className="history-card__view-detail">
                                                <Eye size={12} aria-hidden /> Ver detalle
                                            </span>
                                            {renderPaymentAction(order)}
                                        </div>
                                        
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClientDetailsPanel;
