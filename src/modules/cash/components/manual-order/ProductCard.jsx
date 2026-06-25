import React from 'react';
import { Minus } from 'lucide-react';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../constants/productImagePlaceholder';

/**
 * Tarjeta de producto para el catálogo del pedido manual.
 */
const ProductCard = ({
    product,
    quantity,
    addItem,
    updateQuantity,
    removeItem,
    showProductImages,
    sourceLabel: _sourceLabel = '',
}) => {
    const { formatMoney } = useBranchMoney();
    const hasDiscount = Boolean(product.has_discount) && product.discount_price != null && Number(product.discount_price) > 0;
    const unitPrice = hasDiscount ? Number(product.discount_price) : Number(product.price);

    const handleAddClick = (e) => {
        e.stopPropagation();
        try {
            addItem(product);
        } catch (err) {
            console.error('Error adding product:', err);
        }
    };

    const handleMinusClick = (e) => {
        e.stopPropagation();
        if (quantity === 1) {
            removeItem(product.id);
        } else {
            updateQuantity(product.id, -1);
        }
    };

    const priceBlock = hasDiscount ? (
        <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-gc-text-muted line-through">
                {formatMoney(Number(product.price))}
            </span>
            <span className="text-xl font-medium text-gc-price">
                {formatMoney(unitPrice)}
            </span>
        </div>
    ) : (
        <span className="text-xl font-medium text-gc-price">
            {formatMoney(Number(product.price))}
        </span>
    );

    const actionBlock = quantity === 0 ? (
        <button
            type="button"
            onClick={handleAddClick}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-0 bg-gc-accent text-[22px] leading-none text-white transition-[background,transform] duration-150 hover:bg-gc-accent-hover active:scale-[0.93]"
            aria-label={`Agregar ${product.name}`}
        >
            +
        </button>
    ) : (
        <div className="flex flex-shrink-0 items-center gap-1">
            <button
                type="button"
                onClick={handleMinusClick}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gc-border text-gc-text transition-colors hover:border-gc-accent/30 hover:bg-gc-muted active:scale-95"
                aria-label="Reducir cantidad"
            >
                <Minus size={14} strokeWidth={2.5} />
            </button>
            <span className="min-w-[1.25rem] text-center text-sm font-medium text-gc-text tabular-nums">
                {quantity}
            </span>
            <button
                type="button"
                onClick={handleAddClick}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gc-accent text-lg leading-none text-white transition-[background,transform] duration-150 hover:bg-gc-accent-hover active:scale-[0.93]"
                aria-label="Aumentar cantidad"
            >
                +
            </button>
        </div>
    );

    return (
        <article
            className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[4px] border border-gc-border bg-gc-card transition-[border-color] duration-150 hover:border-gc-accent/25"
            onClick={() => addItem(product)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addItem(product); }}
            role="button"
            tabIndex={0}
        >
            {showProductImages && (
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gc-muted">
                    <img
                        src={product.image_url || PRODUCT_IMAGE_PLACEHOLDER}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                        }}
                    />
                </div>
            )}

            <div className="flex flex-1 flex-col gap-3 px-3 py-2.5">
                <p
                    className="text-base font-medium leading-[1.3] text-gc-text"
                    title={product.name}
                >
                    {product.name}
                </p>

                {product.description && (
                    <p
                        className="flex-1 text-[13px] leading-normal text-gc-text-muted"
                        title={product.description}
                    >
                        {product.description}
                    </p>
                )}

                <div className="h-px bg-gc-border/80" aria-hidden />

                <div
                    className="mt-2 flex items-center justify-between gap-4 pt-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="min-w-0">{priceBlock}</div>
                    {actionBlock}
                </div>
            </div>
        </article>
    );
};

export default React.memo(ProductCard);
