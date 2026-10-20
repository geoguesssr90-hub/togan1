/**
 * 石の写真から判定用の特徴量を取り出す（純粋関数。学習と判定で同じものを使う）。
 *
 * 現場の目視基準に対応させている:
 *   白さ        → L*（明度）の平均
 *   黄み・褐色  → b*（黄-青）、a*（赤-緑）の平均
 *   縞・ムラ    → L* のばらつき、きめ（ラプラシアン）
 *   鉄斑        → 周囲より暗い点の割合
 *   濡らすと褐色化 → 湿潤と乾燥の差（pairVector で計算）
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

/**
 * RGBA 画素（縮小済み、長辺 ~400px）から特徴量を計算する。
 * 石は背景より明るい前提で、解析範囲内を大津の方法で二値化して石領域を取る。
 * 影は暗いので自動的に石領域から外れる。
 */
export function extractFeatures(rgba: Uint8ClampedArray, width: number, height: number): Extracted {
  const x0 = Math.floor(width * ROI.x0), x1 = Math.ceil(width * ROI.x1);
  const y0 = Math.floor(height * ROI.y0), y1 = Math.ceil(height * ROI.y1);
  const n = width * height;
  const Lm = new Float32Array(n), Am = new Float32Array(n), Bm = new Float32Array(n);
  const roiL: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const [L, a, b] = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      Lm[i] = L; Am[i] = a; Bm[i] = b;
      roiL.push(L);
    }
  const t = otsu(roiL);
  const mask = new Uint8Array(n);
  let count = 0, sL = 0, sA = 0, sB = 0, sL2 = 0;
  const Ls: number[] = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (Lm[i] >= t) {
        mask[i] = 1; count++;
        sL += Lm[i]; sA += Am[i]; sB += Bm[i]; sL2 += Lm[i] * Lm[i];
        Ls.push(Lm[i]);
      }
    }
  const roiArea = (x1 - x0) * (y1 - y0);
  if (count === 0) {
    return { features: { L: 0, a: 0, b: 0, Lstd: 0, spotRatio: 0, texture: 0, areaRatio: 0 }, mask };
  }
  const L = sL / count;
  const Lstd = Math.sqrt(Math.max(0, sL2 / count - L * L));
  Ls.sort((p, q) => p - q);
  const median = Ls[Ls.length >> 1];
  let spots = 0;
  for (const v of Ls) if (v < median - 12) spots++;

  // きめ: 石の内側（上下左右も石）の画素だけでラプラシアンの絶対値平均
  let tex = 0, texN = 0;
  for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y++)
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x++) {
      const i = y * width + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]) continue;
      tex += Math.abs(4 * Lm[i] - Lm[i - 1] - Lm[i + 1] - Lm[i - width] - Lm[i + width]);
      texN++;
    }

  return {
    features: {
      L,
      a: sA / count,
      b: sB / count,
      Lstd,
      spotRatio: spots / count,
      texture: texN ? tex / texN : 0,
      areaRatio: count / roiArea,
    },
    mask,
  };
}

/** 乾燥・湿潤の1組から、モデルに入れるベクトルを作る */
export const PAIR_FEATURE_NAMES = [
  "乾燥 L*", "乾燥 a*", "乾燥 b*", "乾燥 L*ばらつき", "乾燥 斑点率", "乾燥 きめ",
  "湿潤 L*", "湿潤 a*", "湿潤 b*", "湿潤 斑点率",
  "濡らした時の明度変化", "濡らした時の黄み変化",
];

export function pairVector(dry: StoneFeatures, wet: StoneFeatures): number[] {
  return [
    dry.L, dry.a, dry.b, dry.Lstd, dry.spotRatio, dry.texture,
    wet.L, wet.a, wet.b, wet.spotRatio,
    wet.L - dry.L, wet.b - dry.b,
  ];
}
