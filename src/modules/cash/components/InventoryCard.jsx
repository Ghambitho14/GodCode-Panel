import React, { memo } from 'react';
import { Eye, EyeOff, Trash, Edit3, Star } from 'lucide-react';
import AdminIconSlot from './AdminIconSlot';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../constants/productImagePlaceholder';
import { Button } from "@/components/ui/button";

/**
 * Tarjeta de producto del **menú / carta** (catálogo vendible).
 * El nombre histórico `InventoryCard` se mantiene por imports; en UI se distingue de la pestaña Inventario (insumos).
 */
const InventoryCard = memo(({ product, toggleProductActive, setEditingProduct, setIsModalOpen, deleteProduct, viewMode = 'grid', showPhotos = true }) => {
    const { formatMoney } = useBranchMoney();

    // Manejadores de eventos limpios para evitar lógica en el JSX
    const handleEditClick = () => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleToggleClick = (e) => {
        e.stopPropagation(); // Detener burbujeo crítico
        toggleProductActive(product, e);
    };

    const handleDeleteClick = (e) => {
        e.stopPropagation(); // Detener burbujeo crítico
        deleteProduct(product.id);
    };

    // Manejo seguro de imagen rota (evita bucles infinitos)
    const handleImageError = (e) => {
        e.target.onerror = null; // Previene bucle si el logo también falla
        e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
    };

    // Manejo de teclado para accesibilidad (Enter para editar)
    const handleKeyDown = (e) => {
        // Evitar que se dispare si el evento viene de un botón hijo (ej. eliminar/toggle)
        if (e.target !== e.currentTarget) return;

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleEditClick();
        }
    };

    const statusToggleBtn = (
        <Button variant="default"
            className={`inv-status-toggle ${product.is_active ? 'on' : 'off'}${showPhotos && viewMode === 'grid' ? '' : ' inv-status-toggle--inline'}`}
            onClick={handleToggleClick}
            title={product.is_active ? 'Pausar venta' : 'Activar venta'}
            type="button"
        >
            {product.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
        </Button>
    );

    return (
        <div 
            className={`inventory-card glass ${!product.is_active ? 'inactive' : ''} ${viewMode === 'list' ? 'list-view' : ''}${showPhotos ? '' : ' inventory-card--no-photos'}`}
            onClick={handleEditClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0} // Hace que el div sea "enfocable" con Tab
            aria-label={`Editar producto ${product.name}`}
        >
            {showPhotos ? (
                <div className="inv-img-wrapper">
                    <img
                        src={product.image_url || PRODUCT_IMAGE_PLACEHOLDER}
                        alt={product.name}
                        onError={handleImageError}
                        loading="lazy"
                    />
                    {viewMode === 'grid' ? statusToggleBtn : null}
                </div>
            ) : null}

            <div className="inv-info">
                <div className="inv-header">
                    {viewMode === 'grid' && !showPhotos ? (
                        <div className="inv-header-top">
                            {statusToggleBtn}
                        </div>
                    ) : null}
                    <div className="inv-title-row">
                        <h4>{product.name}</h4>
                        {product.is_special && (
                            <span className="badge-special">
                                <AdminIconSlot Icon={Star} slotSize="xxs" tone="accent" />
                                Especial
                            </span>
                        )}
                    </div>
                    
                    <div className="price-container">
                        {product.has_discount && product.discount_price ? (
                            <>
                                <span className="inv-price-original">{formatMoney(product.price || 0)}</span>
                                <span className="inv-price discount">{formatMoney(product.discount_price || 0)}</span>
                            </>
                        ) : (
                            <span className="inv-price">{formatMoney(product.price || 0)}</span>
                        )}
                    </div>
                </div>

                {product.description && (
                    <p className="inv-description" title={product.description}>
                        {product.description}
                    </p>
                )}

                <div className="inv-actions">
                    {/* En modo lista, el toggle está aquí abajo */}
                    {viewMode === 'list' && (
                         <Button variant="default" 
                            className={`btn-icon-sm ${product.is_active ? 'text-success' : 'text-muted'}`} 
                            onClick={handleToggleClick}
                            title={product.is_active ? "Pausar" : "Activar"}
                            style={{ marginRight: 8 }}
                        >
                            {product.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                        </Button>
                    )}

                    {viewMode === 'grid' && (
                        <span className={`status-badge ${product.is_active ? 'active' : 'paused'}`}>
                            {product.is_active ? 'Disponible' : 'Pausado'}
                        </span>
                    )}
                    
                    <div className="action-buttons">
                        {/* Botón visual de editar (ayuda UX) */}
                        <Button variant="default" className="" title="Editar">
                            <Edit3 size={14} />
                        </Button>
                        
                        <Button variant="default" 
                            onClick={handleDeleteClick} 
                            className="btn-trash-sm"
                            title="Eliminar producto"
                        >
                            <Trash size={14} />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
});

InventoryCard.displayName = 'MenuProductCard';

export default InventoryCard;
