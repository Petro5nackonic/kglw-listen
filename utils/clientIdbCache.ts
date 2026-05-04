/**
 * Browser IndexedDB cache for larger payloads (home list, discovery rows, show stats).
 * Falls back to no-op / null when IndexedDB is unavailable (SSR, old browsers).
 */

const DB_NAME = "kglw-listen-client-cache";
const DB_VERSION = 1;
const STORE = "kv";

type DbHolder = { db: IDBDatabase };

let connectPromise: Promise<DbHolder | null> | null = null;

function canUseIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<DbHolder | null> {
  if (!canUseIdb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve({ db: req.result });
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function getHolder(): Promise<DbHolder | null> {
  if (!connectPromise) {
    connectPromise = openDb().catch(() => null);
  }
  return connectPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const holder = await getHolder();
  if (!holder) return null;
  return new Promise((resolve) => {
    try {
      const tx = holder.db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        resolve(v != null ? (v as T) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const holder = await getHolder();
  if (!holder) return false;
  return new Promise((resolve) => {
    try {
      const tx = holder.db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      tx.objectStore(STORE).put(value, key);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(key: string): Promise<void> {
  const holder = await getHolder();
  if (!holder) return;
  try {
    const tx = holder.db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
  } catch {
    // ignore
  }
}

/** Read legacy localStorage JSON and move into IndexedDB, then remove the key. */
export async function migrateLocalStorageToIdb(lsKey: string, idbKey: string): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    const ok = await idbSet(idbKey, parsed);
    if (ok) localStorage.removeItem(lsKey);
    return ok;
  } catch {
    return false;
  }
}
