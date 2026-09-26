import React from 'react';
import { ImageUp } from 'lucide-react';
import { useRevealOnMount } from './useRevealOnMount';

function formatFileSize(bytes) {
	const size = Number(bytes) || 0;
	if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(size / 1024))} KB`;
}

/** Foto del comprobante de transferencia o pago móvil. */
export default function CobroEvidence({ required, receiptFile, receiptPreview, onFileChange, onRemove }) {
	const ref = useRevealOnMount();
	return (
		<div ref={ref} className="cobro-evidence">
			<div className="cobro-evidence__head">
				<span className="cobro-evidence__title">Comprobante</span>
				<span className={`cobro-evidence__badge${required ? ' cobro-evidence__badge--required' : ''}`}>
					{required ? 'Obligatorio' : 'Opcional'}
				</span>
			</div>
			{receiptFile && receiptPreview ? (
				<div className="cobro-evidence__file">
					<img className="cobro-evidence__thumb" src={receiptPreview} alt="Comprobante adjunto" />
					<span className="cobro-evidence__file-text">
						<span className="cobro-evidence__file-name">{receiptFile.name}</span>
						<span className="cobro-evidence__file-size">{formatFileSize(receiptFile.size)}</span>
					</span>
					<button type="button" className="cobro-evidence__remove" onClick={onRemove}>
						Quitar
					</button>
				</div>
			) : (
				<label className="cobro-evidence__drop">
					<input type="file" accept="image/*" className="sr-only" onChange={onFileChange} />
					<span className="cobro-evidence__drop-icon" aria-hidden>
						<ImageUp size={20} strokeWidth={2} />
					</span>
					<span className="cobro-evidence__drop-text">
						<span className="cobro-evidence__drop-title">Subir foto del comprobante</span>
						<span className="cobro-evidence__drop-hint">
							{required ? 'Sin el comprobante no se puede registrar este pago.' : 'Puedes subirlo ahora o después desde la tarjeta del pedido.'}
						</span>
					</span>
				</label>
			)}
		</div>
	);
}
