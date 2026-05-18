import type { AppState } from "./types";

const DB_NAME = "disc-stats-db";
const STORE_NAME = "snapshots";
const STATE_KEY = "app-state";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(): Promise<AppState | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    const raw = window.localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  }
}

export async function saveState(state: AppState): Promise<void> {
  if (typeof window === "undefined") return;

  if (!("indexedDB" in window)) {
    globalThis.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }
}
