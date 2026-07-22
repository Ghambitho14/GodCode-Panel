import { useState, useEffect } from 'react';
import { validateImageFile } from '@/shared/utils/supabaseStorage';

/**
 * Hook especializado en gestionar el archivo del comprobante de pago,
 * validación de imagen, generación de preview URL y limpieza de memoria (URL.revokeObjectURL).
 */
export const useReceiptUpload = (showNotify) => {
    const [receiptFile, setReceiptFile] = useState(null);
    const [receiptPreview, setReceiptPreview] = useState(null);

    // Evitar fugas de memoria al desmontar
    useEffect(() => {
        return () => {
            if (receiptPreview) URL.revokeObjectURL(receiptPreview);
        };
    }, [receiptPreview]);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const { valid, error: validationError } = validateImageFile(file);
            if (!valid) {
                if (typeof showNotify === 'function') {
                    showNotify(validationError || 'Archivo no válido', 'error');
                }
                e.target.value = '';
                return;
            }
            if (receiptPreview) URL.revokeObjectURL(receiptPreview);
            setReceiptFile(file);
            setReceiptPreview(URL.createObjectURL(file));
        }
    };

    const removeReceipt = () => {
        setReceiptFile(null);
        setReceiptPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    };

    const resetReceipt = () => {
        setReceiptFile(null);
        setReceiptPreview(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    };

	const restoreReceipt = (blob) => {
		if (!(blob instanceof Blob)) return;
		const file = blob instanceof File
			? blob
			: new File([blob], 'comprobante-restaurado.jpg', { type: blob.type || 'image/jpeg' });
		const { valid, error: validationError } = validateImageFile(file);
		if (!valid) {
			showNotify?.(validationError || 'El comprobante del borrador ya no es válido.', 'warning');
			return;
		}
		setReceiptFile(file);
		setReceiptPreview((previous) => {
			if (previous) URL.revokeObjectURL(previous);
			return URL.createObjectURL(file);
		});
	};

    return {
        receiptFile,
        receiptPreview,
        handleFileChange,
        removeReceipt,
		resetReceipt,
		restoreReceipt,
    };
};
