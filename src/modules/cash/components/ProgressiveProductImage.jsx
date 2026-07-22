import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';

/**
 * Imagen de producto con estados consistentes para buckets privados:
 * skeleton -> imagen firmada -> fallback -> placeholder/empty.
 */
const ProgressiveProductImage = ({
    source,
    fallbackSrc = null,
    placeholderSrc = null,
    alt = '',
    imageClassName,
    placeholderClassName,
    skeletonClassName,
    emptyContent = null,
    enabled = true,
    loading = 'lazy',
}) => {
    const normalizedSource = String(source || '').trim() || null;
    const {
        url: signedUrl,
        loading: signedUrlLoading,
        error: signedUrlError,
    } = useSignedImageUrl(normalizedSource, 'menu', 3600, enabled);

    const [failedStages, setFailedStages] = React.useState({
        real: false,
        fallback: false,
        placeholder: false,
    });
    const [loadedUrl, setLoadedUrl] = React.useState(null);

    React.useEffect(() => {
        setFailedStages({ real: false, fallback: false, placeholder: false });
        setLoadedUrl(null);
    }, [normalizedSource, fallbackSrc, placeholderSrc, enabled]);

    const canUseRealImage = Boolean(
        enabled && normalizedSource && !signedUrlError && !failedStages.real
    );
    const resolvingSignedUrl = Boolean(
        canUseRealImage && (signedUrlLoading || !signedUrl)
    );

    let stage = null;
    let src = null;
    if (enabled && canUseRealImage && signedUrl) {
        stage = 'real';
        src = signedUrl;
    } else if (enabled && !resolvingSignedUrl && fallbackSrc && !failedStages.fallback) {
        stage = 'fallback';
        src = fallbackSrc;
    } else if (enabled && !resolvingSignedUrl && placeholderSrc && !failedStages.placeholder) {
        stage = 'placeholder';
        src = placeholderSrc;
    }

    const isLoading = Boolean(enabled && (resolvingSignedUrl || (src && loadedUrl !== src)));
    const isVisible = Boolean(src && loadedUrl === src);

    const handleError = () => {
        setLoadedUrl(null);
        if (stage) {
            setFailedStages((current) => ({ ...current, [stage]: true }));
        }
    };

    return (
        <>
            {isLoading ? (
                <Skeleton
                    className={cn('absolute inset-0 h-full w-full rounded-none', skeletonClassName)}
                    aria-hidden="true"
                />
            ) : null}

            {src ? (
                <img
                    src={src}
                    alt={alt}
                    className={cn(
                        imageClassName,
                        stage === 'placeholder' && placeholderClassName,
                        'transition-opacity duration-200',
                        isVisible ? 'opacity-100' : 'opacity-0',
                    )}
                    loading={loading}
                    decoding="async"
                    onLoad={() => setLoadedUrl(src)}
                    onError={handleError}
                />
            ) : !isLoading ? emptyContent : null}
        </>
    );
};

export default React.memo(ProgressiveProductImage);
