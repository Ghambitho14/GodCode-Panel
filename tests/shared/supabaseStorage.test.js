import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
    IMAGE_STORAGE_CONTEXTS,
    companyStorageFolder,
    createClientUuid,
    extractStoragePath,
    getCompanyImageStorageTarget,
    isCompanyStoragePath,
    isStorageObjectReference,
} from '@/shared/utils/supabaseStorage';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Supabase Storage empresarial', () => {
    it('usa crypto.randomUUID cuando está disponible', () => {
        const randomUUID = vi.fn(() => '33333333-3333-4333-8333-333333333333');

        vi.stubGlobal('crypto', { randomUUID });

        expect(createClientUuid()).toBe('33333333-3333-4333-8333-333333333333');
        expect(randomUUID).toHaveBeenCalledOnce();
    });

    it('genera un UUID de respaldo cuando crypto.randomUUID no existe', () => {
        vi.stubGlobal('crypto', {});

        expect(createClientUuid()).toMatch(UUID_PATTERN);
    });

    it('exige una raíz de empresa válida', () => {
        expect(() => companyStorageFolder('', 'catalog/products')).toThrow(/companyId/);
        expect(() => companyStorageFolder(COMPANY_ID, '../otro-negocio')).toThrow(/subcarpeta/);
    });

    it('organiza productos por negocio y entidad', () => {
        expect(getCompanyImageStorageTarget(
            IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT,
            { companyId: COMPANY_ID, entityId: 'product-123' },
        )).toEqual({
            bucket: 'menu',
            folder: `${COMPANY_ID}/catalog/products/product-123`,
        });
    });

    it('organiza sugerencias por sucursal, variante e ítem', () => {
        expect(getCompanyImageStorageTarget(
            IMAGE_STORAGE_CONTEXTS.CART_UPSELL,
            {
                companyId: COMPANY_ID,
                branchId: BRANCH_ID,
                variant: 'beverages',
                entityId: 'drink-1',
            },
        )).toEqual({
            bucket: 'menu',
            folder: `${COMPANY_ID}/cart-upsell/${BRANCH_ID}/beverages/drink-1`,
        });
    });

    it('organiza carrusel por sucursal', () => {
        expect(getCompanyImageStorageTarget(
            IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
            { companyId: COMPANY_ID, branchId: BRANCH_ID },
        )).toEqual({
            bucket: 'menu',
            folder: `${COMPANY_ID}/storefront/carousel/${BRANCH_ID}`,
        });
    });

    it('particiona comprobantes por sucursal, fecha y pedido', () => {
        expect(getCompanyImageStorageTarget(
            IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT,
            {
                companyId: COMPANY_ID,
                branchId: BRANCH_ID,
                entityId: 'order-123',
                now: new Date('2026-07-14T12:00:00Z'),
            },
        )).toEqual({
            bucket: 'receipts',
            folder: `${COMPANY_ID}/orders/${BRANCH_ID}/receipts/2026/07/order-123`,
        });
    });

    it('impide tratar como propia una ruta de otro negocio', () => {
        expect(isCompanyStoragePath(
            `${COMPANY_ID}/catalog/products/product-123/image.webp`,
            'menu',
            COMPANY_ID,
        )).toBe(true);
        expect(isCompanyStoragePath(
            'another-company/catalog/products/product-123/image.webp',
            'menu',
            COMPANY_ID,
        )).toBe(false);
    });

    it('no confunde una referencia de pago textual con un comprobante', () => {
        expect(isStorageObjectReference('Pago Presencial', 'receipts')).toBe(false);
        expect(isStorageObjectReference('Transferencia', 'receipts')).toBe(false);
        expect(isStorageObjectReference(
            `${COMPANY_ID}/orders/${BRANCH_ID}/receipts/2026/07/order-123/file.webp`,
            'receipts',
        )).toBe(true);
        expect(isStorageObjectReference(
            `https://example.supabase.co/storage/v1/object/sign/menu/${COMPANY_ID}/file.webp?token=x`,
            'receipts',
        )).toBe(false);
    });

    it('recupera la ruta relativa desde URLs privadas y firmadas', () => {
        const path = `${COMPANY_ID}/orders/${BRANCH_ID}/receipts/2026/07/order-123/file.webp`;
        expect(extractStoragePath(
            `https://example.supabase.co/storage/v1/object/sign/receipts/${path}?token=expired`,
            'receipts',
        )).toBe(path);
        expect(extractStoragePath(
            `https://example.supabase.co/storage/v1/render/image/authenticated/receipts/${path}`,
            'receipts',
        )).toBe(path);
    });
});
