import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { supabase, TABLES } from '@/integrations/supabase';
import { getFormStrategy } from '@/lib/geo/country-forms';
import { normalizeManualPhone } from '@/modules/cash/services/clientService';
import { Button } from "@/components/ui/button";

const MAX_NAME_LENGTH = 200;

const sanitizeText = (value) => {
	if (value == null) return '';
	const raw = String(value).replace(/<[^>]*>?/gm, '').trim();
	return raw.slice(0, MAX_NAME_LENGTH);
};

const ClientFormModal = ({ isOpen, onClose, onClientCreated, showNotify, companyId, formCountry = 'CL' }) => {
	const strategy = useMemo(() => getFormStrategy(formCountry), [formCountry]);
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		phone: '',
		email: '',
		rut: '',
	});

	if (!isOpen) return null;

	const handleChange = (e) => {
		const { name, value } = e.target;
		let finalValue = value;
		if (name === 'rut') finalValue = strategy.formatId(value);
		if (name === 'name') finalValue = sanitizeText(value);
		setFormData({ ...formData, [name]: finalValue });
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);

		const name = sanitizeText(formData.name);
		const phone = normalizeManualPhone(String(formData.phone ?? '').trim());
		const rut = String(formData.rut ?? '').trim();

		if (name.length < 2) {
			showNotify('El nombre debe tener al menos 2 caracteres', 'error');
			setLoading(false);
			return;
		}
		if (!strategy.validatePhone(phone)) {
			showNotify('El teléfono no es válido', 'error');
			setLoading(false);
			return;
		}
		if (rut && !strategy.validateId(rut)) {
			showNotify(`El ${strategy.idName} no es válido`, 'error');
			setLoading(false);
			return;
		}

		try {
			if (!companyId) {
				showNotify('No hay empresa asociada para crear el cliente', 'error');
				setLoading(false);
				return;
			}
			const { data, error } = await supabase
				.from(TABLES.clients)
				.insert([{
					name,
					phone,
					rut: rut || null,
					company_id: companyId,
					total_spent: 0,
					created_at: new Date().toISOString(),
				}])
				.select()
				.single();

			if (error) throw error;

			showNotify('Cliente creado exitosamente', 'success');
			onClientCreated(data);
			onClose();
			setFormData({ name: '', phone: '', email: '', rut: '' });
		} catch (error) {
			console.error('Error creando cliente:', error);
			showNotify('Error al crear cliente', 'error');
		} finally {
			setLoading(false);
		}
	};

	const modal = (
		<div className="client-form-modal-overlay" onClick={onClose} role="presentation">
			<div
				className="client-form-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="client-form-modal-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="client-form-modal__header">
					<h3 id="client-form-modal-title">Nuevo Cliente</h3>
					<button type="button" onClick={onClose} className="client-form-modal__close" aria-label="Cerrar">
						<X size={18} />
					</button>
				</div>

				<form id="client-form" onSubmit={handleSubmit} className="client-form-modal__body">
					<div className="client-form-modal__field">
						<label htmlFor="client-form-name">Nombre Completo *</label>
							<input
							id="client-form-name"
							type="text"
							name="name"
							placeholder="Ej: Juan Pérez"
							value={formData.name}
							onChange={handleChange}
							autoFocus
						/>
					</div>

					<div className="client-form-modal__field">
						<label htmlFor="client-form-phone">Teléfono *</label>
						<input
							id="client-form-phone"
							type="tel"
							name="phone"
							placeholder={strategy.phonePrefix}
							value={formData.phone}
							onChange={handleChange}
						/>
					</div>

					<div className="client-form-modal__field">
						<label htmlFor="client-form-rut">{strategy.idName} (Opcional)</label>
						<input
							id="client-form-rut"
							type="text"
							name="rut"
							placeholder={strategy.idName === 'Cédula / RIF' ? 'V-12345678' : '12.345.678-9'}
							value={formData.rut}
							onChange={handleChange}
						/>
					</div>
				</form>

				<div className="client-form-modal__footer">
					<Button variant="secondary" type="button" size="sm" onClick={onClose}>
						Cancelar
					</Button>
					<Button
						variant="default"
						type="submit"
						form="client-form"
						size="sm"
						disabled={loading || sanitizeText(formData.name).length < 2 || !strategy.validatePhone(formData.phone || '')}
					>
						{loading ? <Loader2 className="animate-spin" size={18} /> : 'Guardar Cliente'}
					</Button>
				</div>
			</div>
		</div>
	);

	return createPortal(modal, document.querySelector('.admin-layout') || document.body);
};

export default ClientFormModal;
