import { useEffect, useState } from 'react';
import { getSignedImageUrl, isSupabaseStorageUrl } from '@/shared/utils/supabaseStorage';

const BUCKET_REGEX = /\/object\/public\/(menu|receipts|products)\//;
const SIGNED_URL_CACHE_LIMIT = 500;
const signedUrlCache = new Map();
const pendingSignedUrls = new Map();

function buildCacheKey(bucket, path) {
    return `${bucket}:${path}`;
}

function getCachedSignedUrl(key) {
    const cached = signedUrlCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        signedUrlCache.delete(key);
        return null;
    }
    // Reinsertar conserva un LRU sencillo y evita que catálogos extensos crezcan sin límite.
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

function resolveSignedUrl(path, bucket, expiresIn) {
    const key = buildCacheKey(bucket, path);
    const cachedUrl = getCachedSignedUrl(key);
    if (cachedUrl) return Promise.resolve(cachedUrl);
    if (pendingSignedUrls.has(key)) return pendingSignedUrls.get(key);

    const request = getSignedImageUrl(path, bucket, expiresIn)
        .then((url) => {
            setCachedSignedUrl(key, url, expiresIn);
            return url;
        })
        .finally(() => pendingSignedUrls.delete(key));
    pendingSignedUrls.set(key, request);
    return request;
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
 * Hook para resolver imágenes almacenadas en Supabase Storage.
 *
 * - Si el valor ya es una URL completa de Supabase Storage (p. ej. una URL
 *   firmada vigente), la devuelve tal cual.
 * - Rechaza URLs externas para evitar peticiones a proveedores antiguos.
 * - Si es una ruta relativa de Supabase Storage, genera una URL firmada
 *   (requiere que el bucket sea privado).
 *
 * @param {string | null | undefined} imageUrlOrPath - URL completa o ruta relativa.
 * @param {'menu' | 'receipts' | 'products'} [bucket] - Bucket explícito.
 * @param {number} [expiresIn=3600] - Segundos de validez de la URL firmada.
 * @param {boolean} [enabled=true] - Si es false, no genera URL ni inicia descargas.
 * @returns {{ url: string | null, loading: boolean, error: string | null }}
 */
export function useSignedImageUrl(imageUrlOrPath, bucket, expiresIn = 3600, enabled = true) {
    const [state, setState] = useState({ url: null, loading: false, error: null });

    useEffect(() => {
        if (!enabled || !imageUrlOrPath) {
            setState({ url: null, loading: false, error: null });
            return;
        }

        const trimmed = String(imageUrlOrPath).trim();

        // Solo las URLs completas de Supabase Storage se usan directamente.
        if (/^https?:\/\//i.test(trimmed)) {
            setState(
                isSupabaseStorageUrl(trimmed)
                    ? { url: trimmed, loading: false, error: null }
                    : { url: null, loading: false, error: 'La imagen no pertenece a Supabase Storage' },
            );
            return;
        }

        const resolvedBucket = bucket || inferBucket(trimmed);
        if (!resolvedBucket) {
            setState({ url: null, loading: false, error: 'Bucket no determinado' });
            return;
        }

        const cacheKey = buildCacheKey(resolvedBucket, trimmed);
        const cachedUrl = getCachedSignedUrl(cacheKey);
        if (cachedUrl) {
            setState({ url: cachedUrl, loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        resolveSignedUrl(trimmed, resolvedBucket, expiresIn)
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
    }, [imageUrlOrPath, bucket, expiresIn, enabled]);

    return state;
}
