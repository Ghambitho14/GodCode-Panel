import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';

/**
 * Imagen de producto: skeleton -> Storage -> original -> fallback -> empty.
 * El estado "cargada" se amarra al `src` actual (sin reset async) para no dejar
 * el skeleton colgado cuando la imagen sale de caché antes del effect.
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
    /** @type {string | object | null} */
    preset = 'catalogCard',
}) => {
    const normalizedSource = String(source || '').trim() || null;
    const [useFullSize, setUseFullSize] = React.useState(false);
    const effectivePreset = useFullSize ? null : preset;

    const {
        url: signedUrl,
        loading: signedUrlLoading,
        error: signedUrlError,
    } = useSignedImageUrl(normalizedSource, 'menu', 3600, enabled, 0, effectivePreset);

    const [failedStages, setFailedStages] = React.useState({
        real: false,
        fallback: false,
        placeholder: false,
    });
    const [loadedSrc, setLoadedSrc] = React.useState(null);
    const imgRef = React.useRef(null);

    // Solo resetear stages/full-size al cambiar fuente; no tocar loadedSrc
    // (si el src cambia, loadedSrc !== src ya muestra skeleton).
    React.useEffect(() => {
        setUseFullSize(false);
        setFailedStages({ real: false, fallback: false, placeholder: false });
    }, [normalizedSource, fallbackSrc, placeholderSrc, enabled, preset]);

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

    const isLoaded = Boolean(src && loadedSrc === src);
    const isLoading = Boolean(enabled && (resolvingSignedUrl || (src && !isLoaded)));

    // Caché del navegador: a veces onLoad no vuelve a disparar.
    React.useLayoutEffect(() => {
        if (!src) return;
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) {
            setLoadedSrc(src);
        }
    }, [src]);

    const handleError = () => {
        if (stage === 'real' && !useFullSize && preset) {
            setUseFullSize(true);
            return;
        }
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
                    ref={imgRef}
                    key={src}
                    src={src}
                    alt={alt}
                    className={cn(
                        imageClassName,
                        stage === 'placeholder' && placeholderClassName,
                        'transition-opacity duration-200',
                        isLoaded ? 'opacity-100' : 'opacity-0',
                    )}
                    loading={loading}
                    decoding="async"
                    onLoad={() => setLoadedSrc(src)}
                    onError={handleError}
                />
            ) : !isLoading ? emptyContent : null}
        </>
    );
};

export default React.memo(ProgressiveProductImage);
