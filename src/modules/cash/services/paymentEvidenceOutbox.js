import {
	uploadCompanyImage,
	deleteCompanyImage,
	IMAGE_STORAGE_CONTEXTS,
} from '@/shared/utils/supabaseStorage';
import { manualOrderV2Service } from './manualOrderV2Service';

const DB_NAME = 'godcode-payment-evidence-outbox';
const STORE = 'pending';

function openDb() {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'evidenceId' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore(mode, operation) {
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		operation(tx.objectStore(STORE), resolve, reject);
		tx.oncomplete = () => db.close();
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

export async function queuePaymentEvidence(entry) {
	if (!(entry.file instanceof Blob)) throw new Error('El comprobante local no es válido.');
	const row = { ...entry, attempts: Number(entry.attempts) || 0, queuedAt: Date.now(), lastError: null };
	await withStore('readwrite', (store, resolve) => {
		const request = store.put(row);
		request.onsuccess = () => resolve(row);
	});
	return row;
}

export async function removePaymentEvidenceFromOutbox(evidenceId) {
	return withStore('readwrite', (store, resolve) => {
		const request = store.delete(evidenceId);
		request.onsuccess = () => resolve();
	});
}

export async function listPaymentEvidenceOutbox() {
	return withStore('readonly', (store, resolve) => {
		const request = store.getAll();
		request.onsuccess = () => resolve(request.result ?? []);
	});
}

export async function uploadQueuedPaymentEvidence(entry) {
	let newPath = null;
	if (entry.uploadedPath) {
		try {
			const attachment = await manualOrderV2Service.attachEvidence(
				entry.evidenceId,
				entry.uploadedPath,
				null,
			);
			await removePaymentEvidenceFromOutbox(entry.evidenceId);
			if (entry.previousPath && entry.previousPath !== entry.uploadedPath) {
				await deleteCompanyImage(entry.previousPath, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, entry.companyId);
			}
			return {
				ok: true,
				path: entry.uploadedPath,
				evidenceStatus: attachment?.status ?? 'uploaded',
				paymentStatus: attachment?.paymentStatus ?? null,
				recoveredAfterAmbiguousResponse: true,
			};
		} catch (error) {
			await queuePaymentEvidence({
				...entry,
				attempts: Number(entry.attempts) + 1,
				lastError: error?.message ?? 'attach_retry_failed',
			});
			return { ok: false, error };
		}
	}
	try {
		await manualOrderV2Service.markEvidenceUploading(entry.evidenceId);
		newPath = await uploadCompanyImage(entry.file, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, {
			companyId: entry.companyId,
			branchId: entry.branchId,
			entityId: String(entry.orderId),
		});
		const attachment = await manualOrderV2Service.attachEvidence(entry.evidenceId, newPath, null);
		await removePaymentEvidenceFromOutbox(entry.evidenceId);
		if (entry.previousPath && entry.previousPath !== newPath) {
			await deleteCompanyImage(entry.previousPath, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, entry.companyId);
		}
		return {
			ok: true,
			path: newPath,
			evidenceStatus: attachment?.status ?? 'uploaded',
			paymentStatus: attachment?.paymentStatus ?? null,
			pendingReason: attachment?.pendingReason ?? null,
		};
	} catch (error) {
		if (newPath) {
			try {
				const evidenceRows = await manualOrderV2Service.listEvidence(entry.orderId);
				const persisted = evidenceRows.find((row) =>
					row.id === entry.evidenceId && row.storage_path === newPath,
				);
				if (persisted) {
					await removePaymentEvidenceFromOutbox(entry.evidenceId);
					if (entry.previousPath && entry.previousPath !== newPath) {
						await deleteCompanyImage(entry.previousPath, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, entry.companyId);
					}
					return {
						ok: true,
						path: newPath,
						evidenceStatus: persisted.status,
						paymentStatus: null,
						recoveredAfterAmbiguousResponse: true,
					};
				}
			} catch {
				// If verification is also unavailable, preserve the new object.
				// The outbox will reconcile it on the next retry.
				await queuePaymentEvidence({
					...entry,
					attempts: Number(entry.attempts) + 1,
					lastError: error?.message ?? 'verification_unavailable',
					uploadedPath: newPath,
				});
				return { ok: false, error };
			}
			await deleteCompanyImage(newPath, IMAGE_STORAGE_CONTEXTS.ORDER_RECEIPT, entry.companyId);
		}
		try { await manualOrderV2Service.attachEvidence(entry.evidenceId, null, error?.message ?? 'upload_failed'); } catch { /* keeps local retry authoritative */ }
		await queuePaymentEvidence({ ...entry, attempts: Number(entry.attempts) + 1, lastError: error?.message ?? 'upload_failed' });
		return { ok: false, error };
	}
}

export async function retryPaymentEvidenceOutbox() {
	const entries = await listPaymentEvidenceOutbox();
	return Promise.all((entries ?? []).map(uploadQueuedPaymentEvidence));
}

let onlineHandlerInstalled = false;
export function installPaymentEvidenceOnlineRetry() {
	if (onlineHandlerInstalled || typeof window === 'undefined') return () => {};
	onlineHandlerInstalled = true;
	const retry = () => { void retryPaymentEvidenceOutbox(); };
	window.addEventListener('online', retry);
	return () => {
		window.removeEventListener('online', retry);
		onlineHandlerInstalled = false;
	};
}
