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
  areaRatio: number; // 画像に占める石の割合（検出できたかの目安）
}

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

// ---- 石の切り出し（背景との色差方式 "bg-diff-3"） ----
// 背景の色を画像の外周から推定し、背景と色が違う部分を石とする。
// 背景が白でも黒でも、石が白くても茶色くても切り出せる。

/** 切り出し方式。学習時と判定時で同じでなければならない（Model.segmentation に記録して照合する） */
export const SEGMENTATION = "bg-diff-3";

/** 外周のこの幅（上下は高さ、左右は幅に対する割合）を背景とみなす */
const BORDER_BAND = 0.05;
/** 背景との色差のしきい値の下限（ΔE） */
const MIN_DELTA_E = 8;
/** しきい値は背景のばらつき（中央絶対偏差）のこの倍数以上にする */
const BG_SPREAD_FACTOR = 3;
/** ヒステリシス: 種につながっていれば、しきい値のこの倍率まで石に含める */
const HYSTERESIS_LOW = 0.6;
/** 影の判定: 色み（a*, b*）の差がどちらもこれ未満 */
const SHADOW_MAX_CHROMA_DIFF = 3;
/** 影の判定: 周囲の石の候補の画素での明度の標準偏差がこれ未満（影はなめらか。石には模様がある） */
const SHADOW_MAX_LOCAL_STD = 2;
/** 影の判定で、なめらかさを見る窓の半径（2 → 5×5） */
const SHADOW_WINDOW_RADIUS = 2;
/** 影を外すと成分がこの割合未満しか残らないなら、影を外さずに成分ごと石とする */
const SHADOW_KEEP_RATIO = 0.3;
/** 面積が画像のこの割合未満の成分はゴミとして捨てる */
const MIN_STONE_AREA_RATIO = 0.003;
/** 1個判定で石が画像のこの割合以上を占めたら、背景を石と誤認した可能性がある（警告のみ。学習には使う） */
export const MAX_SINGLE_STONE_AREA_RATIO = 0.5;
/** 面積が中央値のこの倍数を超えたら「石がくっついている可能性」 */
const MERGED_AREA_FACTOR = 2.5;

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

export interface Background {
  L: number;
  a: number;
  b: number;
  spread: number; // 外周の画素の、背景色からの色差 ΔE の中央値（中央絶対偏差）
}

function medianOf(values: Float32Array): number {
  if (values.length === 0) return 0;
  const s = Float32Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 画像の外周の帯を背景とみなし、その色（L*a*b* の中央値）とばらつきを求める */
export function estimateBackground(lab: LabImage): Background {
  const { width: w, height: h } = lab;
  const bx = Math.max(1, Math.round(w * BORDER_BAND));
  const by = Math.max(1, Math.round(h * BORDER_BAND));
  const idx: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x < bx || x >= w - bx || y < by || y >= h - by) idx.push(y * w + x);
  const pick = (c: Float32Array) => Float32Array.from(idx, (i) => c[i]);
  const L = medianOf(pick(lab.L)), a = medianOf(pick(lab.a)), b = medianOf(pick(lab.b));
  const dE = Float32Array.from(idx, (i) => Math.hypot(lab.L[i] - L, lab.a[i] - a, lab.b[i] - b));
  return { L, a, b, spread: medianOf(dE) };
}

/**
 * 周囲 (2r+1)×(2r+1) の窓での明度の標準偏差。窓の中の「石の候補の画素（fg）」だけで計算し、
 * 背景の画素は数えない（縁のくっきりした影でも、縁で「なめらかでない」と判定されないように）。
 * fg でない画素は 0。累積和で計算するので窓の大きさによらず速い。
 */
function localStdOnMask(lab: LabImage, fg: Uint8Array, r: number): Float32Array {
  const { width: w, height: h, L } = lab;
  const W1 = w + 1;
  // 累積和（1画素ずらして持つ）: 個数・明度の和・明度の2乗の和
  const C = new Float64Array(W1 * (h + 1)), S = new Float64Array(W1 * (h + 1)), S2 = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x, k = (y + 1) * W1 + x + 1;
      const v = fg[i] ? L[i] : 0, c = fg[i] ? 1 : 0;
      C[k] = c + C[k - 1] + C[k - W1] - C[k - W1 - 1];
      S[k] = v + S[k - 1] + S[k - W1] - S[k - W1 - 1];
      S2[k] = v * v + S2[k - 1] + S2[k - W1] - S2[k - W1 - 1];
    }
  const sum = (A: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    A[y1 * W1 + x1] - A[y0 * W1 + x1] - A[y1 * W1 + x0] + A[y0 * W1 + x0];
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!fg[y * w + x]) continue;
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
      const n = sum(C, x0, y0, x1, y1);
      const m = sum(S, x0, y0, x1, y1) / n;
      out[y * w + x] = Math.sqrt(Math.max(0, sum(S2, x0, y0, x1, y1) / n - m * m));
    }
  return out;
}

/** 外周とつながっていない背景（成分の内部の穴）を埋める */
function fillHoles(src: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (i: number) => {
    if (!src[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; }
  };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % width, y = (i - x) / width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (y > 0) push(i - width);
    if (y < height - 1) push(i + width);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

export interface Foreground {
  mask: Uint8Array; // 1=石の候補
  threshold: number; // 種にした ΔE のしきい値（広げる下限はこの HYSTERESIS_LOW 倍）
  background: Background;
}

/** ΔE がしきい値以上の画素を種にし、そこにつながっていて low 以上の画素までを広げる（4近傍） */
function hysteresis(dE: Float32Array, width: number, height: number, high: number, low: number): Uint8Array {
  const n = width * height;
  const mask = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) if (dE[i] >= high) { mask[i] = 1; stack[sp++] = i; }
  const visit = (j: number) => {
    if (!mask[j] && dE[j] >= low) { mask[j] = 1; stack[sp++] = j; }
  };
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % width, y = (i - x) / width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (y > 0) visit(i - width);
    if (y < height - 1) visit(i + width);
  }
  return mask;
}

/**
 * 影を外す（成分ごとに判断する）。
 * 影の条件（背景より暗い・色みの差が小さい・周囲5×5の石の候補の画素がなめらか）に当てはまる画素のうち、
 * 成分の外側の縁から、影の条件の画素だけをたどってつながっているものを影とする。
 * なめらかさは背景を数えずに見るので、縁のくっきりした影も縁からたどれる。
 * 石と影の境目は明度の段差で「なめらかでない」ので、たどりは模様のある石の中に入らない。
 * 外した結果が元の成分の SHADOW_KEEP_RATIO 未満になる成分は、影を外さずそのまま残す
 * （模様のない灰色の石は縁からたどれてしまうので、丸ごと消さないため）。
 */
function removeShadows(lab: LabImage, fg: Uint8Array, bg: Background): Uint8Array {
  const { width: w, height: h } = lab;
  const n = w * h;
  const lstd = localStdOnMask(lab, fg, SHADOW_WINDOW_RADIUS);
  const isShadow = (i: number) =>
    lab.L[i] < bg.L &&
    Math.abs(lab.a[i] - bg.a) < SHADOW_MAX_CHROMA_DIFF &&
    Math.abs(lab.b[i] - bg.b) < SHADOW_MAX_CHROMA_DIFF &&
    lstd[i] < SHADOW_MAX_LOCAL_STD;

  // filled が 0 の画素が成分の外側（画像の外周からたどれる背景）。内部の穴に面した縁は「外側の縁」に含めない
  const filled = fillHoles(fg, w, h);
  const stack = new Int32Array(n);
  const shadow = new Uint8Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (!fg[i] || !isShadow(i)) continue;
    const x = i % w, y = (i - x) / w;
    const onEdge =
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      !filled[i - 1] || !filled[i + 1] || !filled[i - w] || !filled[i + w];
    if (onEdge) { shadow[i] = 1; stack[sp++] = i; }
  }
  const visit = (j: number) => {
    if (fg[j] && !shadow[j] && isShadow(j)) { shadow[j] = 1; stack[sp++] = j; }
  };
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i - x) / w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }

  // 成分ごとに、外したあとに残る割合を確かめる
  const { labels, comps } = components(fg, w, h);
  const removed = new Int32Array(comps.length + 1);
  for (let i = 0; i < n; i++) if (shadow[i]) removed[labels[i]]++;
  const keepWhole = new Uint8Array(comps.length + 1);
  for (const c of comps) if (c.area - removed[c.label] < c.area * SHADOW_KEEP_RATIO) keepWhole[c.label] = 1;

  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (fg[i] && (!shadow[i] || keepWhole[labels[i]])) out[i] = 1;
  return out;
}

/**
 * 背景と色が違う画素を石の候補にする。
 * 1. 外周から背景色を推定し、各画素の背景色との色差 ΔE を計算
 * 2. しきい値 = max(背景のばらつき×3, ΔE 8)。これ以上の画素を種に、つながっていて
 *    しきい値×0.6 以上の画素まで広げる（ヒステリシス。白っぽい石の境界を取りこぼさない）。
 *    大津の方法は使わない（濃い石と並ぶとしきい値が上がり、白っぽい石が消えるため）
 * 3. 影を成分ごとに外す（removeShadows）
 * 4. オープニング（細い線・小さな点を消す）→ クロージング（小さな隙間を閉じる）→ 内部の穴埋め
 */
export function foregroundMask(lab: LabImage): Foreground {
  const { width: w, height: h } = lab;
  const n = w * h;
  const bg = estimateBackground(lab);
  const dE = new Float32Array(n);
  for (let i = 0; i < n; i++) dE[i] = Math.hypot(lab.L[i] - bg.L, lab.a[i] - bg.a, lab.b[i] - bg.b);
  const threshold = Math.max(BG_SPREAD_FACTOR * bg.spread, MIN_DELTA_E);
  let mask = removeShadows(lab, hysteresis(dE, w, h, threshold, threshold * HYSTERESIS_LOW), bg);
  mask = morph3(morph3(mask, w, h, true), w, h, false); // オープニング
  mask = morph3(morph3(mask, w, h, false), w, h, true); // クロージング
  mask = fillHoles(mask, w, h);
  return { mask, threshold, background: bg };
}

interface Component {
  label: number;
  area: number;
  sx: number;
  sy: number;
  box: Box;
  edge: boolean; // 画像の外周に接している
}

/** 4近傍の連結成分（再帰は深くなりすぎるのでスタックで塗りつぶす） */
function components(bin: Uint8Array, width: number, height: number): { labels: Int32Array; comps: Component[] } {
  const n = width * height;
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const comps: Component[] = [];
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (!bin[start] || labels[start]) continue;
    const label = ++next;
    const c: Component = { label, area: 0, sx: 0, sy: 0, box: { x0: width, y0: height, x1: 0, y1: 0 }, edge: false };
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
  return { labels, comps };
}

/**
 * 切り出しの結果。
 * ok: 石を切り出せた / none: 石が見つからない / tooLarge: 石が大きすぎる（背景を石と誤認した可能性）
 */
export type SegmentStatus = "ok" | "none" | "tooLarge";

/**
 * 学習に使える写真か。石が見つからない写真だけを外す。
 * 大きすぎる（tooLarge）写真も、外周に接していない石が切り出せているので使う。
 */
export function usableForTraining(status: SegmentStatus): boolean {
  return status !== "none";
}

export interface Extracted {
  features: StoneFeatures;
  mask: Uint8Array; // 画像全体サイズ。1=石
  status: SegmentStatus;
}

/**
 * 1個判定: RGBA 画素（縮小済み、長辺 ~400px）から石を1個切り出して特徴量を計算する。
 * 画像の外周に接していない成分のうち、最も大きいものを石とする。
 */
export function extractFeatures(rgba: Uint8ClampedArray, width: number, height: number): Extracted {
  const n = width * height;
  const lab = toLab(rgba, width, height);
  const { mask: fg } = foregroundMask(lab);
  const { labels, comps } = components(fg, width, height);
  const stone = comps
    .filter((c) => !c.edge && c.area >= n * MIN_STONE_AREA_RATIO)
    .reduce<Component | null>((best, c) => (!best || c.area > best.area ? c : best), null);
  const mask = new Uint8Array(n);
  if (!stone) {
    return { features: featuresFromMask(lab, mask, { x0: 0, y0: 0, x1: width, y1: height }, n), mask, status: "none" };
  }
  for (let i = 0; i < n; i++) if (labels[i] === stone.label) mask[i] = 1;
  return {
    features: featuresFromMask(lab, mask, stone.box, n),
    mask,
    status: stone.area >= n * MAX_SINGLE_STONE_AREA_RATIO ? "tooLarge" : "ok",
  };
}

// ---- まとめて判定: 1枚の写真に並べた複数の石を切り出す ----

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
  threshold: number; // 使った ΔE のしきい値
  /** 外周に接して除外した成分の合計面積が、残った石の合計より大きい（背景を誤認した可能性） */
  suspicious: boolean;
}

/**
 * 背景の上に隙間をあけて並べた石を1個ずつ切り出し、それぞれの特徴量を計算する。
 * 切り出し方は1個判定と同じ（foregroundMask）。小さすぎる成分と、画像の外周に接した成分
 * （見切れた石や、背景の外の机など）は除外する。
 */
export function segmentStones(rgba: Uint8ClampedArray, width: number, height: number): Segmentation {
  const n = width * height;
  const lab = toLab(rgba, width, height);
  const { mask: fg, threshold } = foregroundMask(lab);
  const { labels, comps } = components(fg, width, height);

  const kept = comps.filter((c) => c.area >= n * MIN_STONE_AREA_RATIO && !c.edge);
  const edgeArea = comps.filter((c) => c.edge).reduce((s, c) => s + c.area, 0);
  const keptArea = kept.reduce((s, c) => s + c.area, 0);
  const suspicious = edgeArea > keptArea;
  if (kept.length === 0) return { stones: [], labels, threshold, suspicious };

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
  return { stones, labels, threshold, suspicious };
}

/** 乾燥写真1枚から、モデルに入れるベクトルを作る（FEATURE_NAMES と同じ順） */
export const FEATURE_NAMES = ["L*", "a*", "b*", "L*ばらつき", "斑点率", "きめ"];

export function featureVector(f: StoneFeatures): number[] {
  return [f.L, f.a, f.b, f.Lstd, f.spotRatio, f.texture];
}
