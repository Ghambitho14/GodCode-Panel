import { useState, useEffect } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import { buildCouponPreview } from '@/lib/discount-coupon';
import { COUPON_PREVIEW_ERR_MSG } from './manualOrderShared';

/**
 * Hook especializado en el estado, validación y debounce del código de descuento
 * contrastándolo en tiempo real con la base de datos de Supabase.
 */
export const useCouponValidation = (companyId, couponCode, itemsSubtotal, clientPhone) => {
    const [couponPreview, setCouponPreview] = useState(() => ({
        loading: false,
        discount: 0,
        message: '',
        variant: 'neutral',
    }));

    useEffect(() => {
        if (!companyId) {
            setCouponPreview(p =>
                (p.variant === 'neutral' && p.discount === 0 && !p.message && !p.loading)
                    ? p
                    : { loading: false, discount: 0, message: '', variant: 'neutral' }
            );
            return undefined;
        }

        const rawCode = String(couponCode ?? '').trim();
        if (!rawCode) {
            setCouponPreview({ loading: false, discount: 0, message: '', variant: 'neutral' });
            return undefined;
        }

        let cancelled = false;
        setCouponPreview({ loading: true, discount: 0, message: '', variant: 'neutral' });

        const tid = setTimeout(async () => {
            try {
                const pv = await buildCouponPreview({
                    supabase,
                    companyId: String(companyId),
                    rawCode,
                    itemsSubtotal,
                    clientPhone: String(clientPhone ?? '').trim(),
                    tablesCoupons: TABLES.discount_coupons,
                    tablesClients: TABLES.clients,
                    tablesRedemptions: TABLES.discount_coupon_redemptions,
                });

                if (cancelled) return;

                if (!pv.ok) {
                    setCouponPreview({
                        loading: false,
                        discount: 0,
                        message: COUPON_PREVIEW_ERR_MSG[pv.key] || 'No se pudo validar el cupón.',
                        variant: 'error',
                    });
                    return;
                }

                setCouponPreview({
                    loading: false,
                    discount: pv.discount,
                    message: pv.discount > 0 ? 'Cupón válido (estimado; confirma al crear el pedido).' : '',
                    variant: pv.discount > 0 ? 'success' : 'neutral',
                });
            } catch {
                if (!cancelled) {
                    setCouponPreview({
                        loading: false,
                        discount: 0,
                        message: 'No se pudo validar el cupón.',
                        variant: 'error',
                    });
                }
            }
        }, 420);

        return () => {
            cancelled = true;
            clearTimeout(tid);
        };
    }, [companyId, couponCode, itemsSubtotal, clientPhone]);

    const resetCoupon = () => {
        setCouponPreview({ loading: false, discount: 0, message: '', variant: 'neutral' });
    };

    return {
        couponPreview,
        resetCoupon
    };
};
