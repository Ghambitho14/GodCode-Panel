import React from 'react';
import { Minus, Check } from 'lucide-react';
import { useBranchMoney } from '@/modules/cash/hooks/useBranchMoney';
import { useFoodFallbackImage } from '@/modules/cash/hooks/useFoodFallbackImage';
import ProgressiveProductImage from '@/modules/cash/components/ProgressiveProductImage';

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
    const mediaRef = React.useRef(null);
    const [imageNearViewport, setImageNearViewport] = React.useState(false);
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
    const rawImageUrl = product.image_url?.trim() || null;
    const categoryName = product.category_name || product.category?.name || '';
    const initial = String(product.name ?? '').trim().charAt(0).toUpperCase();
    const shouldLoadImage = showProductImages && imageNearViewport;

    React.useEffect(() => {
        if (!showProductImages || imageNearViewport) return undefined;
        const target = mediaRef.current;
        if (!target) return undefined;
        if (typeof IntersectionObserver === 'undefined') {
            setImageNearViewport(true);
            return undefined;
        }

        const scrollRoot = target.closest('.manual-order-categories-scroll');
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setImageNearViewport(true);
            observer.disconnect();
        }, {
            root: scrollRoot,
            rootMargin: '180px 0px',
            threshold: 0.01,
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, [showProductImages, imageNearViewport, product.id]);

    const { url: fallbackImageUrl } = useFoodFallbackImage(
        categoryName,
        product.id,
        shouldLoadImage,
    );

    const floatingAction = quantity === 0 ? (
        <Button variant="default"
            type="button"
            onClick={handleAddClick}
            className="flex aspect-square h-8 w-8 min-h-8 min-w-8 items-center justify-center !rounded-full bg-gc-accent p-0 text-lg leading-none text-white shadow-sm transition-[background,transform] duration-150 hover:bg-gc-accent-hover active:scale-[0.93]"
            aria-label={`Agregar ${product.name}`}
        >
            +
        </Button>
    ) : (
        <div className="flex items-center gap-1 rounded-full bg-gc-accent p-1 shadow-sm">
            <Button variant="outline"
                type="button"
                onClick={handleMinusClick}
                className="hidden h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent text-white transition-colors hover:bg-white/15 active:scale-95 sm:flex"
                aria-label="Reducir cantidad"
            >
                <Minus size={12} strokeWidth={2.5} />
            </Button>
            <span className={`hidden min-w-[1rem] text-center ${textScale.micro} font-bold text-white tabular-nums sm:inline`}>
                {quantity}
            </span>
            <Button variant="default"
                type="button"
                onClick={handleAddClick}
                className="flex aspect-square h-6 w-6 min-h-6 min-w-6 items-center justify-center !rounded-full bg-transparent p-0 text-sm leading-none text-white transition-colors hover:bg-white/15 active:scale-[0.93]"
                aria-label="Aumentar cantidad"
            >
                +
            </Button>
        </div>
    );

    return (
        <article
            className={cn(
                'manual-order-product-card group relative flex h-full cursor-pointer flex-col items-center overflow-hidden border border-gc-border/40 bg-white p-3 shadow-xs transition-shadow duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-accent focus-visible:ring-offset-2 sm:p-4',
                cardRadiusClass,
            )}
            onClick={() => addItem(product)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addItem(product); }}
            role="button"
            tabIndex={0}
        >
            <div className="relative mt-1 sm:mt-2">
                <div ref={mediaRef} className={cn(
                    'manual-order-product-media relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gc-muted sm:h-24 sm:w-24',
                    !showProductImages && 'border border-gc-border/60',
                    inCart && 'ring-2 ring-gc-accent',
                )}>
                    <ProgressiveProductImage
                        source={rawImageUrl}
                        fallbackSrc={fallbackImageUrl}
                        alt={product.name}
                        enabled={shouldLoadImage}
                        imageClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        skeletonClassName="rounded-full"
                        emptyContent={<span className="text-2xl font-bold text-gc-text-muted">{initial || '?'}</span>}
                    />
                </div>
                {inCart && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gc-accent text-[10px] font-bold text-white shadow-sm">
                        {quantity}
                    </span>
                )}
            </div>

            <div className={`mt-3 flex w-full flex-1 flex-col items-center ${spacing.compact} sm:mt-4`}>
                {categoryName && (
                    <span className={`${textScale.micro} truncate text-gc-text-muted`}>{categoryName}</span>
                )}
                <p
                    className={`${textScale.emphasis} text-center font-semibold leading-snug text-gc-text`}
                    title={product.name}
                >
                    {product.name}
                </p>

                <div className="mt-auto flex w-full items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
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
