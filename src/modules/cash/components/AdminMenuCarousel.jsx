import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	Loader2, Trash2, ChevronUp, ChevronDown, ImagePlus, ImageOff, MoreVertical,
	GripVertical, ExternalLink, WandSparkles,
	Images, X,
} from 'lucide-react';
import {
	uploadCompanyImage,
	validateImageFile,
	deleteCompanyImage,
	IMAGE_STORAGE_CONTEXTS,
	MENU_IMAGE_MAX_SIZE_MB,
	getSignedImageUrl,
	extractStoragePath,
} from '@/shared/utils/supabaseStorage';
import { supabase } from '@/integrations/supabase';
import { useSignedImageUrl } from '@/shared/hooks/useSignedImageUrl';
import { Skeleton } from '@/components/ui/skeleton';
import {
	listMenuCarousel,
	createBanner,
	reorderBanners,
	saveCarouselSettings,
	patchBanner as patchBannerService,
	deleteBanner,
} from '../services/menuCarouselService';
import {
	TARGET_RATIO,
	OUTPUT_WIDTH,
	OUTPUT_HEIGHT,
	readImageDimensions,
	buildInitialCrop,
	fitCropRect,
	canvasFromCrop,
	autoFitCarouselImage,
	computeEditorView,
} from '../utils/carouselImageFit';
import { getScrollableAncestors } from '@/shared/utils/scrollAncestors';
import AdminIconSlot from './AdminIconSlot';
import '../styles/AdminMenuCarousel.css';
import { Button } from "@/components/ui/button";

const filenameFromUrl = (url) => {
	const raw = String(url || '').split('?')[0];
	const relativeName = raw.split('/').filter(Boolean).pop();
	if (relativeName) return relativeName;
	try {
		const u = new URL(raw);
		const out = u.pathname.split('/').filter(Boolean).pop();
		return out || `carousel-${Date.now()}.jpg`;
	} catch {
		return `carousel-${Date.now()}.jpg`;
	}
};

const humanSize = (value) => {
	const n = Math.round(Number(value) || 0);
	return n > 0 ? String(n) : '—';
};

const loadBannerImageBlob = async (imagePath) => {
	const storagePath = extractStoragePath(imagePath, 'menu');
	if (storagePath && !/^https?:\/\//i.test(storagePath)) {
		const { data, error } = await supabase.storage.from('menu').download(storagePath);
		if (!error && data) return data;
	}

	const signedUrl = await getSignedImageUrl(imagePath, 'menu');
	if (!signedUrl) throw new Error('No se encontró la imagen del banner.');
	const res = await fetch(signedUrl);
	if (!res.ok) throw new Error('No se pudo cargar la imagen para editar.');
	return res.blob();
};

const CarouselSlideThumbnail = ({ imagePath, index }) => {
	const { url, loading, error } = useSignedImageUrl(imagePath, 'menu', 3600, true, 0, 'carouselThumb');
	const { url: fullUrl } = useSignedImageUrl(imagePath, 'menu', 3600, true, 0, null);
	const [imageFailed, setImageFailed] = useState(false);
	const [useFullSrc, setUseFullSrc] = useState(false);

	useEffect(() => {
		setImageFailed(false);
		setUseFullSrc(false);
	}, [url, fullUrl]);

	const displayUrl = useFullSrc ? fullUrl : url;
	const available = Boolean(displayUrl && !imageFailed && !error);
	const openUrl = fullUrl || displayUrl;

	return (
		<a
			href={available && openUrl ? openUrl : undefined}
			target={available ? '_blank' : undefined}
			rel={available ? 'noopener noreferrer' : undefined}
			className="menu-carousel-slide-card-thumb"
			aria-label={available ? `Abrir imagen de la diapositiva ${index + 1} en nueva pestaña` : 'Imagen no disponible'}
			aria-disabled={!available}
			onClick={(event) => {
				if (!available) event.preventDefault();
			}}
		>
			{loading ? <Skeleton className="h-full w-full rounded-none" aria-hidden="true" /> : null}
			{available ? (
				<img
					src={displayUrl}
					alt=""
					className="menu-carousel-slide-thumb"
					loading="lazy"
					decoding="async"
					onError={() => {
						if (!useFullSrc && fullUrl && fullUrl !== displayUrl) {
							setUseFullSrc(true);
							return;
						}
						setImageFailed(true);
					}}
				/>
			) : !loading ? (
				<span className="flex h-full w-full items-center justify-center bg-gc-muted text-gc-text-muted" aria-hidden="true">
					<ImageOff size={22} />
				</span>
			) : null}
			{available ? (
				<span className="menu-carousel-thumb-open">
					<AdminIconSlot Icon={ExternalLink} slotSize="xxs" />
				</span>
			) : null}
		</a>
	);
};

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
	const [kebabMenuPos, setKebabMenuPos] = useState(null);
	const [pendingUpload, setPendingUpload] = useState(null);
	const [editorZoom, setEditorZoom] = useState(1);
	const [editorOffsetX, setEditorOffsetX] = useState(0.5);
	const [editorOffsetY, setEditorOffsetY] = useState(0.5);
	const [editorMode, setEditorMode] = useState('cover');
	const [editing, setEditing] = useState(false);
	const fileInputRef = useRef(null);

	const branchId = selectedBranch?.id && selectedBranch.id !== 'all' ? selectedBranch.id : null;

	const closeKebabMenu = useCallback(() => {
		setMenuOpenId(null);
		setKebabMenuPos(null);
	}, []);

	const updateKebabMenuPosFromButton = useCallback((buttonEl) => {
		if (!buttonEl || typeof buttonEl.getBoundingClientRect !== 'function') return;
		const r = buttonEl.getBoundingClientRect();
		const margin = 10;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		const menuW = Math.min(11.5 * remPx, vw - margin * 2);
		const menuH = 220;

		let left = r.right - menuW;
		left = Math.max(margin, Math.min(left, vw - menuW - margin));

		let top = r.bottom + 6;
		if (top + menuH > vh - margin) {
			top = Math.max(margin, r.top - menuH - 6);
		}

		setKebabMenuPos({ top, left });
	}, []);

	const load = useCallback(async () => {
		if (!branchId) {
			setBanners([]);
			setLoading(false);
			return;
		}
		if (!companyId) {
			setBanners([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const { banners: list, settings } = await listMenuCarousel({ branchId, companyId });
			setBanners(Array.isArray(list) ? list : []);
			const s = settings || {};
			setIntervalSec(Math.max(2, Math.round((s.intervalMs ?? 5000) / 1000)));
			setMaxSlides(s.maxSlides ?? 10);
		} catch (e) {
			setBanners([]);
			showNotify(e instanceof Error ? e.message : 'Error al cargar', 'error');
		} finally {
			setLoading(false);
		}
	}, [branchId, companyId, showNotify]);

	useEffect(() => {
		void load();
	}, [load]);

	useLayoutEffect(() => {
		if (!menuOpenId) return undefined;
		const idEscaped = String(menuOpenId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

		let rafId = null;
		const runReposition = () => {
			const btn = document.querySelector(`[data-carousel-kebab-id="${idEscaped}"]`);
			if (btn) updateKebabMenuPosFromButton(btn);
		};

		const scheduleReposition = () => {
			if (rafId != null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				runReposition();
			});
		};

		runReposition();

		const btn = document.querySelector(`[data-carousel-kebab-id="${idEscaped}"]`);
		const scrollRoots = btn ? getScrollableAncestors(btn) : [];
		const mainContent = typeof document !== 'undefined'
			? document.querySelector('.admin-layout main.admin-content')
			: null;
		const extraScrollRoots = mainContent && !scrollRoots.includes(mainContent) ? [mainContent] : [];

		scrollRoots.forEach((el) => {
			el.addEventListener('scroll', runReposition, { passive: true });
		});
		extraScrollRoots.forEach((el) => {
			el.addEventListener('scroll', runReposition, { passive: true });
		});
		window.addEventListener('scroll', runReposition, true);
		window.addEventListener('resize', scheduleReposition);

		const vv = typeof window !== 'undefined' ? window.visualViewport : null;
		if (vv) {
			vv.addEventListener('scroll', runReposition);
			vv.addEventListener('resize', scheduleReposition);
		}

		return () => {
			if (rafId != null) cancelAnimationFrame(rafId);
			scrollRoots.forEach((el) => {
				el.removeEventListener('scroll', runReposition);
			});
			extraScrollRoots.forEach((el) => {
				el.removeEventListener('scroll', runReposition);
			});
			window.removeEventListener('scroll', runReposition, true);
			window.removeEventListener('resize', scheduleReposition);
			if (vv) {
				vv.removeEventListener('scroll', runReposition);
				vv.removeEventListener('resize', scheduleReposition);
			}
		};
	}, [menuOpenId, updateKebabMenuPosFromButton]);

	useEffect(() => {
		if (!menuOpenId) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') closeKebabMenu();
		};
		document.addEventListener('keydown', onKey);
		const onDoc = (e) => {
			if (!(e.target instanceof Element)) {
				closeKebabMenu();
				return;
			}
			if (e.target.closest('.menu-carousel-kebab-menu--portal')) return;
			if (e.target.closest('[data-carousel-kebab-id]')) return;
			closeKebabMenu();
		};
		const t = window.setTimeout(() => {
			document.addEventListener('click', onDoc);
		}, 0);
		return () => {
			window.clearTimeout(t);
			document.removeEventListener('click', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [menuOpenId, closeKebabMenu]);

	const persistReorder = async (nextList) => {
		if (!branchId || !companyId) return;
		const orderedIds = nextList.map((b) => b.id);
		await reorderBanners({ branchId, companyId, orderedIds });
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
		if (!companyId) {
			showNotify('Falta identificar la empresa', 'error');
			return;
		}
		setSavingSettings(true);
		try {
			const intervalMs = Math.min(60, Math.max(2, Number(intervalSec) || 5)) * 1000;
			const clampedMaxSlides = Math.min(20, Math.max(1, Number(maxSlides) || 10));
			const out = await saveCarouselSettings({
				companyId,
				intervalMs,
				maxSlides: clampedMaxSlides,
			});
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
		if (!companyId) {
			throw new Error('Falta identificar la empresa');
		}
		return await patchBannerService({ bannerId, companyId, patches: payload });
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
		if (!companyId) {
			showNotify('Falta identificar la empresa', 'error');
			return;
		}
		closeKebabMenu();
		try {
			await deleteBanner({ bannerId: banner.id, companyId });
			await deleteCompanyImage(
				banner.image_url,
				IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
				companyId,
			);
			setBanners((prev) => prev.filter((b) => b.id !== banner.id));
			showNotify('Imagen eliminada.');
		} catch (e) {
			showNotify(e instanceof Error ? e.message : 'Error', 'error');
		}
	};

	const uploadAndCreateBanner = async (fileToUpload) => {
		if (!branchId) return;
		if (!companyId) {
			throw new Error('Falta identificar la empresa');
		}
		const imagePath = await uploadCompanyImage(
			fileToUpload,
			IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
			{ companyId, branchId },
		);
		try {
			const banner = await createBanner({ branchId, companyId, imagePath });
			if (banner) {
				setBanners((prev) => [...prev, banner].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
			}
		} catch (error) {
			await deleteCompanyImage(
				imagePath,
				IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
				companyId,
			);
			throw error;
		}
	};

	const uploadAndReplaceBannerImage = async (bannerId, fileToUpload) => {
		const banner = banners.find((b) => b.id === bannerId);
		const previousUrl = banner?.image_url || null;
		const imagePath = await uploadCompanyImage(
			fileToUpload,
			IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
			{ companyId, branchId },
		);
		try {
			const updated = await patchBanner(bannerId, { image_url: imagePath });
			mergeBanner(bannerId, updated);
			if (previousUrl && previousUrl !== imagePath) {
				await deleteCompanyImage(
					previousUrl,
					IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
					companyId,
				);
			}
		} catch (error) {
			await deleteCompanyImage(
				imagePath,
				IMAGE_STORAGE_CONTEXTS.MENU_CAROUSEL,
				companyId,
			);
			throw error;
		}
	};

	const dismissPendingUpload = () => {
		setPendingUpload((prev) => {
			if (prev?.previewUrl && prev?.previewSource === 'file') URL.revokeObjectURL(prev.previewUrl);
			return null;
		});
		setEditorZoom(1);
		setEditorOffsetX(0.5);
		setEditorOffsetY(0.5);
		setEditorMode('cover');
		setEditing(false);
	};

	const saveEditedImage = async () => {
		if (!pendingUpload?.file || !pendingUpload?.dimensions) return;
		setEditing(true);
		setUploading(true);
		try {
			const dims = pendingUpload.dimensions;
			let canvas;
			if (editorMode === 'contain') {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				const loaded = new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = reject;
				});
				img.src = pendingUpload.previewUrl;
				await loaded;
				const out = document.createElement('canvas');
				out.width = OUTPUT_WIDTH;
				out.height = OUTPUT_HEIGHT;
				const ctx = out.getContext('2d');
				if (!ctx) throw new Error('No se pudo preparar el editor.');
				const baseScale = Math.max(out.width / img.naturalWidth, out.height / img.naturalHeight);
				const scale = baseScale * Math.min(2.2, Math.max(1, Number(editorZoom) || 1));
				const drawW = img.naturalWidth * scale;
				const drawH = img.naturalHeight * scale;
				const ox = (out.width - drawW) * Math.min(Math.max(editorOffsetX, 0), 1);
				const oy = (out.height - drawH) * Math.min(Math.max(editorOffsetY, 0), 1);
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage(img, ox, oy, drawW, drawH);
				canvas = out;
			} else {
				const minZoom = Math.max(TARGET_RATIO / (dims.width / Math.max(1, dims.height)), 1);
				const zoom = Math.max(minZoom, Number(editorZoom) || 1);
				const cropWidth = dims.width / zoom;
				const cropHeight = cropWidth / TARGET_RATIO;
				const x = (dims.width - cropWidth) * Math.min(Math.max(editorOffsetX, 0), 1);
				const y = (dims.height - cropHeight) * Math.min(Math.max(editorOffsetY, 0), 1);
				const crop = fitCropRect(dims, { x, y, width: cropWidth, height: cropHeight });
				canvas = await canvasFromCrop(pendingUpload.previewUrl, crop);
			}
			const blob = await new Promise((resolve, reject) => {
				canvas.toBlob((out) => {
					if (!out) {
						reject(new Error('No se pudo exportar la imagen editada.'));
						return;
					}
					resolve(out);
				}, pendingUpload.file.type || 'image/jpeg', 0.92);
			});
			const ext = (pendingUpload.file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
			const edited = new File([blob], `carousel-edited-${Date.now()}.${ext}`, {
				type: blob.type || pendingUpload.file.type || 'image/jpeg',
			});
			if (pendingUpload.mode === 'replace' && pendingUpload.bannerId) {
				await uploadAndReplaceBannerImage(pendingUpload.bannerId, edited);
				showNotify('Imagen ajustada y actualizada.');
			} else {
				throw new Error('No se pudo actualizar la imagen del banner.');
			}
			dismissPendingUpload();
		} catch (err) {
			showNotify(err instanceof Error ? err.message : 'Error al editar/subir', 'error');
		} finally {
			setEditing(false);
			setUploading(false);
		}
	};

	const openEditorForBanner = async (banner) => {
		if (!banner?.image_url) return;
		closeKebabMenu();
		setEditing(true);
		try {
			const blob = await loadBannerImageBlob(banner.image_url);
			const fallbackType = blob.type || 'image/jpeg';
			const file = new File([blob], filenameFromUrl(banner.image_url), { type: fallbackType });
			const dimensions = await readImageDimensions(file);
			const initialCrop = buildInitialCrop(dimensions);
			const previewUrl = URL.createObjectURL(file);
			setPendingUpload({
				mode: 'replace',
				bannerId: banner.id,
				file,
				dimensions,
				previewUrl,
				previewSource: 'file',
			});
			const ratio = dimensions.width / Math.max(1, dimensions.height);
			const minZoom = Math.max(TARGET_RATIO / ratio, 1);
			setEditorZoom(Number(minZoom.toFixed(2)));
			setEditorMode('cover');
			setEditorOffsetX((initialCrop.x / Math.max(1, dimensions.width - initialCrop.width)) || 0.5);
			setEditorOffsetY((initialCrop.y / Math.max(1, dimensions.height - initialCrop.height)) || 0.5);
		} catch (err) {
			showNotify(err instanceof Error ? err.message : 'No se pudo abrir el editor', 'error');
		} finally {
			setEditing(false);
		}
	};

	const onPickFile = async (e) => {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file || !branchId) return;
		setUploading(true);
		try {
			const validation = validateImageFile(file, { maxSizeMb: MENU_IMAGE_MAX_SIZE_MB });
			if (!validation.valid) throw new Error(validation.error);
			const fitted = await autoFitCarouselImage(file);
			await uploadAndCreateBanner(fitted);
			showNotify('Imagen subida al carrusel.');
		} catch (err) {
			showNotify(err instanceof Error ? err.message : 'Error al subir', 'error');
		} finally {
			setUploading(false);
		}
	};

	const openFilePicker = () => {
		if (uploading) return;
		fileInputRef.current?.click();
	};

	const editorView = pendingUpload
		? computeEditorView(
			pendingUpload.dimensions,
			editorMode,
			editorZoom,
			editorOffsetX,
			editorOffsetY,
		)
		: null;

	const kebabOpenBanner = menuOpenId ? banners.find((b) => b.id === menuOpenId) ?? null : null;
	const kebabOpenIdx = kebabOpenBanner ? banners.findIndex((b) => b.id === kebabOpenBanner.id) : -1;
	const kebabPortalTarget = typeof document !== 'undefined' ? document.body : null;
	const editorPortalTarget = kebabPortalTarget;

	useEffect(() => {
		if (!menuOpenId || kebabOpenBanner) return undefined;
		closeKebabMenu();
		return undefined;
	}, [menuOpenId, kebabOpenBanner, closeKebabMenu]);

	if (!branchId) {
		return (
			<div className="admin-branch-options menu-carousel glass animate-fade menu-carousel-panel menu-carousel-panel-inner">
				<div className="menu-carousel-branch-hint admin-branch-options__empty">
					<Images size={36} strokeWidth={1.4} aria-hidden className="menu-carousel-empty-icon" />
					<p className="menu-carousel-hint">
						Elige una sucursal en la barra superior para ver y editar las imágenes de su carrusel.
					</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="admin-branch-options menu-carousel glass animate-fade menu-carousel-panel menu-carousel-panel-inner menu-carousel-loading">
				<AdminIconSlot Icon={Loader2} slotSize="lg" className="animate-spin" />
			</div>
		);
	}

	const branchLabel = selectedBranch?.name ? ` · ${selectedBranch.name}` : '';

	const editorModal = pendingUpload && editorPortalTarget
		? createPortal(
			<div
				className="menu-carousel-editor-overlay"
				role="presentation"
				onClick={() => {
					if (!uploading && !editing) dismissPendingUpload();
				}}
			>
				<div
					className="menu-carousel-editor-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="menu-carousel-editor-title"
					onClick={(e) => e.stopPropagation()}
				>
					<div className="menu-carousel-editor-header">
						<div className="menu-carousel-editor-header-text">
							<h3 id="menu-carousel-editor-title">Ajustar imagen</h3>
							<p className="menu-carousel-editor-header-hint">
								Formato 2.35:1 · mín. {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}.
								Actual: {humanSize(pendingUpload.dimensions.width)} × {humanSize(pendingUpload.dimensions.height)}.
							</p>
						</div>
						<button
							type="button"
							className="menu-carousel-editor-close"
							aria-label="Cerrar"
							disabled={uploading || editing}
							onClick={dismissPendingUpload}
						>
							<X size={18} />
						</button>
					</div>

					<div className="menu-carousel-editor-body">
						<div className="menu-carousel-editor-preview-wrap">
							<div className="menu-carousel-editor-preview">
								<img
									src={pendingUpload.previewUrl}
									alt="Vista previa para edición"
									className="menu-carousel-editor-preview-image"
									style={editorView.previewImageStyle}
									draggable={false}
								/>
							</div>
						</div>
						<div className="menu-carousel-editor-controls">
							<div className="menu-carousel-editor-mode-toggle" role="radiogroup" aria-label="Modo de ajuste">
								<button
									type="button"
									className={`menu-carousel-editor-mode-btn${editorMode === 'cover' ? ' is-active' : ''}`}
									onClick={() => {
										setEditorMode('cover');
										const ratio = pendingUpload.dimensions.width / Math.max(1, pendingUpload.dimensions.height);
										setEditorZoom(Math.max(TARGET_RATIO / ratio, 1));
										setEditorOffsetX(0.5);
										setEditorOffsetY(0.5);
									}}
								>
									Recortar
								</button>
								<button
									type="button"
									className={`menu-carousel-editor-mode-btn${editorMode === 'contain' ? ' is-active' : ''}`}
									onClick={() => {
										setEditorMode('contain');
										setEditorZoom(1);
										setEditorOffsetX(0.5);
										setEditorOffsetY(0.5);
									}}
								>
									Ajustar completa
								</button>
							</div>
							<button
								type="button"
								className="menu-carousel-editor-reset-btn"
								onClick={() => {
									setEditorZoom(editorView.minZoom);
									setEditorOffsetX(0.5);
									setEditorOffsetY(0.5);
								}}
							>
								Reset vista
							</button>
							<label htmlFor="menu-carousel-editor-zoom">
								{editorMode === 'contain' ? 'Escala' : 'Zoom'}
								<input
									id="menu-carousel-editor-zoom"
									type="range"
									min={editorView.minZoom}
									max={editorView.maxZoom}
									step={0.01}
									value={editorView.currentZoom}
									onChange={(ev) => setEditorZoom(Number(ev.target.value))}
								/>
							</label>
							<label
								htmlFor="menu-carousel-editor-x"
								className={!editorView.canPanX ? 'menu-carousel-editor-control--disabled' : undefined}
							>
								Horizontal
								<input
									id="menu-carousel-editor-x"
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={editorView.safeX}
									disabled={!editorView.canPanX}
									onChange={(ev) => setEditorOffsetX(Number(ev.target.value))}
								/>
							</label>
							<label
								htmlFor="menu-carousel-editor-y"
								className={!editorView.canPanY ? 'menu-carousel-editor-control--disabled' : undefined}
							>
								Vertical
								<input
									id="menu-carousel-editor-y"
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={editorView.safeY}
									disabled={!editorView.canPanY}
									onChange={(ev) => setEditorOffsetY(Number(ev.target.value))}
								/>
							</label>
						</div>
						{!editorView.canPanX && !editorView.canPanY && editorMode === 'cover' ? (
							<p className="menu-carousel-editor-contain-hint">
								Acerca más con Zoom para poder mover la imagen horizontal o verticalmente.
							</p>
						) : null}
						{editorMode === 'contain' ? (
							<p className="menu-carousel-editor-contain-hint">
								Modo ajustar completa: evita franjas y rellena todo el formato (puede recortar un poco los bordes).
							</p>
						) : null}
					</div>

					<div className="menu-carousel-editor-footer">
						<Button
							variant="secondary"
							type="button"
							size="sm"
							onClick={dismissPendingUpload}
							disabled={uploading || editing}
						>
							Cancelar
						</Button>
						<Button
							variant="default"
							type="button"
							size="sm"
							onClick={() => void saveEditedImage()}
							disabled={uploading || editing}
						>
							{editing ? 'Aplicando…' : 'Guardar'}
						</Button>
					</div>
				</div>
			</div>,
			editorPortalTarget,
		)
		: null;

	const kebabMenu = menuOpenId && kebabOpenBanner && kebabMenuPos && kebabPortalTarget
		? createPortal(
			<div
				id="menu-carousel-kebab-menu-popover"
				className="menu-carousel-kebab-menu menu-carousel-kebab-menu--portal"
				style={{ top: kebabMenuPos.top, left: kebabMenuPos.left }}
				role="menu"
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === 'Escape') closeKebabMenu();
				}}
			>
				<button
					type="button"
					role="menuitem"
					className="menu-carousel-kebab-item"
					onClick={(e) => {
						e.stopPropagation();
						void openEditorForBanner(kebabOpenBanner);
					}}
				>
					<AdminIconSlot Icon={WandSparkles} slotSize="xxs" className="menu-carousel-kebab-item-icon" />
					Ajustar diseño
				</button>
				{kebabOpenIdx > 0 ? (
					<button
						type="button"
						role="menuitem"
						className="menu-carousel-kebab-item"
						onClick={() => { void move(kebabOpenIdx, -1); closeKebabMenu(); }}
					>
						<AdminIconSlot Icon={ChevronUp} slotSize="xxs" className="menu-carousel-kebab-item-icon" />
						Subir
					</button>
				) : null}
				{kebabOpenIdx >= 0 && kebabOpenIdx < banners.length - 1 ? (
					<button
						type="button"
						role="menuitem"
						className="menu-carousel-kebab-item"
						onClick={() => { void move(kebabOpenIdx, 1); closeKebabMenu(); }}
					>
						<AdminIconSlot Icon={ChevronDown} slotSize="xxs" className="menu-carousel-kebab-item-icon" />
						Bajar
					</button>
				) : null}
				<button
					type="button"
					role="menuitem"
					className="menu-carousel-kebab-item"
					onClick={() => { void toggleActive(kebabOpenBanner); closeKebabMenu(); }}
				>
					{kebabOpenBanner.is_active ? 'Ocultar en menú' : 'Mostrar en menú'}
				</button>
			</div>,
			kebabPortalTarget,
		)
		: null;

	return (
		<div className="admin-branch-options menu-carousel glass animate-fade menu-carousel-panel menu-carousel-panel-inner">
			<input
				ref={fileInputRef}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				className="menu-carousel-file-input"
				disabled={uploading}
				onChange={(ev) => void onPickFile(ev)}
				tabIndex={-1}
				aria-hidden
			/>

			<header className="admin-branch-options__toolbar menu-carousel-header">
				<div className="admin-branch-options__toolbar-title">
					<Images size={20} strokeWidth={1.75} aria-hidden />
					<h2>Carrusel{branchLabel}</h2>
				</div>
				<p className="admin-branch-options__toolbar-hint">
					Fotos del menú digital por sucursal.
				</p>
			</header>

			<section className="menu-carousel-specs" aria-label="Recomendaciones para imágenes del carrusel">
				<p className="menu-carousel-specs__lead">
					<strong>Tamaño recomendado:</strong>{' '}
					{OUTPUT_WIDTH} × {OUTPUT_HEIGHT} px · panorámica {TARGET_RATIO}:1
				</p>
				<ul className="menu-carousel-specs__list">
					<li>
						Misma proporción en otras resoluciones (ej. 2350 × 1000 px) también se ve bien.
					</li>
					<li>
						Dejá margen en los bordes: al encajar 2.35:1 puede recortarse un poco arriba o abajo.
					</li>
					<li>
						JPG, PNG o WebP · máx. {MENU_IMAGE_MAX_SIZE_MB} MB. Tras subir, usá <strong>Ajustar diseño</strong> si hace falta.
					</li>
				</ul>
			</section>

			<section className="admin-branch-options__card menu-carousel-settings-block" aria-labelledby="carousel-settings-heading">
				<h3 id="carousel-settings-heading" className="admin-branch-options__block-title">Rotación</h3>
				<div className="menu-carousel-settings">
					<div className="form-group menu-carousel-settings__field">
						<label htmlFor="carousel-interval">Intervalo (s)</label>
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
					<div className="form-group menu-carousel-settings__field">
						<label htmlFor="carousel-max">Máx. fotos</label>
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
						<Button
							variant="default"
							type="button"
							size="sm"
							className="menu-carousel-settings-save-btn"
							onClick={() => void saveSettings()}
							disabled={savingSettings}
						>
							{savingSettings ? 'Guardando…' : 'Guardar'}
						</Button>
					</div>
				</div>
			</section>

			<div className="menu-carousel-toolbar">
				<div className="menu-carousel-toolbar-head">
					<h3>
						Diapositivas
						<span className="menu-carousel-count">
							{banners.length === 0 ? '0' : banners.length}
						</span>
					</h3>
					<Button
						variant="default"
						type="button"
						size="sm"
						className="menu-carousel-upload-btn"
						disabled={uploading}
						onClick={openFilePicker}
					>
						{uploading ? (
							<Loader2 size={14} className="animate-spin" aria-hidden />
						) : (
							<ImagePlus size={14} aria-hidden />
						)}
						{uploading ? 'Subiendo…' : 'Subir imagen'}
					</Button>
				</div>
				<p className="menu-carousel-upload-hint">
					Ideal {OUTPUT_WIDTH}×{OUTPUT_HEIGHT} px · JPG, PNG o WebP · máx. {MENU_IMAGE_MAX_SIZE_MB} MB
				</p>
			</div>

			{banners.length === 0 ? (
				<div className="menu-carousel-empty">
					<Images size={36} strokeWidth={1.4} aria-hidden className="menu-carousel-empty-icon" />
					<p>Aún no hay imágenes en esta sucursal.</p>
					<p className="menu-carousel-empty-spec">
						Subí fotos {OUTPUT_WIDTH}×{OUTPUT_HEIGHT} px (2.35:1) para mejor resultado en el menú.
					</p>
					<Button
						variant="default"
						type="button"
						size="sm"
						disabled={uploading}
						onClick={openFilePicker}
					>
						{uploading ? (
							<Loader2 size={14} className="animate-spin" aria-hidden />
						) : (
							<ImagePlus size={14} aria-hidden />
						)}
						{uploading ? 'Subiendo…' : 'Subir'}
					</Button>
				</div>
			) : (
				<div className="menu-carousel-table-outer">
					<ul className="menu-carousel-slide-list" aria-label="Diapositivas del carrusel">
						{banners.map((b, idx) => {
							const created = b.created_at ? new Date(b.created_at) : null;
							const dateStr = created && Number.isFinite(created.getTime())
								? created.toLocaleDateString('es-CL')
								: null;
							return (
								<li
									key={b.id}
									className={`menu-carousel-slide-card ${b.is_active ? 'is-active' : 'is-muted'}`}
								>
									<CarouselSlideThumbnail imagePath={b.image_url} index={idx} />
									<div className="menu-carousel-slide-card-main">
										<div className="menu-carousel-slide-card-head">
											<div className="menu-carousel-slide-titles">
												<h4 className="menu-carousel-slide-title">
													<span className="menu-carousel-slide-drag" aria-hidden>
														<GripVertical size={14} strokeWidth={1.75} />
													</span>
													Diapositiva {idx + 1}
												</h4>
												{dateStr ? (
													<p className="menu-carousel-slide-sub">{dateStr}</p>
												) : null}
											</div>
											<div className="menu-carousel-slide-card-meta">
												<span className={`status-badge ${b.is_active ? 'success' : 'neutral'}`}>
													{b.is_active ? 'Visible' : 'Oculta'}
												</span>
												<div className="menu-carousel-slide-card-actions">
													<button
														type="button"
														className="admin-icon-btn admin-icon-btn--sm menu-carousel-btn-delete"
														aria-label="Eliminar imagen del carrusel"
														onClick={(e) => {
															e.stopPropagation();
															void removeBanner(b);
														}}
													>
														<Trash2 size={15} aria-hidden />
													</button>
													<div className="menu-carousel-kebab-wrap">
														<button
															type="button"
															className="admin-icon-btn admin-icon-btn--sm menu-carousel-kebab-trigger"
															data-carousel-kebab-id={b.id}
															aria-expanded={menuOpenId === b.id}
															aria-haspopup="menu"
															aria-controls={menuOpenId === b.id ? 'menu-carousel-kebab-menu-popover' : undefined}
															aria-label="Más opciones"
															onClick={(e) => {
																e.stopPropagation();
																if (menuOpenId === b.id) {
																	closeKebabMenu();
																	return;
																}
																updateKebabMenuPosFromButton(e.currentTarget);
																setMenuOpenId(b.id);
															}}
														>
															<MoreVertical size={16} aria-hidden />
														</button>
													</div>
												</div>
											</div>
										</div>
										<div className="menu-carousel-slide-promo-block">
											<span className="menu-carousel-slide-promo-label">Caducidad</span>
											<div className="menu-carousel-row-promo menu-carousel-row-promo--card">
												<button
													type="button"
													className={`menu-carousel-switch menu-carousel-switch--sm ${bannerPromoOn(b) ? 'is-on' : ''}`}
													role="switch"
													aria-checked={bannerPromoOn(b)}
													aria-label={bannerPromoOn(b) ? 'Quitar duración de promoción' : 'Activar duración de promoción'}
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
													<span className="menu-carousel-promo-off-hint">Sin límite</span>
												)}
											</div>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}
			{kebabMenu}
			{editorModal}
		</div>
	);
}
