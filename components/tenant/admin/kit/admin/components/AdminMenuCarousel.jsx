"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
	Loader2, Trash2, ChevronUp, ChevronDown, ImagePlus, Star, MoreVertical,
	MonitorSmartphone, Calendar, GripVertical, ExternalLink, Sparkles,
} from 'lucide-react';
import { uploadImage } from '../../shared/utils/cloudinary';
import AdminIconSlot from './AdminIconSlot';
import '../styles/AdminMenuCarousel.css';

const shortUrlSnippet = (url) => {
	if (!url) return '—';
	try {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			const u = new URL(url);
			const parts = u.pathname.split('/').filter(Boolean);
			const last = parts[parts.length - 1] || u.hostname;
			return last.length > 40 ? `${last.slice(0, 38)}…` : last;
		}
	} catch {
		/* ignore */
	}
	const t = url.replace(/^https?:\/\//, '');
	return t.length > 44 ? `${t.slice(0, 42)}…` : t;
};

const isCloudinaryUrl = (url) => typeof url === 'string' && url.includes('res.cloudinary.com');

export default function AdminMenuCarousel({
	showNotify,
	selectedBranch,
	companyId,
}) {
	const [loading, setLoading] = useState(true);
	const [savingSettings, setSavingSettings] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [banners, setBanners] = useState([]);
	const [intervalSec, setIntervalSec] = useState(5);
	const [maxSlides, setMaxSlides] = useState(10);
	const [menuOpenId, setMenuOpenId] = useState(null);

	const branchId = selectedBranch?.id && selectedBranch.id !== 'all' ? selectedBranch.id : null;
	const cloudinaryFolder = companyId && branchId
		? `menu_carousel/${companyId}/${branchId}`
		: 'menu_carousel';

	const load = useCallback(async () => {
		if (!branchId) {
			setBanners([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(`/api/tenant-menu-carousel?branchId=${encodeURIComponent(branchId)}`, {
				cache: 'no-store',
				credentials: 'include',
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Error al cargar el carrusel');
			}
			setBanners(Array.isArray(data.banners) ? data.banners : []);
			const s = data.settings || {};
			setIntervalSec(Math.max(2, Math.round((s.intervalMs ?? 5000) / 1000)));
			setMaxSlides(s.maxSlides ?? 10);
		} catch (e) {
			setBanners([]);
			showNotify(e instanceof Error ? e.message : 'Error al cargar', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchId, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (!menuOpenId) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') setMenuOpenId(null);
		};
		document.addEventListener('keydown', onKey);
		/** Evita que el mismo clic que abre el menú dispare el cierre en fase burbuja. */
		const onDoc = (e) => {
			if (e.target instanceof Element && e.target.closest('.menu-carousel-kebab-wrap')) return;
			setMenuOpenId(null);
		};
		const t = window.setTimeout(() => {
			document.addEventListener('click', onDoc);
		}, 0);
		return () => {
			window.clearTimeout(t);
			document.removeEventListener('click', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [menuOpenId]);

	const persistReorder = async (nextList) => {
		if (!branchId) return;
		const orderedIds = nextList.map((b) => b.id);
		const res = await fetch('/api/tenant-menu-carousel', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: 'reorder', branchId, orderedIds }),
		});
		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'No se pudo reordenar');
		}
	};

	const move = async (index, dir) => {
		const j = index + dir;
		if (j < 0 || j >= banners.length) return;
		const next = [...banners];
		[next[index], next[j]] = [next[j], next[index]];
		setBanners(next);
		try {
			await persistReorder(next);
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error al reordenar', 'error');
			void load();
		}
	};

	const saveSettings = async () => {
		setSavingSettings(true);
		try {
			const intervalMs = Math.min(60, Math.max(2, Number(intervalSec) || 5)) * 1000;
			const clampedMaxSlides = Math.min(20, Math.max(1, Number(maxSlides) || 10));
			const res = await fetch('/api/tenant-menu-carousel', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					scope: 'settings',
					intervalMs,
					maxSlides: clampedMaxSlides,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'No se pudo guardar');
			}
			const out = data.settings || {};
			setIntervalSec(Math.round((out.intervalMs ?? intervalMs) / 1000));
			setMaxSlides(out.maxSlides ?? clampedMaxSlides);
			showNotify('Ajustes del carrusel guardados.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error al guardar', 'error');
		} finally {
			setSavingSettings(false);
		}
	};

	const patchBanner = async (bannerId, payload) => {
		const res = await fetch('/api/tenant-menu-carousel', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: 'banner', bannerId, ...payload }),
		});
		const data = await res.json();
		if (!res.ok) {
			throw new Error(data.error || 'No se pudo actualizar');
		}
		return data.banner ?? null;
	};

	const mergeBanner = (bannerId, updated) => {
		if (!updated) return;
		setBanners((prev) => prev.map((b) => (b.id === bannerId ? { ...b, ...updated } : b)));
	};

	const bannerPromoOn = (b) => b.promotion_duration_enabled === true;

	const toggleBannerPromo = async (banner) => {
		const next = !bannerPromoOn(banner);
		const days = Math.min(90, Math.max(1, Number(banner.promotion_duration_days) || 7));
		try {
			const updated = await patchBanner(banner.id, {
				promotion_duration_enabled: next,
				promotion_duration_days: days,
			});
			mergeBanner(banner.id, updated);
			showNotify(next ? 'Duración de promoción activada para esta imagen.' : 'Sin límite de días para esta imagen.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error', 'error');
			void load();
		}
	};

	const saveBannerPromoDays = async (banner, raw) => {
		if (!bannerPromoOn(banner)) return;
		const d = Math.min(90, Math.max(1, Math.round(Number(raw)) || 7));
		const prev = Math.min(90, Math.max(1, Number(banner.promotion_duration_days) || 7));
		if (d === prev) return;
		try {
			const updated = await patchBanner(banner.id, {
				promotion_duration_enabled: true,
				promotion_duration_days: d,
			});
			mergeBanner(banner.id, updated);
			showNotify('Días de promoción actualizados.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error', 'error');
			void load();
		}
	};

	const toggleActive = async (banner) => {
		try {
			const updated = await patchBanner(banner.id, { is_active: !banner.is_active });
			mergeBanner(banner.id, updated);
			if (!updated) {
				setBanners((prev) => prev.map((b) => (
					b.id === banner.id ? { ...b, is_active: !b.is_active } : b
				)));
			}
			showNotify(banner.is_active ? 'Diapositiva oculta en el menú.' : 'Diapositiva activa.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error', 'error');
		}
	};

	const removeBanner = async (banner) => {
		if (!window.confirm('¿Eliminar esta imagen del carrusel?')) return;
		setMenuOpenId(null);
		try {
			const res = await fetch(`/api/tenant-menu-carousel?bannerId=${encodeURIComponent(banner.id)}`, {
				method: 'DELETE',
				credentials: 'include',
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'No se pudo eliminar');
			}
			setBanners((prev) => prev.filter((b) => b.id !== banner.id));
			showNotify('Imagen eliminada.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error', 'error');
		}
	};

	const onPickFile = async (e) => {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file || !branchId) return;
		setUploading(true);
		try {
			const url = await uploadImage(file, cloudinaryFolder);
			const res = await fetch('/api/tenant-menu-carousel', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ branchId, imageUrl: url }),
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'No se pudo registrar la imagen');
			}
			if (data.banner) {
				setBanners((prev) => [...prev, data.banner].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
			}
			showNotify('Imagen subida al carrusel.');
		} catch (err) {
			showNotify(err instanceof Error ? err.message : 'Error al subir', 'error');
		} finally {
			setUploading(false);
		}
	};

	if (!branchId) {
		return (
			<div className="glass animate-fade menu-carousel-panel menu-carousel-panel-inner">
				<div className="menu-carousel-branch-hint">
					<p className="menu-carousel-hint">
						Selecciona una <strong className="text-accent">sucursal</strong> en el encabezado para editar el carrusel del menú (cada local tiene su propia lista de imágenes).
					</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="glass animate-fade menu-carousel-panel menu-carousel-panel-inner menu-carousel-loading">
				<AdminIconSlot Icon={Loader2} slotSize="lg" className="animate-spin" />
			</div>
		);
	}

	const branchLabel = selectedBranch?.name ? ` · ${selectedBranch.name}` : '';

	return (
		<div className="glass animate-fade menu-carousel-panel menu-carousel-panel-inner">
			<header className="menu-carousel-header">
				<p className="menu-carousel-eyebrow">Menú público · Carrusel</p>
				<h2 className="menu-carousel-title">
					Imágenes del carrusel{branchLabel}
				</h2>
				<p className="menu-carousel-sub">
					Configura el orden y la visibilidad de cada diapositiva. El intervalo entre fotos y cuántas rotan a la vez se aplican a toda la empresa en el menú público.
				</p>
			</header>

			<section className="menu-carousel-settings-block" aria-labelledby="carousel-settings-heading">
				<h3 id="carousel-settings-heading">Comportamiento en el menú</h3>
				<div className="menu-carousel-settings">
					<div className="form-group">
						<label htmlFor="carousel-interval">Segundos entre fotos</label>
						<input
							id="carousel-interval"
							type="number"
							min={2}
							max={60}
							value={intervalSec}
							onChange={(ev) => setIntervalSec(ev.target.value)}
							className="form-input"
						/>
					</div>
					<div className="form-group">
						<label htmlFor="carousel-max">Máximo en rotación</label>
						<input
							id="carousel-max"
							type="number"
							min={1}
							max={20}
							value={maxSlides}
							onChange={(ev) => setMaxSlides(ev.target.value)}
							className="form-input"
						/>
					</div>
					<div className="form-group menu-carousel-save-wrap">
						<button
							type="button"
							className="btn btn-primary menu-carousel-settings-save-btn"
							onClick={() => void saveSettings()}
							disabled={savingSettings}
						>
							{savingSettings ? 'Guardando…' : 'Guardar ajustes'}
						</button>
					</div>
				</div>
			</section>

			<div className="menu-carousel-toolbar">
				<h3>
					Lista de diapositivas
					<span className="menu-carousel-count">{banners.length === 0 ? '(vacía)' : `(${banners.length})`}</span>
				</h3>
				<div>
					<label className="btn btn-secondary menu-carousel-upload-inline" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
						{uploading ? (
							<AdminIconSlot Icon={Loader2} slotSize="sm" className="animate-spin" />
						) : (
							<AdminIconSlot Icon={ImagePlus} slotSize="sm" tone="accent" />
						)}
						{uploading ? 'Subiendo…' : 'Añadir imagen'}
						<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(ev) => void onPickFile(ev)} />
					</label>
					<span className="menu-carousel-upload-hint"> · JPG, PNG o WebP, máx. 5 MB</span>
				</div>
			</div>

			{banners.length === 0 ? (
				<div className="menu-carousel-empty">
					<p>Aún no hay diapositivas para esta sucursal. Sube imágenes promocionales o del menú; aparecerán en el carrusel del menú público cuando estén activas.</p>
					<label className="btn btn-primary" style={{ cursor: uploading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
						{uploading ? (
							<Loader2 size={18} color="#fff" className="animate-spin" aria-hidden />
						) : (
							<ImagePlus size={18} color="#fff" aria-hidden />
						)}
						{uploading ? 'Subiendo…' : 'Subir primera imagen'}
						<input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(ev) => void onPickFile(ev)} />
					</label>
				</div>
			) : (
				<div className="menu-carousel-table-outer">
					<ul className="menu-carousel-slide-list" aria-label="Diapositivas del carrusel">
						{banners.map((b, idx) => {
							const created = b.created_at ? new Date(b.created_at) : null;
							const dateStr = created && Number.isFinite(created.getTime())
								? created.toLocaleDateString('es-CL')
								: '—';
							return (
								<li
									key={b.id}
									className={`menu-carousel-slide-card ${b.is_active ? 'is-active' : 'is-muted'}`}
								>
									<a
										href={b.image_url}
										target="_blank"
										rel="noopener noreferrer"
										className="menu-carousel-slide-card-thumb"
										aria-label={`Abrir imagen de la diapositiva ${idx + 1} en nueva pestaña`}
									>
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img src={b.image_url} alt="" className="menu-carousel-slide-thumb" loading="lazy" />
										<span className="menu-carousel-thumb-open">
											<AdminIconSlot Icon={ExternalLink} slotSize="xxs" />
										</span>
									</a>
									<div className="menu-carousel-slide-card-main">
										<div className="menu-carousel-slide-card-head">
											<div className="menu-carousel-slide-titles">
												<p className="menu-carousel-slide-eyebrow">
													<AdminIconSlot Icon={GripVertical} slotSize="xxs" className="menu-carousel-slide-eyebrow-slot" />
													Diapositiva {idx + 1}
												</p>
												<h4 className="menu-carousel-slide-filename" title={b.image_url}>
													{shortUrlSnippet(b.image_url)}
												</h4>
											</div>
											<span
												className={`menu-carousel-chip menu-carousel-chip--status ${b.is_active ? 'menu-carousel-chip--on' : ''}`}
											>
												<span className="menu-carousel-chip-dot" aria-hidden />
												{b.is_active ? 'Visible en menú' : 'Oculta'}
											</span>
										</div>
										<div className="menu-carousel-slide-meta">
											<span className="menu-carousel-chip menu-carousel-chip--neutral">
												<AdminIconSlot Icon={Star} slotSize="xxs" />
												Orden {b.sort_order ?? idx}
											</span>
											<span className={`menu-carousel-chip ${isCloudinaryUrl(b.image_url) ? 'menu-carousel-chip--accent' : 'menu-carousel-chip--neutral'}`}>
												{isCloudinaryUrl(b.image_url) ? 'Cloudinary' : 'URL externa'}
											</span>
											<span className="menu-carousel-chip menu-carousel-chip--neutral">
												<AdminIconSlot Icon={Calendar} slotSize="xxs" />
												{dateStr}
											</span>
											<span className="menu-carousel-chip menu-carousel-chip--neutral menu-carousel-chip--hide-sm">
												<AdminIconSlot Icon={MonitorSmartphone} slotSize="xxs" />
												Menú digital
											</span>
										</div>
										<div className="menu-carousel-slide-promo-block">
											<div className="menu-carousel-slide-promo-label">
												<AdminIconSlot Icon={Sparkles} slotSize="xs" tone="accent" className="menu-carousel-promo-icon-slot" />
												<span>Promo con duración</span>
											</div>
											<div className="menu-carousel-row-promo menu-carousel-row-promo--card">
												<button
													type="button"
													className={`menu-carousel-switch menu-carousel-switch--sm ${bannerPromoOn(b) ? 'is-on' : ''}`}
													role="switch"
													aria-checked={bannerPromoOn(b)}
													aria-label={bannerPromoOn(b) ? 'Quitar duración de promoción en esta imagen' : 'Activar duración de promoción en esta imagen'}
													onClick={() => void toggleBannerPromo(b)}
												>
													<span className="menu-carousel-switch-knob" />
												</button>
												{bannerPromoOn(b) ? (
													<div className="menu-carousel-promo-days-wrap">
														<label className="menu-carousel-promo-days-label" htmlFor={`promo-days-${b.id}`}>Días</label>
														<input
															id={`promo-days-${b.id}`}
															type="number"
															min={1}
															max={90}
															className="form-input menu-carousel-promo-days-input"
															defaultValue={Math.min(90, Math.max(1, Number(b.promotion_duration_days) || 7))}
															key={`${b.id}-pd-${b.promotion_duration_days}-${b.expires_at}`}
															aria-label="Días visibles en el menú"
															onBlur={(ev) => void saveBannerPromoDays(b, ev.target.value)}
														/>
													</div>
												) : (
													<span className="menu-carousel-promo-off-hint">Sin caducidad automática</span>
												)}
											</div>
										</div>
									</div>
									<div className="menu-carousel-slide-card-actions">
										<button
											type="button"
											className="menu-carousel-btn-delete"
											aria-label="Eliminar imagen del carrusel"
											onClick={(e) => {
												e.stopPropagation();
												void removeBanner(b);
											}}
										>
											<Trash2 size={18} aria-hidden />
											<span className="menu-carousel-delete-label">Eliminar</span>
										</button>
										<div className="menu-carousel-kebab-wrap">
											<button
												type="button"
												className="admin-icon-btn admin-icon-btn--sm menu-carousel-kebab-trigger"
												aria-expanded={menuOpenId === b.id}
												aria-haspopup="menu"
												aria-label="Más opciones"
												onClick={(e) => {
													e.stopPropagation();
													setMenuOpenId((prev) => (prev === b.id ? null : b.id));
												}}
											>
												<MoreVertical size={18} aria-hidden />
											</button>
											{menuOpenId === b.id ? (
												<div
													className="menu-carousel-kebab-menu"
													role="menu"
													onClick={(e) => e.stopPropagation()}
												>
													<button
														type="button"
														role="menuitem"
														disabled={idx === 0}
														onClick={() => { void move(idx, -1); setMenuOpenId(null); }}
													>
														<AdminIconSlot Icon={ChevronUp} slotSize="xxs" className="menu-carousel-kebab-item-icon" />
														Subir
													</button>
													<button
														type="button"
														role="menuitem"
														disabled={idx === banners.length - 1}
														onClick={() => { void move(idx, 1); setMenuOpenId(null); }}
													>
														<AdminIconSlot Icon={ChevronDown} slotSize="xxs" className="menu-carousel-kebab-item-icon" />
														Bajar
													</button>
													<button
														type="button"
														role="menuitem"
														onClick={() => { void toggleActive(b); setMenuOpenId(null); }}
													>
														{b.is_active ? 'Ocultar en menú' : 'Mostrar en menú'}
													</button>
												</div>
											) : null}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}
