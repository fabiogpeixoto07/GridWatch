import { isCircuitDocumentV3, type CircuitDocumentV3, type TrackChunkTemplateV1 } from "./circuit-document";

const DATABASE_NAME = "gridwatch-circuits";
const DATABASE_VERSION = 1;
const CIRCUITS_STORE = "circuits";
const CHUNKS_STORE = "chunks";

export type StoredCircuitChunk = TrackChunkTemplateV1 & { svgText: string; updatedAt: string };

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CIRCUITS_STORE)) database.createObjectStore(CIRCUITS_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(CHUNKS_STORE)) database.createObjectStore(CHUNKS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open circuit storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Circuit storage request failed."));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await requestResult(callback(database.transaction(storeName, mode).objectStore(storeName)));
  } finally {
    database.close();
  }
}

export async function listSavedCircuits(): Promise<CircuitDocumentV3[]> {
  try {
    const values = await withStore<unknown[]>(CIRCUITS_STORE, "readonly", (store) => store.getAll());
    return values.filter(isCircuitDocumentV3);
  } catch {
    return [];
  }
}

export async function saveCircuitDocument(document: CircuitDocumentV3) {
  if (!isCircuitDocumentV3(document)) throw new Error("Unsupported circuit document version.");
  await withStore(CIRCUITS_STORE, "readwrite", (store) => store.put(document));
  return true;
}

export async function deleteCircuitDocument(id: string) {
  await withStore(CIRCUITS_STORE, "readwrite", (store) => store.delete(id));
  return true;
}

export async function saveImportedChunk(chunk: StoredCircuitChunk) {
  await withStore(CHUNKS_STORE, "readwrite", (store) => store.put(chunk));
  return true;
}

export async function listImportedChunks(): Promise<StoredCircuitChunk[]> {
  try {
    return await withStore(CHUNKS_STORE, "readonly", (store) => store.getAll());
  } catch {
    return [];
  }
}

export function clearLegacyCircuitStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("gridwatch.custom-circuits");
    window.localStorage.setItem("gridwatch.circuit-migration", "v3-clean-slate");
  } catch {
    // Browser storage is optional; the editor remains usable with IndexedDB.
  }
}
