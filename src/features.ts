/**
 * 石の写真から判定用の特徴量を取り出す（純粋関数。学習と判定で同じものを使う）。
 *
 * 現場の目視基準に対応させている:
 *   白さ        → L*（明度）の平均
 *   黄み・褐色  → b*（黄-青）、a*（赤-緑）の平均
 *   縞・ムラ    → L* のばらつき、きめ（ラプラシアン）
 *   鉄斑        → 周囲より暗い点の割合
 * 写真は乾燥状態のみを使う。
 */

export interface StoneFeatures {
  L: number;
  a: number;
  b: number;
  Lstd: number;
  spotRatio: number;
  texture: number;
  areaRatio: number; // 解析範囲に占める石の割合（検出できたかの目安）
}

/** 解析範囲（撮影ガイドの「石」枠を少し広げた範囲）。右側の基準カードを避ける */
export const ROI = { x0: 0.08, x1: 0.68, y0: 0.1, y1: 0.9 };

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const LIN = new Float32Array(256).map((_, i) => srgbToLinear(i));

function fLab(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

/** sRGB(0-255) → CIE L*a*b*（D65） */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** 大津の二値化（0-100 の値を対象） */
export function otsu(values: ArrayLike<number>, min = 0, max = 100, bins = 128): number {
  const hist = new Float64Array(bins);
  const w = (max - min) / bins;
  for (let i = 0; i < values.length; i++) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor((values[i] - min) / w)));
    hist[k]++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let k = 0; k < bins; k++) sumAll += k * hist[k];
  let wB = 0, sumB = 0, best = 0, bestK = 0;
  for (let k = 0; k < bins; k++) {
    wB += hist[k];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += k * hist[k];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; bestK = k; }
  }
  return min + (bestK + 1) * w;
}

export interface Extracted {
  features: StoneFeatures;
  mask: Uint8Array; // 画像全体サイズ。1=石
}

/** 画像全体の L*a*b* 画素 */
export interface LabImage {
  width: number;
  height: number;
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
}

/** 矩形範囲（x1, y1 は含まない） */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 指定範囲だけ L*a*b* に変換する（範囲外は 0 のまま） */
function toLab(rgba: Uint8ClampedArray, width: number, height: number, box: Box = { x0: 0, y0: 0, x1: width, y1: height }): LabImage {
  const n = width * height;
  const L = new Float32Array(n), a = new Float32Array(n), b = new Float32Array(n);
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * width + x;
      const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      L[i] = lab[0]; a[i] = lab[1]; b[i] = lab[2];
    }
  return { width, height, L, a, b };
}

/**
 * マスクで示した石領域から特徴量を計算する（1個判定・まとめて判定で共通）。
 * box の範囲で mask[i] === value の画素を石とみなす。areaRatio は 石の画素数 / areaDenom。
 */
export function featuresFromMask(
  lab: LabImage,
  mask: ArrayLike<number>,
  box: Box,
  areaDenom: number,
  value = 1,
): StoneFeatures {
  const { width, height, L: Lm, a: Am, b: Bm } = lab;
  const { x0, x1, y0, y1 } = box;
  let count = 0, sL = 0, sA = 0, sB = 0, sL2 = 0;
  const Ls: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (mask[i] === value) {
        count++;
        sL += Lm[i]; sA += Am[i]; sB += Bm[i]; sL2 += Lm[i] * Lm[i];
        Ls.push(Lm[i]);
      }
    }
  if (count === 0) return { L: 0, a: 0, b: 0, Lstd: 0, spotRatio: 0, texture: 0, areaRatio: 0 };
  const L = sL / count;
  const Lstd = Math.sqrt(Math.max(0, sL2 / count - L * L));
  Ls.sort((p, q) => p - q);
  const median = Ls[Ls.length >> 1];
  let spots = 0;
  for (const v of Ls) if (v < median - 12) spots++;

  // きめ: 石の内側（上下左右も石）の画素だけでラプラシアンの絶対値平均
  const inside = (i: number) => mask[i] === value;
  let tex = 0, texN = 0;
  for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++)
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
      const i = y * width + x;
      if (!inside(i) || !inside(i - 1) || !inside(i + 1) || !inside(i - width) || !inside(i + width)) continue;
      tex += Math.abs(4 * Lm[i] - Lm[i - 1] - Lm[i + 1] - Lm[i - width] - Lm[i + width]);
      texN++;
    }

  return {
    L,
    a: sA / count,
    b: sB / count,
    Lstd,
    spotRatio: spots / count,
    texture: texN ? tex / texN : 0,
    areaRatio: count / areaDenom,
  };
}

/**
 * RGBA 画素（縮小済み、長辺 ~400px）から特徴量を計算する。
 * 石は背景より明るい前提で、解析範囲内を大津の方法で二値化して石領域を取る。
 * 影は暗いので自動的に石領域から外れる。
 */
export function extractFeatures(rgba: Uint8ClampedArray, width: number, height: number): Extracted {
  const box: Box = {
    x0: Math.floor(width * ROI.x0), x1: Math.ceil(width * ROI.x1),
    y0: Math.floor(height * ROI.y0), y1: Math.ceil(height * ROI.y1),
  };
  const lab = toLab(rgba, width, height, box);
  const roiL: number[] = [];
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) roiL.push(lab.L[y * width + x]);
  const t = otsu(roiL);
  const mask = new Uint8Array(width * height);
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * width + x;
      if (lab.L[i] >= t) mask[i] = 1;
    }
  const roiArea = (box.x1 - box.x0) * (box.y1 - box.y0);
  return { features: featuresFromMask(lab, mask, box, roiArea), mask };
}

// ---- まとめて判定: 1枚の写真に並べた複数の石を切り出す ----

/** 面積が画像のこの割合未満の成分はゴミとして捨てる */
const MIN_STONE_AREA_RATIO = 0.003;
/** 面積が中央値のこの倍数を超えたら「石がくっついている可能性」 */
const MERGED_AREA_FACTOR = 2.5;

export interface SegmentedStone {
  index: number; // 1始まりの番号（上の行から、各行は左から右）
  label: number; // labels 上の値
  box: Box;
  cx: number;
  cy: number;
  area: number;
  maybeMerged: boolean;
  features: StoneFeatures; // areaRatio は 石の画素数 / 画像全体
}

export interface Segmentation {
  stones: SegmentedStone[];
  labels: Int32Array; // 画像全体サイズ。0=背景、それ以外=成分ラベル（除外した成分も含む）
  threshold: number;
}

/** 3×3 の収縮（近傍がすべて1なら1）または膨張（近傍に1があれば1）。画像外の画素は見ない */
function morph3(src: Uint8Array, width: number, height: number, erode: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  const hit = erode ? 0 : 1; // この値が近傍に1つでもあれば結果が決まる
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = 1 - hit;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1) && v !== hit; yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++)
          if (src[yy * width + xx] === hit) { v = hit; break; }
      out[y * width + x] = v;
    }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * 暗い背景に隙間をあけて並べた石を1個ずつ切り出し、それぞれの特徴量を計算する。
 * 画像全体を L* で大津の二値化 → 3×3 オープニング → 4近傍の連結成分。
 * 小さすぎる成分と、画像の端に接した成分（見切れた石や背景の外）は除外する。
 */
export function segmentStones(rgba: Uint8ClampedArray, width: number, height: number): Segmentation {
  const n = width * height;
  const lab = toLab(rgba, width, height);
  const threshold = otsu(lab.L);
  let bin: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lab.L[i] >= threshold) bin[i] = 1;
  bin = morph3(morph3(bin, width, height, true), width, height, false);

  // 4近傍の連結成分（再帰は深くなりすぎるのでスタックで塗りつぶす）
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  type Comp = { label: number; area: number; sx: number; sy: number; box: Box; edge: boolean };
  const comps: Comp[] = [];
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (!bin[start] || labels[start]) continue;
    const label = ++next;
    const c: Comp = { label, area: 0, sx: 0, sy: 0, box: { x0: width, y0: height, x1: 0, y1: 0 }, edge: false };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i % width, y = (i - x) / width;
      c.area++; c.sx += x; c.sy += y;
      if (x < c.box.x0) c.box.x0 = x;
      if (y < c.box.y0) c.box.y0 = y;
      if (x + 1 > c.box.x1) c.box.x1 = x + 1;
      if (y + 1 > c.box.y1) c.box.y1 = y + 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) c.edge = true;
      if (x > 0 && bin[i - 1] && !labels[i - 1]) { labels[i - 1] = label; stack[sp++] = i - 1; }
      if (x < width - 1 && bin[i + 1] && !labels[i + 1]) { labels[i + 1] = label; stack[sp++] = i + 1; }
      if (y > 0 && bin[i - width] && !labels[i - width]) { labels[i - width] = label; stack[sp++] = i - width; }
      if (y < height - 1 && bin[i + width] && !labels[i + width]) { labels[i + width] = label; stack[sp++] = i + width; }
    }
    comps.push(c);
  }

  const kept = comps.filter((c) => c.area >= n * MIN_STONE_AREA_RATIO && !c.edge);
  if (kept.length === 0) return { stones: [], labels, threshold };

  const medArea = median(kept.map((c) => c.area));
  const rowTol = median(kept.map((c) => c.box.y1 - c.box.y0)) / 2;

  // 重心の y で行に分け（行の平均 y から rowTol 以内なら同じ行）、各行を左から右へ
  const items = kept.map((c) => ({ c, cx: c.sx / c.area, cy: c.sy / c.area })).sort((p, q) => p.cy - q.cy);
  const rows: (typeof items)[] = [];
  for (const it of items) {
    const row = rows[rows.length - 1];
    if (row && it.cy - row.reduce((s, r) => s + r.cy, 0) / row.length <= rowTol) row.push(it);
    else rows.push([it]);
  }
  const ordered = rows.flatMap((r) => r.sort((p, q) => p.cx - q.cx));

  const stones = ordered.map(({ c, cx, cy }, k) => ({
    index: k + 1,
    label: c.label,
    box: c.box,
    cx,
    cy,
    area: c.area,
    maybeMerged: c.area > medArea * MERGED_AREA_FACTOR,
    features: featuresFromMask(lab, labels, c.box, n, c.label),
  }));
  return { stones, labels, threshold };
}

/** 乾燥写真1枚から、モデルに入れるベクトルを作る（FEATURE_NAMES と同じ順） */
export const FEATURE_NAMES = ["L*", "a*", "b*", "L*ばらつき", "斑点率", "きめ"];

export function featureVector(f: StoneFeatures): number[] {
  return [f.L, f.a, f.b, f.Lstd, f.spotRatio, f.texture];
}
