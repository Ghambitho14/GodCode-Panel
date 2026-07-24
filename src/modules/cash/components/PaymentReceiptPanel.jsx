import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ExternalLink,
    FileImage,
    ImageOff,
    Loader2,
    RefreshCw,
    Upload,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    invalidateSignedImageUrl,
    useSignedImageUrl,
} from '@/shared/hooks/useSignedImageUrl';
import { isStorageObjectReference } from '@/shared/utils/supabaseStorage';
import { manualOrderV2Service } from '@/modules/cash/services/manualOrderV2Service';
import '@/modules/cash/styles/PaymentReceiptPanel.css';

function evidenceCopy(status) {
    if (status === 'uploading') return 'Subiendo comprobante';
    if (status === 'pending') return 'Carga pendiente';
    if (status === 'failed') return 'Falló la carga';
    if (status === 'uploaded') return 'Comprobante guardado';
    if (status === 'pending_verification') return 'Pendiente de verificación';
    if (status === 'verified') return 'Pago verificado';
    if (status === 'rejected') return 'Comprobante rechazado';
    return 'Sin comprobante';
}

function ReceiptImage({ source }) {
    const [imageFailed, setImageFailed] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const { url, loading, error } = useSignedImageUrl(
        source,
        'receipts',
        3600,
        Boolean(source),
        refreshKey,
    );

    useEffect(() => setImageFailed(false), [url]);

    const retry = () => {
        invalidateSignedImageUrl(source, 'receipts');
        setImageFailed(false);
        setRefreshKey((value) => value + 1);
    };

    if (loading) {
        return (
            <div className="payment-receipt-panel__viewer-state" role="status">
                <Loader2 size={28} className="animate-spin" aria-hidden />
                <strong>Abriendo comprobante…</strong>
                <span>Generando acceso seguro al archivo privado.</span>
            </div>
        );
    }

    if (error || imageFailed || !url) {
        return (
            <div className="payment-receipt-panel__viewer-state payment-receipt-panel__viewer-state--error" role="alert">
                <ImageOff size={30} aria-hidden />
                <strong>No se pudo mostrar el archivo</strong>
                <span>{error || 'El archivo ya no existe o no es una imagen válida.'}</span>
                <Button type="button" variant="secondary" onClick={retry}>
                    <RefreshCw size={15} aria-hidden /> Reintentar
                </Button>
            </div>
        );
    }

    return (
        <figure className="payment-receipt-panel__figure">
            <img src={url} alt="Comprobante de pago" onError={() => setImageFailed(true)} />
            <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={15} aria-hidden /> Abrir tamaño completo
            </a>
        </figure>
    );
}

export default function PaymentReceiptPanel({
    order,
    preview,
    uploading,
    onFileChange,
    onClearPreview,
    onSave,
    onClose,
}) {
    const inputRef = useRef(null);
    const panelRef = useRef(null);
    const closeButtonRef = useRef(null);
    const uploadingRef = useRef(uploading);
    uploadingRef.current = uploading;
    const [evidencePath, setEvidencePath] = useState(null);
    const [evidenceLoading, setEvidenceLoading] = useState(false);

    const paymentRefPath = useMemo(
        () => isStorageObjectReference(order?.payment_ref, 'receipts')
            ? String(order.payment_ref).trim()
            : null,
        [order?.payment_ref],
    );
    const shouldReadEvidence = Boolean(
        order?.id
        && !paymentRefPath
        && (
            order?.manual_order_mode === 'quick_sale'
            || order?.manual_order_mode === 'session'
            || order?.payment_evidence_status
        ),
    );

    useEffect(() => {
        let cancelled = false;
        setEvidencePath(null);
        if (!shouldReadEvidence) return undefined;
        setEvidenceLoading(true);
        manualOrderV2Service.listEvidence(order.id)
            .then((rows) => {
                if (cancelled) return;
                const stored = [...(rows ?? [])]
                    .reverse()
                    .find((row) => isStorageObjectReference(row?.storage_path, 'receipts'));
                setEvidencePath(stored?.storage_path ?? null);
            })
            .catch(() => {
                if (!cancelled) setEvidencePath(null);
            })
            .finally(() => {
                if (!cancelled) setEvidenceLoading(false);
            });
        return () => { cancelled = true; };
    }, [order?.id, shouldReadEvidence]);

    const source = paymentRefPath || evidencePath;
    const status = order?.payment_evidence_status;
    const close = () => {
        if (!uploadingRef.current) onClose?.();
    };

    useEffect(() => {
        const previouslyFocused = document.activeElement;
        closeButtonRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...(panelRef.current?.querySelectorAll(
                'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ) ?? [])].filter((element) => element.getClientRects().length > 0);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus?.();
        };
    // The mutable ref keeps the Escape guard current without resetting focus during upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const clearSelection = () => {
        if (inputRef.current) inputRef.current.value = '';
        onClearPreview?.();
    };
    const save = () => {
        const file = inputRef.current?.files?.[0];
        if (file) onSave?.(file);
    };

    return (
        <div
            className="admin-panel-overlay payment-receipt-panel__overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
            }}
        >
            <aside
                ref={panelRef}
                className="admin-side-panel admin-receipt-side-panel payment-receipt-panel animate-slide-in"
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-receipt-title"
            >
                <header className="payment-receipt-panel__header">
                    <div>
                        <span className="payment-receipt-panel__eyebrow">Pedido #{order?.id}</span>
                        <h2 id="payment-receipt-title">Comprobante de pago</h2>
                    </div>
                    <Button ref={closeButtonRef} type="button" variant="ghost" onClick={close} disabled={uploading} aria-label="Cerrar">
                        <X size={20} aria-hidden />
                    </Button>
                </header>

                <div className="payment-receipt-panel__body">
                    <div className="payment-receipt-panel__status-row">
                        <span className={`payment-receipt-panel__status payment-receipt-panel__status--${status || (source ? 'uploaded' : 'empty')}`}>
                            {evidenceCopy(status || (source ? 'uploaded' : null))}
                        </span>
                        {order?.payment_method_specific ? (
                            <span className="payment-receipt-panel__method">
                                {order.payment_method_specific.replaceAll('_', ' ')}
                            </span>
                        ) : null}
                    </div>

                    <section className="payment-receipt-panel__viewer" aria-label="Vista del comprobante actual">
                        {preview ? (
                            <figure className="payment-receipt-panel__figure payment-receipt-panel__figure--preview">
                                <img src={preview} alt="Nuevo comprobante seleccionado" />
                                <figcaption>Vista previa del nuevo archivo</figcaption>
                            </figure>
                        ) : evidenceLoading ? (
                            <div className="payment-receipt-panel__viewer-state" role="status">
                                <Loader2 size={28} className="animate-spin" aria-hidden />
                                <strong>Buscando comprobante…</strong>
                            </div>
                        ) : source ? (
                            <ReceiptImage source={source} />
                        ) : (
                            <div className="payment-receipt-panel__viewer-state">
                                <FileImage size={32} aria-hidden />
                                <strong>No hay un archivo adjunto</strong>
                                <span>
                                    {status === 'failed'
                                        ? 'La carga anterior falló. Selecciona la imagen nuevamente.'
                                        : 'Puedes adjuntar una imagen JPG, PNG, WebP o GIF.'}
                                </span>
                            </div>
                        )}
                    </section>

                    <section className="payment-receipt-panel__replace">
                        <div>
                            <strong>{source ? 'Reemplazar comprobante' : 'Adjuntar comprobante'}</strong>
                            <span>Máximo 5 MB. El archivo anterior se conserva hasta completar el guardado.</span>
                        </div>
                        <label className="payment-receipt-panel__upload">
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={onFileChange}
                            />
                            <Upload size={17} aria-hidden />
                            {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
                        </label>
                        {preview ? (
                            <Button type="button" variant="ghost" onClick={clearSelection} disabled={uploading}>
                                Quitar selección
                            </Button>
                        ) : null}
                    </section>

                    {status === 'failed' ? (
                        <div className="payment-receipt-panel__notice" role="status">
                            <AlertTriangle size={17} aria-hidden />
                            El pedido está guardado; solamente falta reintentar el comprobante.
                        </div>
                    ) : null}
                </div>

                <footer className="payment-receipt-panel__footer">
                    <Button type="button" variant="secondary" onClick={close} disabled={uploading}>
                        Cerrar
                    </Button>
                    <Button type="button" onClick={save} disabled={uploading || !preview}>
                        {uploading
                            ? <Loader2 size={17} className="animate-spin" aria-hidden />
                            : <Upload size={17} aria-hidden />}
                        {uploading ? 'Guardando…' : source ? 'Guardar reemplazo' : 'Guardar comprobante'}
                    </Button>
                </footer>
            </aside>
        </div>
    );
}
