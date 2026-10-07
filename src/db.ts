import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Shot, Stone } from "./types";

interface ToganDB extends DBSchema {
  stones: { key: string; value: Stone };
  shots: { key: string; value: Shot; indexes: { byStone: string } };
}

let dbPromise: Promise<IDBPDatabase<ToganDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ToganDB>("togan-collector", 1, {
      upgrade(d) {
        d.createObjectStore("stones", { keyPath: "id" });
        const shots = d.createObjectStore("shots", { keyPath: "id" });
        shots.createIndex("byStone", "stoneId");
      },
    });
  }
  return dbPromise;
}

export async function listStones(): Promise<Stone[]> {
  const all = await (await db()).getAll("stones");
  return all.sort((a, b) => a.id.localeCompare(b.id));
}

export async function putStone(s: Stone) {
  await (await db()).put("stones", s);
}

export async function deleteStone(id: string) {
  const d = await db();
  const tx = d.transaction(["stones", "shots"], "readwrite");
  const keys = await tx.objectStore("shots").index("byStone").getAllKeys(id);
  await Promise.all([...keys.map((k) => tx.objectStore("shots").delete(k)), tx.objectStore("stones").delete(id)]);
  await tx.done;
}

export async function listShots(stoneId?: string): Promise<Shot[]> {
  const d = await db();
  const all = stoneId ? await d.getAllFromIndex("shots", "byStone", stoneId) : await d.getAll("shots");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function putShot(s: Shot) {
  await (await db()).put("shots", s);
}

export async function deleteShot(id: string) {
  await (await db()).delete("shots", id);
}

/** 次の石IDを提案（S001, S002, ...） */
export function nextStoneId(stones: Stone[]): string {
  const nums = stones.map((s) => /^S(\d+)$/.exec(s.id)?.[1]).filter(Boolean).map(Number);
  const n = nums.length ? Math.max(...nums) + 1 : 1;
  return "S" + String(n).padStart(3, "0");
}

/** ブラウザに「消さないで」と頼む（iOS/Androidでの自動削除対策） */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* 非対応環境は無視 */
  }
}
