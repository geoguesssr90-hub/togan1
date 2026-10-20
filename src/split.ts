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

// ---- 確認画面での手直し ----
// 写真は撮影順に並べた配列の添字（番号）で扱う。行の並び順がそのまま石IDの順になる
// （行が消えたら allocateStoneIds で振り直すので、IDは自動で詰まる）。

export interface Plan {
  rows: number[][]; // 石ごとの写真（添字）
  excluded: number[]; // 取り込まない写真（添字の昇順）
}

/** 最初の振り分け: 先頭から N 枚ずつ */
export function initialPlan(count: number, n: number): Plan {
  return { rows: splitEvery([...Array(count).keys()], n).groups, excluded: [] };
}

/** 写真が0枚になった行を消す */
export function compactRows(plan: Plan): Plan {
  return { rows: plan.rows.filter((r) => r.length > 0), excluded: plan.excluded };
}

/** 選んだ写真を行と除外リストから取り除く（空の行は残す。行の添字を変えないため） */
function take(plan: Plan, selected: ReadonlySet<number>): { rows: number[][]; excluded: number[]; picked: number[] } {
  return {
    rows: plan.rows.map((r) => r.filter((i) => !selected.has(i))),
    excluded: plan.excluded.filter((i) => !selected.has(i)),
    picked: [...selected].sort((a, b) => a - b),
  };
}

/** 選んだ写真を row 行目の末尾へ移す（撮影順のまま） */
export function moveToRow(plan: Plan, selected: ReadonlySet<number>, row: number): Plan {
  if (row < 0 || row >= plan.rows.length) return plan;
  const t = take(plan, selected);
  t.rows[row] = [...t.rows[row], ...t.picked];
  return compactRows({ rows: t.rows, excluded: t.excluded });
}

/**
 * 選んだ写真で新しい行を作る。いちばん早く撮った写真があった行のすぐ後ろに入れる
 * （石IDの順が撮影順からなるべくずれないように）。除外リストから作った場合は末尾。
 */
export function moveToNewRow(plan: Plan, selected: ReadonlySet<number>): Plan {
  const t = take(plan, selected);
  if (t.picked.length === 0) return plan;
  const from = plan.rows.findIndex((r) => r.includes(t.picked[0]));
  const at = from >= 0 ? from + 1 : t.rows.length;
  t.rows.splice(at, 0, t.picked);
  return compactRows({ rows: t.rows, excluded: t.excluded });
}

/** 選んだ写真を取り込まない（除外リストへ） */
export function excludeItems(plan: Plan, selected: ReadonlySet<number>): Plan {
  const t = take(plan, selected);
  return compactRows({ rows: t.rows, excluded: [...t.excluded, ...t.picked].sort((a, b) => a - b) });
}

/** seq を各行の枚数 caps どおりに順に詰め直す */
function refill(seq: number[], caps: number[]): { rows: number[][]; rest: number[] } {
  const rows: number[][] = [];
  let k = 0;
  for (const c of caps) {
    rows.push(seq.slice(k, k + c));
    k += c;
  }
  return { rows, rest: seq.slice(k) };
}

/**
 * row 行目から後ろの写真を、すべて1枚ずつ後ろへずらす（その石で1枚撮り忘れた場合）。
 * row 行目は1枚少なくなる。あふれた写真は、最後の行がもともと N 枚未満（端数の行）ならそこへ、
 * N 枚以上なら新しい行にする。
 */
export function shiftLater(plan: Plan, row: number, n: number): Plan {
  if (row < 0 || row >= plan.rows.length) return plan;
  const tail = plan.rows.slice(row);
  const caps = tail.map((r) => r.length);
  caps[0] = Math.max(0, caps[0] - 1);
  const { rows, rest } = refill(tail.flat(), caps);
  if (rest.length) {
    if (tail[tail.length - 1].length < n) rows[rows.length - 1] = [...rows[rows.length - 1], ...rest];
    else rows.push(rest);
  }
  return compactRows({ rows: [...plan.rows.slice(0, row), ...rows], excluded: plan.excluded });
}

/**
 * row 行目から後ろの写真を、すべて1枚ずつ前へずらす（前の石で1枚多く撮った場合）。
 * row 行目の先頭の写真が前の行の末尾へ移り、最後の行が1枚少なくなる。先頭の行では何もしない。
 */
export function shiftEarlier(plan: Plan, row: number): Plan {
  if (row < 1 || row >= plan.rows.length) return plan;
  const tail = plan.rows.slice(row);
  const [first, ...seq] = tail.flat();
  const { rows } = refill(seq, tail.map((r) => r.length));
  const head = plan.rows.slice(0, row);
  head[row - 1] = [...head[row - 1], first];
  return compactRows({ rows: [...head, ...rows], excluded: plan.excluded });
}
