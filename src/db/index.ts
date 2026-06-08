import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MathMap } from '../types';

interface MathMapDB extends DBSchema {
  map: {
    key: string;
    value: MathMap;
  };
  blobs: {
    key: string;
    value: Blob;
  };
}

const DB_NAME = 'mathmap-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MathMapDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MathMapDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('map')) {
          db.createObjectStore('map');
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadMap(): Promise<MathMap | null> {
  const db = await getDb();
  return (await db.get('map', 'current')) ?? null;
}

export async function saveMap(map: MathMap): Promise<void> {
  const db = await getDb();
  await db.put('map', map, 'current');
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('blobs', blob, id);
}

export async function loadBlob(id: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('blobs', id);
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('blobs', id);
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear('map');
  await db.clear('blobs');
}

export async function loadAllBlobs(): Promise<Map<string, Blob>> {
  const db = await getDb();
  const result = new Map<string, Blob>();
  const keys = await db.getAllKeys('blobs');
  for (const key of keys) {
    const blob = await db.get('blobs', key);
    if (blob) result.set(key, blob);
  }
  return result;
}

export async function importBlobs(blobs: Map<string, Blob>): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('blobs', 'readwrite');
  for (const [id, blob] of blobs) {
    await tx.store.put(blob, id);
  }
  await tx.done;
}
