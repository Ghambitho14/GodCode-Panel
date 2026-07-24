import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const receiptMocks = vi.hoisted(() => ({
    useSignedImageUrl: vi.fn(() => ({ url: null, loading: false, error: null })),
    invalidateSignedImageUrl: vi.fn(),
    listEvidence: vi.fn(async () => []),
}));

vi.mock('@/shared/hooks/useSignedImageUrl', () => ({
    useSignedImageUrl: receiptMocks.useSignedImageUrl,
    invalidateSignedImageUrl: receiptMocks.invalidateSignedImageUrl,
}));
vi.mock('@/shared/utils/supabaseStorage', () => ({
    isStorageObjectReference: (value) => /\/.+\.(?:png|jpe?g|webp|gif)$/i.test(String(value || '')),
}));
vi.mock('@/modules/cash/services/manualOrderV2Service', () => ({
    manualOrderV2Service: { listEvidence: receiptMocks.listEvidence },
}));

import PaymentReceiptPanel from '@/modules/cash/components/PaymentReceiptPanel';

const defaultProps = {
    preview: null,
    uploading: false,
    onFileChange: vi.fn(),
    onClearPreview: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('PaymentReceiptPanel', () => {
    it('trata referencias textuales legacy como un estado vacío, no como un archivo roto', () => {
        render(
            <PaymentReceiptPanel
                {...defaultProps}
                order={{ id: 42, payment_ref: 'Pago Presencial', payment_type: 'cash' }}
            />,
        );

        expect(screen.getByText('No hay un archivo adjunto')).toBeInTheDocument();
        expect(screen.queryByText('No se pudo mostrar el archivo')).not.toBeInTheDocument();
        expect(receiptMocks.useSignedImageUrl).not.toHaveBeenCalled();
    });

    it('abre un comprobante privado mediante la URL firmada', () => {
        receiptMocks.useSignedImageUrl.mockReturnValue({
            url: 'https://storage.test/signed-receipt',
            loading: false,
            error: null,
        });
        render(
            <PaymentReceiptPanel
                {...defaultProps}
                order={{
                    id: 43,
                    payment_ref: 'company/orders/branch/receipts/2026/07/43/receipt.webp',
                    payment_type: 'online',
                }}
            />,
        );

        expect(screen.getByRole('img', { name: 'Comprobante de pago' }))
            .toHaveAttribute('src', 'https://storage.test/signed-receipt');
        expect(screen.getByRole('link', { name: /Abrir tamaño completo/i }))
            .toHaveAttribute('href', 'https://storage.test/signed-receipt');
    });
});
