import React, { memo } from 'react';
import { Eye, EyeOff, Trash2, Pencil, Star } from 'lucide-react';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { useFoodFallbackImage } from '@/modules/cash/hooks/useFoodFallbackImage';
import ProgressiveProductImage from './ProgressiveProductImage';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../constants/productImagePlaceholder';

/**
 * Tarjeta de producto del **menú / carta** (catálogo vendible).
 * El nombre histórico `InventoryCard` se mantiene por imports; en UI se distingue de la pestaña Inventario (insumos).
 *
 * Anatomía (arriba → abajo): foto · nombre + descripción · precio (+ oferta,
 * + "Especial") · pie con estado y acciones. Nombre y precio ya no comparten
 * fila: con nombres de dos líneas el precio partía el título por la mitad.
 */
const InventoryCard = memo(({ product, toggleProductActive, setEditingProduct, setIsModalOpen, deleteProduct, viewMode = 'grid', showPhotos = true }) => {
    const { formatMoney } = useBranchMoney();
    const rawImageUrl = product.image_url?.trim() || null;
    const categoryName = product.category_name || product.category?.name || '';
    const { url: fallbackUrl } = useFoodFallbackImage(categoryName, product.id, showPhotos);
    const isList = viewMode === 'list';
    const active = Boolean(product.is_active);

    const handleEditClick = () => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleToggleClick = (e) => {
        e.stopPropagation();
        toggleProductActive(product, e);
    };

    const handleDeleteClick = (e) => {
        e.stopPropagation();
        deleteProduct(product.id);
    };

    // Enter / espacio sobre la tarjeta abren la edición; los botones hijos no.
    const handleKeyDown = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleEditClick();
        }
    };

    const toggleButton = (extraClass) => (
        <button
            type="button"
            className={`inv-toggle ${active ? 'is-on' : 'is-off'} ${extraClass}`}
            onClick={handleToggleClick}
            title={active ? 'Pausar venta' : 'Activar venta'}
            aria-label={active ? 'Pausar venta' : 'Activar venta'}
            aria-pressed={active}
        >
            {active ? <Eye size={15} strokeWidth={1.75} aria-hidden /> : <EyeOff size={15} strokeWidth={1.75} aria-hidden />}
        </button>
    );

    const className = [
        'inventory-card',
        active ? '' : 'inactive',
        isList ? 'list-view' : '',
        showPhotos ? '' : 'inventory-card--no-photos',
    ].filter(Boolean).join(' ');

    return (
        <article
            className={className}
            onClick={handleEditClick}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Editar producto ${product.name}`}
        >
            {showPhotos ? (
                <div className="inv-img-wrapper">
                    <ProgressiveProductImage
                        source={rawImageUrl}
                        fallbackSrc={fallbackUrl}
                        placeholderSrc={PRODUCT_IMAGE_PLACEHOLDER}
                        alt={product.name}
                        placeholderClassName="inv-img-placeholder"
                        preset="catalogCard"
                    />
                    {!isList ? toggleButton('inv-toggle--overlay') : null}
                </div>
            ) : null}

            <div className="inv-info">
                <div className="inv-main">
                    <h4 className="inv-name">{product.name}</h4>
                    {product.description ? (
                        <p className="inv-description" title={product.description}>
                            {product.description}
                        </p>
                    ) : null}
                </div>

                <div className="inv-price-row">
                    {product.has_discount && product.discount_price ? (
                        <>
                            <span className="inv-price inv-price--offer">{formatMoney(product.discount_price || 0)}</span>
                            <s className="inv-price-original">{formatMoney(product.price || 0)}</s>
                        </>
                    ) : (
                        <span className="inv-price">{formatMoney(product.price || 0)}</span>
                    )}
                    {product.is_special ? (
                        <span className="inv-badge-special">
                            <Star size={12} strokeWidth={2} aria-hidden />
                            Especial
                        </span>
                    ) : null}
                </div>

                <div className="inv-footer">
                    <span className={`inv-status ${active ? 'is-active' : 'is-paused'}`}>
                        <span className="inv-status-dot" aria-hidden />
                        {active ? 'Disponible' : 'Pausado'}
                    </span>

                    <div className="inv-actions" onClick={(e) => e.stopPropagation()}>
                        {isList || !showPhotos ? toggleButton('inv-toggle--inline') : null}
                        <button
                            type="button"
                            className="inv-icon-btn"
                            onClick={handleEditClick}
                            title="Editar producto"
                            aria-label="Editar producto"
                        >
                            <Pencil size={15} strokeWidth={1.75} aria-hidden />
                        </button>
                        <button
                            type="button"
                            className="inv-icon-btn inv-icon-btn--danger"
                            onClick={handleDeleteClick}
                            title="Eliminar producto"
                            aria-label="Eliminar producto"
                        >
                            <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
});

InventoryCard.displayName = 'MenuProductCard';

export default InventoryCard;
