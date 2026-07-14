import { useEffect, useState } from 'react';
import { getSignedImageUrl, isSupabaseStorageUrl } from '@/shared/utils/supabaseStorage';

const BUCKET_REGEX = /\/object\/public\/(menu|receipts|products)\//;

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
 * @returns {{ url: string | null, loading: boolean, error: string | null }}
 */
export function useSignedImageUrl(imageUrlOrPath, bucket, expiresIn = 3600) {
    const [state, setState] = useState({ url: null, loading: false, error: null });

    useEffect(() => {
        if (!imageUrlOrPath) {
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

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        getSignedImageUrl(trimmed, resolvedBucket, expiresIn)
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
    }, [imageUrlOrPath, bucket, expiresIn]);

    return state;
}
