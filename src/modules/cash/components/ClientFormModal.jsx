import React, { useMemo, useState } from 'react';
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


	return (
		<div className="modal-overlay animate-fade" onClick={onClose}>
			<div className="modal-content glass admin-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3>Nuevo Cliente</h3>
					<Button variant="default" onClick={onClose} className="btn-close"><X size={24} /></Button>
				</div>

				<form id="client-form" onSubmit={handleSubmit} className="modal-body">
					<div className="form-group">
						<label>Nombre Completo *</label>
						<input
							required
							type="text"
							name="name"
							className="form-input"
							placeholder="Ej: Juan Pérez"
							value={formData.name}
							onChange={handleChange}
							autoFocus
						/>
					</div>

					<div className="form-group">
						<label>Teléfono *</label>
						<input
							required
							type="tel"
							name="phone"
							className="form-input"
							placeholder={strategy.phonePrefix}
							value={formData.phone}
							onChange={handleChange}
						/>
					</div>

					<div className="form-group">
						<label>{strategy.idName} (Opcional)</label>
						<input
							type="text"
							name="rut"
							className="form-input"
							placeholder={strategy.idName === 'Cédula / RIF' ? 'V-12345678' : '12.345.678-9'}
							value={formData.rut}
							onChange={handleChange}
						/>
					</div>
				</form>
				<div className="modal-footer">
					<Button variant="secondary" type="button" onClick={onClose} className="">Cancelar</Button>
					<Button variant="default"
						type="submit"
						form="client-form"
						className=""
						disabled={loading || sanitizeText(formData.name).length < 2 || !strategy.validatePhone(formData.phone || '')}
					>
						{loading ? <Loader2 className="animate-spin" size={18} /> : 'Guardar Cliente'}
					</Button>
				</div>
			</div>
		</div>
	);
};

export default ClientFormModal;
