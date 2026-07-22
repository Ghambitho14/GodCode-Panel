import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, TABLES } from '@/integrations/supabase';
import {
	uploadCompanyImage,
	validateImageFile,
	deleteCompanyImage,
	IMAGE_STORAGE_CONTEXTS,
} from '@/shared/utils/supabaseStorage';
import { callGuardedRpc } from '../utils/rpcGuard';
import { invalidateBranchInventory } from '../../services/panelDataCache';
import { manualOrderV2Service } from '../../services/manualOrderV2Service';
import { queuePaymentEvidence, uploadQueuedPaymentEvidence } from '../../services/paymentEvidenceOutbox';

/**
 * CRUD de productos/categorías y comprobantes de pago en el panel admin.
 */
export function useAdminCatalog({
	companyId,
	selectedBranch,
	showNotify,
	setRefreshing,
	setOrders,
	setProducts,
	setCategories,
	setSelectedClientOrders,
	selectedClient,
	refreshCatalogInner,
	isModalOpenRef: externalIsModalOpenRef,
	editingProductRef: externalEditingProductRef,
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingProduct, setEditingProduct] = useState(null);
	const internalIsModalOpenRef = useRef(false);
	const internalEditingProductRef = useRef(/** @type {unknown} */ (null));
	const isModalOpenRef = externalIsModalOpenRef || internalIsModalOpenRef;
	const editingProductRef = externalEditingProductRef || internalEditingProductRef;
	const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
	const [editingCategory, setEditingCategory] = useState(null);
	const [receiptModalOrder, setReceiptModalOrder] = useState(null);
	const [receiptPreview, setReceiptPreview] = useState(null);
	const [uploadingReceipt, setUploadingReceipt] = useState(false);
	const [scopeModal, setScopeModal] = useState({ isOpen: false, item: null, type: 'product' });
	const [productToDelete, setProductToDelete] = useState(null);
	const [categoryToDelete, setCategoryToDelete] = useState(null);

	useEffect(() => {
		isModalOpenRef.current = isModalOpen;
	}, [isModalOpen]);

	useEffect(() => {
		editingProductRef.current = editingProduct;
	}, [editingProduct]);

	const uploadReceiptToOrder = useCallback(async (orderId, file) => {
		if (!file) return;
		setUploadingReceipt(true);
		let uploadedReceiptPath = null;
		try {
			const { data: order } = await supabase
				.from(TABLES.orders)
				.select('payment_ref, branch_id, manual_order_mode, payment_evidence_status')
				.eq('id', orderId)
				.eq('company_id', companyId)
				.maybeSingle();
			const previousRef = order?.payment_ref || null;
			if (order?.manual_order_mode === 'quick_sale' || order?.manual_order_mode === 'session') {
				const evidenceRows = await manualOrderV2Service.listEvidence(orderId);
				if (evidenceRows.length === 0) throw new Error('Este pedido no tiene una línea de pago que admita comprobante.');
				const targetRows = evidenceRows.some((row) => row.status !== 'uploaded')
					? evidenceRows.filter((row) => row.status !== 'uploaded')
					: evidenceRows;
				const results = [];
				for (const [index, evidence] of targetRows.entries()) {
					const queued = await queuePaymentEvidence({
						evidenceId: evidence.id,
						companyId,
						branchId: order?.branch_id || selectedBranch?.id,
						orderId,
						file,
						previousPath: evidence.storage_path || (index === 0 ? previousRef : null),
					});
					results.push(await uploadQueuedPaymentEvidence(queued));
				}
				const allUploaded = results.every((result) => result.ok);
				const uploadedPath = results.find((result) => result.ok)?.path ?? previousRef;
				const patch = allUploaded
					? { payment_ref: uploadedPath, payment_evidence_status: 'uploaded' }
					: { payment_ref: uploadedPath, payment_evidence_status: 'failed' };
				setOrders((prev) => prev.map((row) => row.id === orderId ? { ...row, ...patch } : row));
				if (selectedClient) setSelectedClientOrders((prev) => prev.map((row) => row.id === orderId ? { ...row, ...patch } : row));
				showNotify(allUploaded ? 'Comprobante guardado' : 'El comprobante quedó pendiente y se reintentará automáticamente.', allUploaded ? 'success' : 'warning');
				setReceiptModalOrder(null);
				setReceiptPreview(null);
				return;
			}
			uploadedReceiptPath = await uploadCompanyImage(
				file,
				IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT,
				{
					companyId,
					branchId: order?.branch_id || selectedBranch?.id,
					entityId: orderId,
				},
			);
			const { error } = await supabase
				.from(TABLES.orders)
				.update({ payment_ref: uploadedReceiptPath })
				.eq('id', orderId)
				.eq('company_id', companyId);
			if (error) throw error;
			if (previousRef && previousRef !== uploadedReceiptPath) {
				await deleteCompanyImage(previousRef, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, companyId);
			}
			setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_ref: uploadedReceiptPath } : o));
			if (selectedClient) {
				setSelectedClientOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_ref: uploadedReceiptPath } : o));
			}
			showNotify('Comprobante agregado');
			setReceiptModalOrder(null);
			setReceiptPreview(null);
		} catch (error) {
			if (uploadedReceiptPath) {
				await deleteCompanyImage(uploadedReceiptPath, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, companyId);
			}
			showNotify('Error al subir comprobante: ' + error.message, 'error');
		} finally {
			setUploadingReceipt(false);
		}
	}, [selectedClient, selectedBranch?.id, showNotify, companyId, setOrders, setSelectedClientOrders]);

	const handleReceiptFileChange = useCallback((e) => {
		const file = e.target.files[0];
		if (file) {
			const { valid, error: validationError } = validateImageFile(file);
			if (!valid) {
				showNotify(validationError || 'Archivo no válido', 'error');
				e.target.value = '';
				return;
			}
			setReceiptPreview(prev => {
				if (prev) URL.revokeObjectURL(prev);
				return URL.createObjectURL(file);
			});
		}
	}, [showNotify]);

	const handleSaveProduct = useCallback(async (formData, localFile) => {
		if (!selectedBranch) return;
		if (selectedBranch.id === 'all') {
			showNotify('Selecciona una sucursal para crear o editar productos', 'error');
			return;
		}
		setRefreshing(true);
		let uploadedImagePath = null;
		let imagePersisted = false;
		try {
			let finalImageUrl = formData.image_url;
			const previousImageUrl = editingProduct?.image_url || null;
			if (localFile) {
				uploadedImagePath = await uploadCompanyImage(
					localFile,
					IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT,
					{
						companyId,
						entityId: editingProduct?.id || 'drafts',
					},
				);
				finalImageUrl = uploadedImagePath;
			}
			const priceStr = String(Number(formData.price) || 0);
			const discountStr = formData.has_discount
				? String(Number(formData.discount_price) || 0)
				: null;
			const applyToAllBranches = !editingProduct;
			const { data: productId, error } = await supabase.rpc('admin_upsert_product_with_branch', {
				p_product_id: editingProduct?.id || null,
				p_name: formData.name,
				p_description: formData.description,
				p_image_url: finalImageUrl,
				p_category_id: formData.category_id || null,
				p_branch_id: selectedBranch.id,
				p_price: priceStr,
				p_has_discount: formData.has_discount || false,
				p_discount_price: discountStr,
				p_is_active: editingProduct ? Boolean(editingProduct.is_active) : true,
				p_is_special: formData.is_special || false,
				p_apply_to_all_branches: applyToAllBranches
			});
			if (error) throw error;
			if (!productId) throw new Error('No se pudo guardar el producto');
			imagePersisted = true;
			if (previousImageUrl && previousImageUrl !== finalImageUrl) {
				await deleteCompanyImage(previousImageUrl, IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT, companyId);
			}
			const dishKind =
				typeof formData.dish_kind === 'string' ? formData.dish_kind.trim().slice(0, 64) : '';
			const { error: dishErr } = await supabase
				.from(TABLES.products)
				.update({ dish_kind: dishKind || null })
				.eq('id', productId)
				.eq('company_id', companyId);
			if (dishErr) console.warn('dish_kind:', dishErr);

			if (Array.isArray(formData.recipe)) {
				const { error: delErr } = await supabase
					.from(TABLES.product_inventory_recipe)
					.delete()
					.eq('product_id', productId)
					.eq('company_id', companyId);

				if (delErr) console.warn('recipe delete:', delErr);

				const rowsToInsert = formData.recipe
					.filter(r => r.inventory_item_id && (Number(r.qty_per_sale) || 0) > 0)
					.map(r => ({
						product_id: productId,
						inventory_item_id: r.inventory_item_id,
						qty_per_sale: Number(r.qty_per_sale) || 0,
						company_id: companyId
					}));

				if (rowsToInsert.length > 0) {
					const { error: insErr } = await supabase
						.from(TABLES.product_inventory_recipe)
						.insert(rowsToInsert);
					if (insErr) console.warn('recipe insert:', insErr);
				}
			}

			showNotify(editingProduct ? "Producto actualizado" : "Producto creado");
			setIsModalOpen(false);
			if (selectedBranch?.id && selectedBranch.id !== 'all') {
				invalidateBranchInventory(selectedBranch.id);
			}
			await refreshCatalogInner({ force: true });
		} catch (error) {
			if (uploadedImagePath && !imagePersisted) {
				await deleteCompanyImage(uploadedImagePath, IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT, companyId);
			}
			showNotify("Error: " + error.message, 'error');
		} finally {
			setRefreshing(false);
		}
	}, [selectedBranch, editingProduct, showNotify, refreshCatalogInner, companyId, setRefreshing]);

	const deleteProduct = useCallback((id) => setProductToDelete(id), []);

	const confirmDeleteProduct = useCallback(async () => {
		if (!productToDelete) return;
		const id = productToDelete;
		setProductToDelete(null);
		try {
			const { data: product } = await supabase
				.from(TABLES.products)
				.select('image_url')
				.eq('id', id)
				.eq('company_id', companyId)
				.maybeSingle();
			const { error } = await supabase.rpc('admin_delete_product_with_branch', {
				p_product_id: id
			});
			if (error) throw error;
			if (product?.image_url) {
				await deleteCompanyImage(
					product.image_url,
					IMAGE_STORAGE_CONTEXTS.CATALOG_PRODUCT,
					companyId,
				);
			}
			showNotify("Producto eliminado correctamente");
			await refreshCatalogInner({ force: true });
		} catch (error) {
			showNotify("No se pudo eliminar: " + (error.message || 'Error desconocido'), 'error');
		}
	}, [productToDelete, showNotify, refreshCatalogInner, companyId]);

	const toggleProductActive = useCallback((product, e) => {
		e.stopPropagation();
		if (!selectedBranch) return;
		setScopeModal({ isOpen: true, item: product, type: 'product' });
	}, [selectedBranch]);

	const handleScopeConfirm = useCallback(async (scope) => {
		const { item, type } = scopeModal;
		setScopeModal(prev => ({ ...prev, isOpen: false }));
		if (!item) return;
		const newActive = !item.is_active;
		if (type === 'product') {
			setProducts(prev => prev.map(p => p.id === item.id ? { ...p, is_active: newActive } : p));
		}
		try {
			if (scope === 'global' || selectedBranch?.id === 'all') {
				const scopedCompanyId = companyId || selectedBranch?.company_id || item.company_id || null;
				let query = supabase.from(TABLES.products).update({ is_active: newActive }).eq('id', item.id);
				if (scopedCompanyId) {
					query = query.eq('company_id', scopedCompanyId);
				}
				const { error } = await query;
				if (error) throw error;
				showNotify(newActive ? 'Activado en todos los locales' : 'Desactivado en todos los locales');
			} else {
				let promotedGlobal = false;
				if (type === 'product' && newActive) {
					const { data: parent, error: selErr } = await supabase
						.from(TABLES.products)
						.select('is_active')
						.eq('id', item.id)
						.maybeSingle();
					if (selErr) throw selErr;
					if (parent && parent.is_active === false) {
						const scopedCompanyId = companyId || selectedBranch?.company_id || item.company_id || null;
						let promoteQuery = supabase.from(TABLES.products).update({ is_active: true }).eq('id', item.id);
						if (scopedCompanyId) {
							promoteQuery = promoteQuery.eq('company_id', scopedCompanyId);
						}
						const { error: gErr } = await promoteQuery;
						if (gErr) throw gErr;
						promotedGlobal = true;
					}
				}
				const row = {
					product_id: item.id,
					branch_id: selectedBranch.id,
					is_active: newActive,
					company_id: selectedBranch.company_id || null,
				};
				if (newActive) {
					row.inventory_pause_reason = null;
					row.inventory_paused_at = null;
				}
				const { error } = await supabase.from(TABLES.product_branch).upsert(row, { onConflict: 'product_id, branch_id' });
				if (error) throw error;
				if (promotedGlobal) {
					showNotify('Producto reactivado (estaba apagado en todos los locales)');
				} else {
					showNotify(newActive ? 'Activado en este local' : 'Desactivado en este local');
				}
			}
			await refreshCatalogInner({ force: true });
		} catch {
			await refreshCatalogInner({ force: true });
			showNotify('Error al cambiar estado', 'error');
		}
	}, [scopeModal, selectedBranch, showNotify, refreshCatalogInner, companyId, setProducts]);

	const handleSaveCategory = useCallback(async (formData) => {
		if (!selectedBranch || selectedBranch.id === 'all') {
			showNotify('Selecciona una sucursal para gestionar categorías', 'error');
			return;
		}
		try {
			const orderValue = Number(formData.order);
			const normalizedOrder = Number.isFinite(orderValue) && orderValue > 0 ? orderValue : null;
			if (editingCategory) {
				const { error } = await supabase
					.from(TABLES.categories)
					.update({ name: formData.name })
					.eq('id', editingCategory.id);
				if (error) throw error;

				const { error: statusError } = await supabase
					.from(TABLES.category_branch)
					.upsert({
						category_id: editingCategory.id,
						branch_id: selectedBranch.id,
						is_active: formData.is_active,
						company_id: selectedBranch.company_id || null
					}, { onConflict: 'category_id, branch_id' });
				if (statusError) throw statusError;

				if (normalizedOrder && normalizedOrder !== editingCategory.order) {
					const { error: reorderError, notGranted } = await callGuardedRpc(
						'admin_set_category_order',
						{
							p_branch_id: selectedBranch.id,
							p_category_id: editingCategory.id,
							p_new_order: normalizedOrder,
						},
						{ showNotify, label: 'Reordenar categoría' },
					);
					if (notGranted) return;
					if (reorderError) throw reorderError;
				}
			} else {
				const { error, notGranted } = await callGuardedRpc(
					'admin_create_category_with_overrides',
					{
						p_name: formData.name,
						p_branch_id: selectedBranch.id,
						p_order: normalizedOrder,
						p_is_active: formData.is_active,
					},
					{ showNotify, label: 'Crear categoría' },
				);
				if (notGranted) return;
				if (error) throw error;
			}
			setIsCategoryModalOpen(false);
			await refreshCatalogInner({ force: true });
			showNotify('Categoría guardada');
		} catch (error) {
			showNotify('Error al guardar: ' + error.message, 'error');
		}
	}, [selectedBranch, editingCategory, showNotify, refreshCatalogInner]);

	const reorderCategories = useCallback(async (orderedIds) => {
		if (!selectedBranch || selectedBranch.id === 'all') return;
		if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
		setCategories(prev => {
			const orderMap = new Map(orderedIds.map((id, index) => [id, index + 1]));
			return prev.map(cat => orderMap.has(cat.id) ? { ...cat, order: orderMap.get(cat.id) } : cat);
		});
		const { error, notGranted } = await callGuardedRpc(
			'admin_reorder_categories',
			{
				p_branch_id: selectedBranch.id,
				p_category_ids: orderedIds,
			},
			{ showNotify, label: 'Reordenar categorías' },
		);
		if (notGranted) {
			await refreshCatalogInner({ force: true });
			return;
		}
		if (error) {
			showNotify('No se pudo reordenar categorías', 'error');
			await refreshCatalogInner({ force: true });
		}
	}, [selectedBranch, showNotify, refreshCatalogInner, setCategories]);

	const toggleCategoryActive = useCallback(async (categoryId, nextValue) => {
		if (!selectedBranch || selectedBranch.id === 'all') return;
		setCategories(prev => prev.map(cat => cat.id === categoryId ? { ...cat, is_active: nextValue } : cat));
		const { error } = await supabase
			.from(TABLES.category_branch)
			.upsert({
				category_id: categoryId,
				branch_id: selectedBranch.id,
				is_active: nextValue,
				company_id: selectedBranch.company_id || null
			}, { onConflict: 'category_id, branch_id' });
		if (error) {
			showNotify('No se pudo actualizar la categoría', 'error');
			await refreshCatalogInner({ force: true });
		}
	}, [selectedBranch, showNotify, refreshCatalogInner, setCategories]);

	const deleteCategory = useCallback((cat) => {
		setCategoryToDelete(cat);
	}, []);

	const confirmDeleteCategory = useCallback(async () => {
		if (!categoryToDelete) return;
		const id = categoryToDelete.id;
		setCategoryToDelete(null);
		try {
			await supabase
				.from(TABLES.products)
				.update({ category_id: null })
				.eq('category_id', id)
				.eq('company_id', companyId);
			const { error } = await supabase
				.from(TABLES.categories)
				.delete()
				.eq('id', id)
				.eq('company_id', companyId);
			if (error) throw error;
			showNotify('Categoría eliminada');
			await refreshCatalogInner({ force: true });
		} catch (error) {
			showNotify('No se pudo eliminar: ' + (error.message || 'Error desconocido'), 'error');
		}
	}, [categoryToDelete, showNotify, refreshCatalogInner, companyId]);

	return useMemo(() => ({
		isModalOpen,
		setIsModalOpen,
		editingProduct,
		setEditingProduct,
		isModalOpenRef,
		editingProductRef,
		isCategoryModalOpen,
		setIsCategoryModalOpen,
		editingCategory,
		setEditingCategory,
		receiptModalOrder,
		setReceiptModalOrder,
		receiptPreview,
		setReceiptPreview,
		uploadingReceipt,
		setUploadingReceipt,
		scopeModal,
		setScopeModal,
		productToDelete,
		setProductToDelete,
		categoryToDelete,
		setCategoryToDelete,
		uploadReceiptToOrder,
		handleReceiptFileChange,
		handleSaveProduct,
		deleteProduct,
		confirmDeleteProduct,
		toggleProductActive,
		handleScopeConfirm,
		handleSaveCategory,
		reorderCategories,
		toggleCategoryActive,
		deleteCategory,
		confirmDeleteCategory,
	}), [
		isModalOpen,
		setIsModalOpen,
		editingProduct,
		setEditingProduct,
		isModalOpenRef,
		editingProductRef,
		isCategoryModalOpen,
		setIsCategoryModalOpen,
		editingCategory,
		setEditingCategory,
		receiptModalOrder,
		setReceiptModalOrder,
		receiptPreview,
		setReceiptPreview,
		uploadingReceipt,
		setUploadingReceipt,
		scopeModal,
		setScopeModal,
		productToDelete,
		setProductToDelete,
		categoryToDelete,
		setCategoryToDelete,
		uploadReceiptToOrder,
		handleReceiptFileChange,
		handleSaveProduct,
		deleteProduct,
		confirmDeleteProduct,
		toggleProductActive,
		handleScopeConfirm,
		handleSaveCategory,
		reorderCategories,
		toggleCategoryActive,
		deleteCategory,
		confirmDeleteCategory,
	]);
}
