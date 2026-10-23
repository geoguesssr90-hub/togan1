/**
 * 1個判定で、石を正しく認識できたかを確かめる（純粋関数）。判定の計算そのものは変えない。
 * 現在は画面から呼んでいない（認識できないときに等級を出さない処理は外した）。後で戻せるように残している
 */
import { ROI, type Box } from "./features";

/** 石と認識した範囲が解析範囲のこの割合より小さければ、石が写っていないとみなす */
export const MIN_AREA_RATIO = 0.02;
/** 解析範囲の外周の画素のうち、この割合以上が石なら、枠の外まで広がる背景や人物を石と誤認したとみなす */
export const MAX_EDGE_RATIO = 0.25;

export type Recognition =
  | { ok: true }
  | { ok: false; reason: "small" | "edge" };

/** extractFeatures と同じ式で、画像サイズから解析範囲（ROI）を画素単位で求める */
export function roiBox(width: number, height: number): Box {
  return {
    x0: Math.floor(width * ROI.x0), x1: Math.ceil(width * ROI.x1),
    y0: Math.floor(height * ROI.y0), y1: Math.ceil(height * ROI.y1),
  };
}

/** 解析範囲の外周（上下左右の辺の1画素幅）のうち、石と認識した画素の割合 */
export function edgeRatio(mask: ArrayLike<number>, width: number, box: Box): number {
  let total = 0;
  let hit = 0;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      if (y !== box.y0 && y !== box.y1 - 1 && x !== box.x0 && x !== box.x1 - 1) continue;
      total++;
      if (mask[y * width + x]) hit++;
    }
  return total ? hit / total : 0;
}

/** マスク（画像全体サイズ、1=石）と areaRatio から、等級を出してよいかを決める */
export function checkRecognition(mask: ArrayLike<number>, width: number, height: number, areaRatio: number): Recognition {
  if (areaRatio < MIN_AREA_RATIO) return { ok: false, reason: "small" };
  if (edgeRatio(mask, width, roiBox(width, height)) >= MAX_EDGE_RATIO) return { ok: false, reason: "edge" };
  return { ok: true };
}
