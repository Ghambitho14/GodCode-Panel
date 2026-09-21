import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PauseCircle, PlayCircle, AlertTriangle } from 'lucide-react';
import { supabase, TABLES, getCurrentUser } from '@/integrations/supabase';
import {
	DEFAULT_ORDER_INTAKE_PAUSE_MESSAGE,
	getOrderIntakeStatus,
	setOrderIntakePaused,
} from '../services/orderIntakeService';
import { openHeaderPopover, listenHeaderPopoverOpen } from '../utils/headerPopoverEvents';
import { isValidBranchId } from '@/shared/utils/safeIds';
import { Button } from "@/components/ui/button";

/**
 * Control de pausa de pedidos online (menú público) por sucursal.
 */
export default function OrderIntakePauseControl({
	branchId,
	showNotify,
	disabled = false,
	disabledReason = '',
}) {
	const [status, setStatus] = useState({
		paused: false,
		message: null,
		displayMessage: DEFAULT_ORDER_INTAKE_PAUSE_MESSAGE,
	});
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [messageDraft, setMessageDraft] = useState('');
	const [confirmPauseOpen, setConfirmPauseOpen] = useState(false);
	const [confirmPos, setConfirmPos] = useState(null);
	const triggerRef = useRef(null);

	/**
	 * El diálogo se monta en un portal (ver más abajo), así que sus coordenadas son
	 * de viewport: hay que calcular también el centro horizontal. Antes bastaba con
	 * `left: 50%` porque colgaba de la cabecera y heredaba su sistema de referencia.
	 */
	const updateConfirmPos = useCallback(() => {
		if (typeof window === 'undefined') return;
		const cluster = document.querySelector('.header-actions-cluster');
		const headerActions = document.querySelector('.header-actions');
		const clusterVisible = cluster && cluster.getBoundingClientRect().height > 0;
		// En móvil el clúster mide 0 de alto; el botón es el último recurso para que
		// la posición nunca quede sin calcular y el diálogo fuera de pantalla.
		const ref = clusterVisible ? cluster : (headerActions || triggerRef.current);
		if (!ref) return;
		const r = ref.getBoundingClientRect();
		const width = Math.min(320, window.innerWidth - 24);
		const half = width / 2;
		const centered = r.left + r.width / 2;
		const left = Math.min(Math.max(centered, half + 12), window.innerWidth - half - 12);
		setConfirmPos({ top: r.bottom + 8, left });
	}, []);

	const branchValid = isValidBranchId(branchId);
	const isDisabled = disabled || !branchValid || loading || saving;

	const loadStatus = useCallback(async () => {
		if (!branchValid) {
			setStatus({
				paused: false,
				message: null,
				displayMessage: DEFAULT_ORDER_INTAKE_PAUSE_MESSAGE,
			});
			return;
		}
		setLoading(true);
		try {
			const next = await getOrderIntakeStatus(branchId);
			setStatus(next);
			setMessageDraft(next.message || '');
		} catch {
			if (showNotify) showNotify('No se pudo cargar el estado de pedidos online', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchId, branchValid, showNotify]);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	const resolvePanelUserId = async () => {
		const authId = getCurrentUser()?.id;
		if (!authId) return null;
		const { data: row } = await supabase
			.from(TABLES.users)
			.select('id')
			.eq('auth_user_id', authId)
			.maybeSingle();
		return row?.id ?? null;
	};

	const applyPaused = async (paused) => {
		if (!branchValid) return;
		setSaving(true);
		try {
			const userId = paused ? await resolvePanelUserId() : null;
			const next = await setOrderIntakePaused(branchId, {
				paused,
				message: paused ? messageDraft : null,
				userId,
			});
			setStatus(next);
			setMessageDraft(next.message || '');
			setConfirmPauseOpen(false);
			if (showNotify) {
				showNotify(
					paused
						? 'Pedidos online pausados para esta sucursal'
						: 'Pedidos online reactivados',
					'info',
				);
			}
		} catch (err) {
			if (showNotify) {
				showNotify(err?.message || 'Error al actualizar la pausa', 'error');
			}
		} finally {
			setSaving(false);
		}
	};

	useLayoutEffect(() => {
		if (!confirmPauseOpen) return undefined;
		updateConfirmPos();
		const onReposition = () => updateConfirmPos();
		window.addEventListener('scroll', onReposition, true);
		window.addEventListener('resize', onReposition);
		return () => {
			window.removeEventListener('scroll', onReposition, true);
			window.removeEventListener('resize', onReposition);
		};
	}, [confirmPauseOpen, updateConfirmPos]);

	useEffect(() => {
		if (!confirmPauseOpen) return undefined;
		return listenHeaderPopoverOpen((source) => {
			if (source !== 'pause') setConfirmPauseOpen(false);
		});
	}, [confirmPauseOpen]);

	const handleToggleClick = () => {
		if (isDisabled) return;
		if (status.paused) {
			void applyPaused(false);
			return;
		}
		setConfirmPauseOpen(true);
		openHeaderPopover('pause');
	};

	const title =
		disabledReason ||
		(!branchValid ? 'Selecciona una sucursal concreta' : undefined);

	return (
		<div
			className={`order-intake-pause order-intake-pause--combined${status.paused ? ' order-intake-pause--active' : ''}`}
			title={title}
		>
			<Button variant="default"
				ref={triggerRef}
				type="button"
				className={`order-intake-pause__combined inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors ${status.paused ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
				onClick={handleToggleClick}
				disabled={isDisabled}
				aria-busy={saving}
			>
				{status.paused ? (
					<>
						<PauseCircle size={14} aria-hidden />
						<span>Pedidos online: Pausados</span>
					</>
				) : (
					<>
						<PlayCircle size={14} aria-hidden />
						<span>Pedidos online: Activos</span>
					</>
				)}
			</Button>

				{/* La cabecera lleva `transform: translate3d(0,0,0)` (truco de sticky en iOS)
				y en móvil añade `overflow-x: hidden`. Eso convertía a la cabecera en el
				bloque contenedor de este `position: fixed` y lo recortaba a su alto:
				en el teléfono el diálogo se montaba pero no se veía nada. En un portal
				cuelga de `.admin-layout`, que no tiene transform, así que vuelve a ser
				relativo al viewport (y sigue heredando los tokens del panel). */}
			{confirmPauseOpen ? createPortal((
					<div
						className="order-intake-pause__confirm glass"
						role="dialog"
						aria-label="Confirmar pausa de pedidos online"
						style={confirmPos ? { top: confirmPos.top, left: confirmPos.left, transform: 'translateX(-50%)' } : undefined}
					>
					<div className="order-intake-pause__confirm-head">
						<AlertTriangle size={18} aria-hidden />
						<strong>Pausar pedidos online</strong>
					</div>
					<p className="order-intake-pause__confirm-lead">
						Los clientes verán un aviso en el menú público y no podrán completar pedidos. Los
						pedidos manuales del panel siguen disponibles.
					</p>
					<label className="order-intake-pause__label" htmlFor="order-intake-pause-message">
						Mensaje para clientes (opcional)
					</label>
					<textarea
						id="order-intake-pause-message"
						className="form-input order-intake-pause__textarea"
						rows={3}
						value={messageDraft}
						onChange={(e) => setMessageDraft(e.target.value)}
						placeholder={DEFAULT_ORDER_INTAKE_PAUSE_MESSAGE}
					/>
					<p className="order-intake-pause__preview-label">Vista previa</p>
					<p className="order-intake-pause__preview">
						{messageDraft.trim() || DEFAULT_ORDER_INTAKE_PAUSE_MESSAGE}
					</p>
					<div className="order-intake-pause__confirm-actions">
						<Button variant="secondary"
							type="button"
							className=""
							onClick={() => setConfirmPauseOpen(false)}
							disabled={saving}
						>
							Cancelar
						</Button>
						<Button variant="destructive"
							type="button"
							className=""
							onClick={() => void applyPaused(true)}
							disabled={saving}
						>
							{saving ? 'Guardando…' : 'Confirmar pausa'}
						</Button>
					</div>
				</div>
			), document.querySelector('.admin-layout') || document.body) : null}
		</div>
	);
}
