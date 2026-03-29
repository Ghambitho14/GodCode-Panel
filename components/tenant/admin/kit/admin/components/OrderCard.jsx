"use client";

import React, { useState } from 'react';
import { Clock, XCircle, Upload, ImageIcon, Printer, Crown, MessageCircle, Eye, Truck, Copy } from 'lucide-react';
import { formatTimeElapsed } from '../../shared/utils/formatters';
import { buildOrderWhatsAppShareText, getPaymentLabel, isOrderDelivery } from '../../shared/utils/orderUtils';
import { printOrderTicket } from '../utils/receiptPrinting';
import OrderDetailModal from './OrderDetailModal';

const OrderCard = ({ order, queueIndex, moveOrder, setReceiptModalOrder, branch, clients, logoUrl, showNotify }) => {
    const [detailOpen, setDetailOpen] = useState(false);
    const isDelivery = isOrderDelivery(order);
    const handleMoveToKitchen = (e) => {
        e.stopPropagation();
        printOrderTicket(order, branch?.name, logoUrl ?? null);
        moveOrder(order.id, 'active');
    };

    const handleReprint = (e) => {
        e.stopPropagation();
        printOrderTicket(order, branch?.name, logoUrl ?? null);
    };

    const handleCopyShare = async (e) => {
        e.stopPropagation();
        const text = buildOrderWhatsAppShareText(order, branch?.name);
        try {
            await navigator.clipboard.writeText(text);
            showNotify?.('Resumen del pedido copiado. Pégalo en WhatsApp.');
        } catch {
            showNotify?.('No se pudo copiar. Copia manualmente el texto del pedido.', 'error');
        }
    };

    // Lógica VIP: Buscar cliente y verificar si tiene más de 5 pedidos
    const clientData = clients?.find(c => c.id === order.client_id);
    const isVip = clientData?.total_orders >= 5;

    return (
        <div className={`kanban-card glass animate-slide-up ${order.status === 'pending' ? 'urgent-pulse' : ''}`}>
            <div className="kanban-card-top">
            {/* ENCABEZADO */}
            <div className="card-header-row">
                <span className="order-time" title={new Date(order.created_at).toLocaleString()}>
                    {queueIndex != null ? (
                        <span className="order-queue-badge" title={`Pedido ${queueIndex} en la cola (más antiguo primero)`}>
                            {queueIndex}
                        </span>
                    ) : null}
                    <Clock size={12} />
                    {formatTimeElapsed(order.created_at)}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button type="button" onClick={handleCopyShare} className="btn-icon-xs" title="Copiar resumen para WhatsApp" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                        <Copy size={14} />
                    </button>
                    <button type="button" onClick={handleReprint} className="btn-icon-xs" title="Imprimir Comanda" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
                        <Printer size={14} />
                    </button>
                <span className={`payment-badge ${order.payment_type === 'online' ? 'online' : ''}`}>
                    {getPaymentLabel(order)}
                </span>
                </div>
            </div>

            <div className="card-kanban-meta-row">
                {isDelivery ? (
                    <span className="order-fulfillment-pill order-fulfillment-pill--delivery" title="Envío a domicilio">
                        <Truck size={12} aria-hidden />
                        Delivery
                    </span>
                ) : null}
                <button
                    type="button"
                    className="order-detail-trigger"
                    onClick={(e) => {
                        e.stopPropagation();
                        setDetailOpen(true);
                    }}
                >
                    <Eye size={14} aria-hidden />
                    Ver detalles
                </button>
            </div>

            {/* CLIENTE */}
            <div className="card-client">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <h4 className="card-client-name">{order.client_name}</h4>
                    {isVip && (
                        <span title={`Cliente VIP (${clientData.total_orders} pedidos)`} style={{ background: '#ffd700', color: '#000', borderRadius: '4px', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            <Crown size={12} fill="black" />
                        </span>
                    )}
                </div>
                {(order.client_phone || order.client_rut) && (
                    <div className="client-phone">
                        {order.client_phone && (
                            <a 
                                href={`https://wa.me/${order.client_phone.replace(/\D/g,'')}`} 
                                target="_blank" 
                                rel="noreferrer"
                                style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                title="Abrir WhatsApp"
                            >
                                <MessageCircle size={12} /> {order.client_phone}
                            </a>
                        )}
                        {order.client_phone && order.client_rut && <span style={{opacity: 0.3}}>|</span>}
                        {order.client_rut && <span>{order.client_rut}</span>}
                    </div>
                )}
            </div>

            <hr className="kanban-card-divider" style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '4px 0' }} />
            </div>

            <div className="kanban-card-scroll">
            {/* PRODUCTOS (Ticket list) */}
            <div className="card-items">
        {order.items.map((item, idx) => (
            <div key={idx} className="order-item-row" style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, width: '100%' }}>
                    <span className="qty-circle">{item.quantity}</span>
                    <span className="item-name">{item.name}</span>
                </div>
                {item.description && (
                    <span className="order-item-detail" style={{ fontSize: '0.8rem', color: '#60a5fa', marginLeft: '28px', fontStyle: 'italic', marginBottom: '4px' }}>
                        Detalle: {item.description}
                    </span>
                )}
            </div>
        ))}
            </div>

            {/* NOTAS */}
            {order.note && (
                <div className="card-note">
                    <span style={{ fontWeight: 800, marginRight: '4px' }}>NOTA:</span>
                    {order.note}
                </div>
            )}

            {/* COMPROBANTE DE TRANSFERENCIA */}
            {order.payment_type === 'online' && (
                <div className="receipt-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {order.payment_ref && order.payment_ref.startsWith('http') ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <a href={order.payment_ref} target="_blank" rel="noreferrer" className="receipt-link" style={{ flex: 1, textDecoration: 'none' }}>
                                <ImageIcon size={14} /> Ver Comprobante
                            </a>
                            <button onClick={() => setReceiptModalOrder(order)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '8px', padding: '0 12px' }}>
                                Cambiar
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setReceiptModalOrder(order)} className="receipt-link" style={{ background: 'rgba(230, 57, 70, 0.1)', color: '#e63946', border: '1px solid rgba(230, 57, 70, 0.2)', width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
                            <Upload size={14} /> Adjuntar Comprobante
                        </button>
                    )}
                </div>
            )}
            </div>

            <div className="kanban-card-foot">
            {/* TOTAL */}
            <div className="card-total">
                <span className="total-label" style={{ fontSize: '0.65rem', color: '#666', letterSpacing: '0.12em', fontWeight: 700 }}>TOTAL</span>
                <span className="total-amount" style={{ fontSize: '1.05rem' }}>${order.total.toLocaleString('es-CL')}</span>
            </div>

            {/* ACCIONES KANBAN */}
            <div className="card-actions" style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                {order.status === 'pending' && (
                    <>
                        <button onClick={() => moveOrder(order.id, 'cancelled')} className="btn-icon-action cancel" style={{ flex: '0 0 40px' }} title="Cancelar Pedido">
                            <XCircle size={18} />
                        </button>
                        <button onClick={handleMoveToKitchen} className="btn-action primary" style={{ flex: 1 }}>
                            A Cocina
                        </button>
                    </>
                )}
                {order.status === 'active' && <button onClick={() => moveOrder(order.id, 'completed')} className="btn-action success" style={{ width: '100%', margin: 0 }}>Pedido Listo</button>}
                {order.status === 'completed' && <button onClick={() => moveOrder(order.id, 'picked_up')} className="btn-action" style={{ background: 'var(--accent-primary)', color: '#fff', width: '100%', margin: 0 }}>Entregado al Cliente</button>}
            </div>
            </div>

            {detailOpen ? (
                <OrderDetailModal
                    order={order}
                    branchName={branch?.name}
                    onClose={() => setDetailOpen(false)}
                />
            ) : null}
        </div>
    );
};

export default OrderCard;
