import { useEffect, useState } from 'react';
import {
    extractStoragePath,
    getSignedImageUrl,
    isCloudinaryImageUrl,
    isSupabaseStorageUrl,
    resolveImageTransform,
} from '@/shared/utils/supabaseStorage';

const BUCKET_REGEX = /\/(?:object|render\/image)\/(?:public|sign|authenticated)\/(menu|receipts|products)\//;
const SIGNED_URL_CACHE_LIMIT = 500;
const signedUrlCache = new Map();
const pendingSignedUrls = new Map();

function transformCacheSuffix(transform) {
    const resolved = resolveImageTransform(transform);
    if (!resolved) return '';
    const width = resolved.width ?? '';
    const height = resolved.height ?? '';
    const quality = resolved.quality ?? '';
    const resize = resolved.resize ?? '';
    return `::t:${width}x${height}:q${quality}:r${resize}`;
}

function buildCacheKey(bucket, path, transform = null) {
    return `${bucket}:${path}${transformCacheSuffix(transform)}`;
}

function getCachedSignedUrl(key) {
    const cached = signedUrlCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        signedUrlCache.delete(key);
        return null;
    }
    signedUrlCache.delete(key);
    signedUrlCache.set(key, cached);
    return cached.url;
}

function setCachedSignedUrl(key, url, expiresIn) {
    if (!url) return;
    const lifetimeMs = Math.max(1, Number(expiresIn) || 3600) * 1000;
    const safetyWindowMs = Math.min(60_000, Math.max(5_000, lifetimeMs * 0.1));
    signedUrlCache.set(key, {
        url,
        expiresAt: Date.now() + Math.max(1_000, lifetimeMs - safetyWindowMs),
    });
    while (signedUrlCache.size > SIGNED_URL_CACHE_LIMIT) {
        signedUrlCache.delete(signedUrlCache.keys().next().value);
    }
}

function resolveSignedUrl(path, bucket, expiresIn, transform) {
    const key = buildCacheKey(bucket, path, transform);
    const cachedUrl = getCachedSignedUrl(key);
    if (cachedUrl) return Promise.resolve(cachedUrl);
    if (pendingSignedUrls.has(key)) return pendingSignedUrls.get(key);

    const request = getSignedImageUrl(path, bucket, expiresIn, transform)
        .then((url) => {
            setCachedSignedUrl(key, url, expiresIn);
            return url;
        })
        .finally(() => pendingSignedUrls.delete(key));
    pendingSignedUrls.set(key, request);
    return request;
}

/**
 * Invalida la URL cacheada. Sin `transform`, limpia todas las variantes.
 */
export function invalidateSignedImageUrl(pathOrUrl, bucket, transform = undefined) {
    if (!pathOrUrl || !bucket) return;
    const path = extractStoragePath(pathOrUrl, bucket);
    if (transform !== undefined) {
        const key = buildCacheKey(bucket, path, transform);
        signedUrlCache.delete(key);
        pendingSignedUrls.delete(key);
        return;
    }
    const prefix = `${bucket}:${path}`;
    for (const key of [...signedUrlCache.keys()]) {
        if (key === prefix || key.startsWith(`${prefix}::`)) signedUrlCache.delete(key);
    }
    for (const key of [...pendingSignedUrls.keys()]) {
        if (key === prefix || key.startsWith(`${prefix}::`)) pendingSignedUrls.delete(key);
    }
}

function inferBucket(pathOrUrl) {
    if (!pathOrUrl) return null;
    const p = String(pathOrUrl);
    if (p.startsWith('menu/')) return 'menu';
    if (p.startsWith('receipts/')) return 'receipts';
    if (p.startsWith('products/')) return 'products';
    const match = p.match(BUCKET_REGEX);
    return match ? match[1] : null;
}

/**
 * @param {string | null | undefined} imageUrlOrPath
 * @param {'menu' | 'receipts' | 'products'} [bucket]
 * @param {number} [expiresIn=3600]
 * @param {boolean} [enabled=true]
 * @param {number} [refreshKey=0]
 * @param {string | object | null} [transform=null]
 */
export function useSignedImageUrl(
    imageUrlOrPath,
    bucket,
    expiresIn = 3600,
    enabled = true,
    refreshKey = 0,
    transform = null,
) {
    const [state, setState] = useState({ url: null, loading: false, error: null });
    const transformKey = transformCacheSuffix(transform);

    useEffect(() => {
        if (!enabled || !imageUrlOrPath) {
            setState({ url: null, loading: false, error: null });
            return;
        }

        const trimmed = String(imageUrlOrPath).trim();

        // Cloudinary legacy: no intentar cargar (401) → el UI usa fallback.
        if (isCloudinaryImageUrl(trimmed)) {
            setState({ url: null, loading: false, error: 'cloudinary_unavailable' });
            return;
        }

        // Otras URLs externas: usar directo, sin firmar.
        if (/^https?:\/\//i.test(trimmed) && !isSupabaseStorageUrl(trimmed)) {
            setState({ url: trimmed, loading: false, error: null });
            return;
        }

        const resolvedBucket = bucket || inferBucket(trimmed);
        if (!resolvedBucket) {
            setState({ url: null, loading: false, error: 'Bucket no determinado' });
            return;
        }

        const storagePath = extractStoragePath(trimmed, resolvedBucket);
        const cacheKey = buildCacheKey(resolvedBucket, storagePath, transform);
        const cachedUrl = getCachedSignedUrl(cacheKey);
        if (cachedUrl) {
            setState({ url: cachedUrl, loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        resolveSignedUrl(storagePath, resolvedBucket, expiresIn, transform)
            .then((url) => {
                if (!cancelled) setState({ url, loading: false, error: null });
            })
            .catch((err) => {
                if (!cancelled) {
                    setState({
                        url: null,
                        loading: false,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [imageUrlOrPath, bucket, expiresIn, enabled, refreshKey, transformKey, transform]);

    return state;
}
