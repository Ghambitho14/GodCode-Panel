import React from 'react';
import { Minus, Check } from 'lucide-react';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { useFoodFallbackImage } from '@/modules/cash/hooks/useFoodFallbackImage';

import { Button } from "@/components/ui/button";
import { cn } from '@/lib/utils';
import { spacing, textScale, cardRadiusClass } from './manualOrderStyles';

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

    const inCart = quantity > 0;
    const imageUrl = product.image_url?.trim() || null;
    const categoryName = product.category_name || product.category?.name || '';
    const initial = String(product.name ?? '').trim().charAt(0).toUpperCase();

    const [imageStage, setImageStage] = React.useState(imageUrl ? 'real' : 'fallback');
    React.useEffect(() => { setImageStage(imageUrl ? 'real' : 'fallback'); }, [imageUrl]);

    const { url: fallbackImageUrl, failed: fallbackFailed } = useFoodFallbackImage(
        categoryName,
        product.id,
        showProductImages,
    );

    React.useEffect(() => {
        if (!imageUrl && fallbackFailed) setImageStage('initial');
    }, [imageUrl, fallbackFailed]);

    const handleImageError = () => {
        setImageStage((prev) => (prev === 'real' ? 'fallback' : 'initial'));
    };

    const isShowingImage = showProductImages && imageStage !== 'initial';

    const floatingAction = quantity === 0 ? (
        <Button variant="default"
            type="button"
            onClick={handleAddClick}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gc-accent text-lg leading-none text-white shadow-sm transition-[background,transform] duration-150 hover:bg-gc-accent-hover active:scale-[0.93]"
            aria-label={`Agregar ${product.name}`}
        >
            +
        </Button>
    ) : (
        <div className="flex items-center gap-1 rounded-full bg-gc-accent p-1 shadow-sm">
            <Button variant="outline"
                type="button"
                onClick={handleMinusClick}
                className="flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-white transition-colors hover:bg-white/15 active:scale-95"
                aria-label="Reducir cantidad"
            >
                <Minus size={12} strokeWidth={2.5} />
            </Button>
            <span className={`min-w-[1rem] text-center ${textScale.micro} font-bold text-white tabular-nums`}>
                {quantity}
            </span>
            <Button variant="default"
                type="button"
                onClick={handleAddClick}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-transparent text-sm leading-none text-white transition-colors hover:bg-white/15 active:scale-[0.93]"
                aria-label="Aumentar cantidad"
            >
                +
            </Button>
        </div>
    );

    return (
        <article
            className={cn(
                'group relative flex cursor-pointer flex-col items-center overflow-hidden border border-gc-border/40 bg-white p-4 transition-shadow duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent focus-visible:ring-offset-2',
                cardRadiusClass,
            )}
            onClick={() => addItem(product)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addItem(product); }}
            role="button"
            tabIndex={0}
        >
            <div className={cn(
                'relative mt-2 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gc-muted',
                !isShowingImage && 'border border-gc-border/60',
                inCart && 'ring-2 ring-gc-accent',
            )}>
                {showProductImages && imageStage === 'real' && imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        onError={handleImageError}
                    />
                ) : showProductImages && imageStage === 'fallback' ? (
                    <img
                        src={fallbackImageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        onError={handleImageError}
                    />
                ) : (
                    <span className="text-2xl font-bold text-gc-text-muted">{initial || '?'}</span>
                )}
                {inCart && (
                    <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-gc-accent text-white shadow-sm">
                        <Check size={12} strokeWidth={3} />
                    </span>
                )}
            </div>

            <div className={`mt-4 flex w-full flex-col items-center ${spacing.compact}`}>
                {categoryName && (
                    <span className={`${textScale.micro} truncate text-gc-text-muted`}>{categoryName}</span>
                )}
                <p
                    className={`${textScale.emphasis} text-center font-semibold leading-snug text-gc-text`}
                    title={product.name}
                >
                    {product.name}
                </p>

                <div className="flex w-full items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className={`${textScale.price} font-bold text-gc-text`}>
                        {hasDiscount ? (
                            <>
                                <span className={`${textScale.micro} mr-1.5 font-medium text-gc-text-muted line-through`}>
                                    {formatMoney(Number(product.price))}
                                </span>
                                {formatMoney(unitPrice)}
                            </>
                        ) : (
                            formatMoney(unitPrice)
                        )}
                    </span>
                    {floatingAction}
                </div>

                {hasDiscount && (
                    <span className={`self-end rounded-[4px] bg-gc-discount/10 px-1.5 py-0.5 ${textScale.micro} font-bold uppercase text-gc-discount`}>
                        Oferta
                    </span>
                )}
            </div>
        </article>
    );
};

export default React.memo(ProductCard);
