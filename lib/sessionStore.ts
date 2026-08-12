// 작업 이어하기 - 이미지 파일 자체(용량이 커서 localStorage에 못 넣는다)는 IndexedDB에,
// 나머지 가벼운 설정값들은 같은 DB의 별도 스토어에 저장해둔다. 새로고침해도 이 값들을 읽어
// 파일을 다시 File 객체로 복원하고 설정을 그대로 되돌리는 방식으로 "이어서 작업"을 구현한다.
// 보정 결과 이미지 자체는 저장하지 않는다 - 원본만 있으면 언제든 다시 계산할 수 있고, 그게
// 항상 최신 알고리즘 결과를 보장하면서 저장 용량도 아낀다.

import { Algorithm } from "./colorTransfer";
import { DownloadFormat } from "../components/Sidebar";
import { RegionSeed } from "./regionMask";

const DB_NAME = "tonemate-session";
const DB_VERSION = 1;
const STORE_TARGET_IMAGES = "targetImages";
const STORE_REFERENCE_IMAGE = "referenceImage";
const STORE_META = "meta";

export type TargetSessionSettings = {
  name: string;
  colorStrength: number;
  lumStrength: number;
  regionSeeds: RegionSeed[];
  regionTolerance: number;
  regionFeather: number;
  fgColorStrength: number;
  fgLumStrength: number;
  bgColorStrength: number;
  bgLumStrength: number;
};

export type SessionMeta = {
  id: "session";
  referenceName: string | null;
  paletteCount: number;
  algorithm: Algorithm;
  batchDefault: { color: number; lum: number };
  downloadFormat: DownloadFormat;
  selectedId: string | null;
  appliedSourceId: string | null;
  chromaticAberration: number;
  glowStrength: number;
  protectEnabled: boolean;
  shadowProtect: number;
  highlightProtect: number;
  textureType: number;
  textureStrength: number;
  contrast: number;
  tintColor: string;
  tintStrength: number;
  // 이전에 일괄 처리를 돌려서 결과가 있던 상태였는지 - 복원 직후 자동으로 다시 처리할지 결정한다.
  wasProcessed: boolean;
  // 필름스트립 순서 유지용. targetImages 스토어에는 순서 정보가 없어서 따로 둔다.
  targetOrder: string[];
  targetSettings: Record<string, TargetSessionSettings>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB를 지원하지 않는 환경입니다."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TARGET_IMAGES)) {
        db.createObjectStore(STORE_TARGET_IMAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_REFERENCE_IMAGE)) {
        db.createObjectStore(STORE_REFERENCE_IMAGE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveReferenceImage(name: string, blob: Blob): Promise<void> {
  try {
    await withStore(STORE_REFERENCE_IMAGE, "readwrite", (store) => store.put({ id: "reference", name, blob }));
  } catch {
    // 저장 실패(용량 초과, 지원 안 함 등)는 조용히 무시 - 세션 이어하기는 있으면 좋은 기능이라
    // 실패해도 나머지 작업 흐름을 막으면 안 된다.
  }
}

export async function loadReferenceImage(): Promise<{ name: string; blob: Blob } | null> {
  try {
    const result = await withStore<any>(STORE_REFERENCE_IMAGE, "readonly", (store) => store.get("reference"));
    return result ? { name: result.name, blob: result.blob } : null;
  } catch {
    return null;
  }
}

export async function saveTargetImage(id: string, name: string, blob: Blob): Promise<void> {
  try {
    await withStore(STORE_TARGET_IMAGES, "readwrite", (store) => store.put({ id, name, blob }));
  } catch {
    // 위와 같은 이유로 조용히 무시.
  }
}

export async function deleteTargetImage(id: string): Promise<void> {
  try {
    await withStore(STORE_TARGET_IMAGES, "readwrite", (store) => store.delete(id));
  } catch {
    // 조용히 무시.
  }
}

export async function loadAllTargetImages(): Promise<Record<string, { name: string; blob: Blob }>> {
  try {
    const all = await withStore<any[]>(STORE_TARGET_IMAGES, "readonly", (store) => store.getAll());
    const map: Record<string, { name: string; blob: Blob }> = {};
    for (const item of all) map[item.id] = { name: item.name, blob: item.blob };
    return map;
  } catch {
    return {};
  }
}

export async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  try {
    await withStore(STORE_META, "readwrite", (store) => store.put(meta));
  } catch {
    // 조용히 무시.
  }
}

export async function loadSessionMeta(): Promise<SessionMeta | null> {
  try {
    const result = await withStore<SessionMeta | undefined>(STORE_META, "readonly", (store) => store.get("session"));
    return result ?? null;
  } catch {
    return null;
  }
}

// 저장된 세션이 있는지(=이어하기 배너를 띄울지) 가볍게 확인한다.
export async function hasSavedSession(): Promise<boolean> {
  const meta = await loadSessionMeta();
  return !!meta;
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    await Promise.all(
      [STORE_TARGET_IMAGES, STORE_REFERENCE_IMAGE, STORE_META].map(
        (storeName) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          })
      )
    );
    db.close();
  } catch {
    // 조용히 무시.
  }
}
