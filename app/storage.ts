export type StoredValue<T> = {
  schemaVersion: number;
  updatedAt: string;
  data: T;
};

export type StorageRepository<T> = {
  load: () => T;
  save: (data: T) => boolean;
  reset: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

const storageListeners = new Map<string, Set<() => void>>();

function notifyStorage(key: string) {
  storageListeners.get(key)?.forEach((listener) => listener());
}

export function readStored<T>(key: string, fallback: T, validate: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate(parsed)) return parsed;
    if (isStoredValue<T>(parsed) && validate(parsed.data)) return parsed.data;
  } catch {
    // Browser storage is optional; corrupt data must not prevent the game from loading.
  }
  return fallback;
}

export function writeStored<T>(key: string, data: T, schemaVersion = 1): boolean {
  if (typeof window === "undefined") return false;
  try {
    const value: StoredValue<T> = { schemaVersion, updatedAt: new Date().toISOString(), data };
    window.localStorage.setItem(key, JSON.stringify(value));
    notifyStorage(key);
    return true;
  } catch {
    return false;
  }
}

export function createStorageRepository<T>(key: string, fallback: T, validate: (value: unknown) => value is T, schemaVersion = 1): StorageRepository<T> {
  return {
    load: () => readStored(key, fallback, validate),
    save: (data) => writeStored(key, data, schemaVersion),
    reset: () => {
      if (typeof window === "undefined") return false;
      try {
        window.localStorage.removeItem(key);
        notifyStorage(key);
        return true;
      } catch {
        return false;
      }
    },
    subscribe: (listener) => {
      const listeners = storageListeners.get(key) ?? new Set<() => void>();
      listeners.add(listener);
      storageListeners.set(key, listeners);
      const onStorage = (event: StorageEvent) => { if (event.key === key) listener(); };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) storageListeners.delete(key);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}

function isStoredValue<T>(value: unknown): value is StoredValue<T> {
  return Boolean(value && typeof value === "object" && "data" in value && "schemaVersion" in value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
