const DB_NAME = 'godcode-manual-orders';
const DB_VERSION = 1;
const STORE = 'drafts';
export const MANUAL_ORDER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function canUseIndexedDb() {
	return typeof indexedDB !== 'undefined';
}

function openDb() {
	if (!canUseIndexedDb()) return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) {
				const store = db.createObjectStore(STORE, { keyPath: 'key' });
				store.createIndex('userId', 'userId', { unique: false });
				store.createIndex('expiresAt', 'expiresAt', { unique: false });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export function manualOrderDraftKey({ companyId, branchId, userId, mode }) {
	if (![companyId, branchId, userId, mode].every((part) => String(part ?? '').trim())) {
		throw new Error('Empresa, sucursal, usuario y modo son obligatorios para el borrador.');
	}
	return [companyId, branchId, userId, mode].map(String).join(':');
}

async function transaction(mode, callback) {
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const result = callback(tx.objectStore(STORE));
		tx.oncomplete = () => { db.close(); resolve(result?.result ?? result ?? null); };
		tx.onerror = () => { db.close(); reject(tx.error); };
		tx.onabort = () => { db.close(); reject(tx.error); };
	});
}

export async function saveManualOrderDraft(identity, draft, receiptBlob = null) {
	const key = manualOrderDraftKey(identity);
	const savedAt = Date.now();
	const record = {
		key,
		...identity,
		draft,
		receiptBlob: receiptBlob instanceof Blob ? receiptBlob : null,
		savedAt,
		expiresAt: savedAt + MANUAL_ORDER_DRAFT_TTL_MS,
	};
	await transaction('readwrite', (store) => store.put(record));
	return record;
}

export async function loadManualOrderDraft(identity) {
	const key = manualOrderDraftKey(identity);
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		const store = tx.objectStore(STORE);
		const request = store.get(key);
		request.onsuccess = () => {
			const record = request.result ?? null;
			if (record && Number(record.expiresAt) <= Date.now()) {
				store.delete(key);
				resolve(null);
			} else resolve(record);
		};
		request.onerror = () => reject(request.error);
		tx.oncomplete = () => db.close();
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}

export async function deleteManualOrderDraft(identity) {
	return transaction('readwrite', (store) => store.delete(manualOrderDraftKey(identity)));
}

export async function clearManualOrderDraftsForUser(userId) {
	if (!String(userId ?? '').trim()) return;
	const db = await openDb();
	if (!db) return;
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		const index = tx.objectStore(STORE).index('userId');
		const cursor = index.openCursor(IDBKeyRange.only(String(userId)));
		cursor.onsuccess = () => {
			const row = cursor.result;
			if (!row) return;
			row.delete();
			row.continue();
		};
		tx.oncomplete = () => { db.close(); resolve(); };
		tx.onerror = () => { db.close(); reject(tx.error); };
	});
}
