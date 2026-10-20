/**
 * 写真を「石1個につきN枚」ずつ別々の石に振り分ける（純粋関数）。
 * 前提: 1個の石を続けてN枚撮り、次の石に移る、という順番で撮影されている。
 */
import { nextStoneId } from "./db";
import type { Stone } from "./types";

const byName = (a: string, b: string) => a.localeCompare(b, "ja", { numeric: true });

/** 撮影順に並べる: lastModified の昇順、同じならファイル名順（IMG_9 < IMG_10） */
export function sortByCaptureOrder<T extends { lastModified: number; name: string }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => a.lastModified - b.lastModified || byName(a.name, b.name));
}

/** 保存済みの写真を撮影順に並べる: createdAt の昇順、同じなら id 順（結果を毎回同じにするため） */
export function sortByCreatedAt<T extends { createdAt: number; id: string }>(shots: readonly T[]): T[] {
  return [...shots].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface Split<T> {
  groups: T[][];
  remainder: number; // N で割った余り。0 でなければ最後のグループは N 枚より少ない
}

/** 先頭から N 枚ずつ区切る。割り切れない分は最後の（枚数の少ない）グループになる */
export function splitEvery<T>(items: readonly T[], n: number): Split<T> {
  if (!Number.isInteger(n) || n < 1) throw new Error("1個あたりの枚数は1以上の整数にしてください");
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += n) groups.push(items.slice(i, i + n));
  return { groups, remainder: items.length % n };
}

/** 既存の石IDに続けて、新しい石IDを count 個連番で割り当てる（S001, S002, ...） */
export function allocateStoneIds(stones: readonly Pick<Stone, "id">[], count: number): string[] {
  const taken = [...stones];
  const ids: string[] = [];
  for (let k = 0; k < count; k++) {
    const id = nextStoneId(taken);
    ids.push(id);
    taken.push({ id });
  }
  return ids;
}
