/**
 * 等級判定モデル: 特徴量の標準化 + 多クラス・ロジスティック回帰（ソフトマックス回帰）。
 * データが少ない段階でも学習でき、どの特徴が効いたかを説明しやすい。
 * データが増えたら CNN に置き換える想定（入出力の形はそのまま使える）。
 */
import { PAIR_FEATURE_NAMES, pairVector, type StoneFeatures } from "./features";

export interface Model {
  version: 1;
  grades: string[];
  featureNames: string[];
  mean: number[];
  std: number[];
  W: number[][]; // [クラス][特徴]
  bias: number[];
  trainedAt: number;
  nStones: number;
  nPairs: number;
  cvAccuracy: number | null; // 石を1個ずつ抜いて検証した正解率
}

export interface StoneSamples {
  stoneId: string;
  grade: string;
  dry: StoneFeatures[];
  wet: StoneFeatures[];
}

const MAX_PAIRS_PER_STONE = 25;

/** 石ごとに乾燥×湿潤の組を作る（多すぎる石が支配しないよう上限あり） */
export function buildPairs(stones: StoneSamples[]): { X: number[][]; y: string[]; stoneIds: string[] } {
  const X: number[][] = [], y: string[] = [], stoneIds: string[] = [];
  for (const s of stones) {
    const pairs: number[][] = [];
    for (const d of s.dry) for (const w of s.wet) pairs.push(pairVector(d, w));
    const step = Math.max(1, pairs.length / MAX_PAIRS_PER_STONE);
    for (let k = 0; k < pairs.length; k += step) {
      X.push(pairs[Math.floor(k)]);
      y.push(s.grade);
      stoneIds.push(s.stoneId);
    }
  }
  return { X, y, stoneIds };
}

function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((p, q) => p + q, 0);
  return e.map((v) => v / s);
}

export function fitSoftmax(
  X: number[][],
  yIdx: number[],
  nClasses: number,
  opts = { l2: 0.05, iters: 800, lr: 0.3 },
): { W: number[][]; bias: number[] } {
  const d = X[0]?.length ?? 0;
  const n = X.length;
  const W = Array.from({ length: nClasses }, () => new Array(d).fill(0));
  const bias = new Array(nClasses).fill(0);
  for (let it = 0; it < opts.iters; it++) {
    const gW = Array.from({ length: nClasses }, () => new Array(d).fill(0));
    const gb = new Array(nClasses).fill(0);
    for (let i = 0; i < n; i++) {
      const p = softmax(W.map((w, c) => bias[c] + w.reduce((s, wj, j) => s + wj * X[i][j], 0)));
      for (let c = 0; c < nClasses; c++) {
        const err = p[c] - (yIdx[i] === c ? 1 : 0);
        gb[c] += err;
        for (let j = 0; j < d; j++) gW[c][j] += err * X[i][j];
      }
    }
    for (let c = 0; c < nClasses; c++) {
      bias[c] -= (opts.lr * gb[c]) / n;
      for (let j = 0; j < d; j++) W[c][j] -= opts.lr * (gW[c][j] / n + opts.l2 * W[c][j]);
    }
  }
  return { W, bias };
}

function stats(X: number[][]): { mean: number[]; std: number[] } {
  const d = X[0].length;
  const mean = new Array(d).fill(0), std = new Array(d).fill(0);
  for (const x of X) x.forEach((v, j) => (mean[j] += v / X.length));
  for (const x of X) x.forEach((v, j) => (std[j] += (v - mean[j]) ** 2 / X.length));
  return { mean, std: std.map((v) => Math.sqrt(v) || 1) };
}

function fitModel(X: number[][], y: string[], grades: string[]) {
  const { mean, std } = stats(X);
  const Z = X.map((x) => x.map((v, j) => (v - mean[j]) / std[j]));
  const { W, bias } = fitSoftmax(Z, y.map((g) => grades.indexOf(g)), grades.length);
  return { mean, std, W, bias };
}

export function predictVector(m: Pick<Model, "mean" | "std" | "W" | "bias">, x: number[]): number[] {
  const z = x.map((v, j) => (v - m.mean[j]) / m.std[j]);
  return softmax(m.W.map((w, c) => m.bias[c] + w.reduce((s, wj, j) => s + wj * z[j], 0)));
}

export function predict(model: Model, dry: StoneFeatures, wet: StoneFeatures): { grade: string; prob: number }[] {
  const p = predictVector(model, pairVector(dry, wet));
  return model.grades.map((grade, i) => ({ grade, prob: p[i] }));
}

/** 学習に使える石（乾燥・湿潤が両方ある）と等級の数を確認 */
export function usableStones(stones: StoneSamples[]): StoneSamples[] {
  return stones.filter((s) => s.dry.length > 0 && s.wet.length > 0);
}

export function trainModel(all: StoneSamples[]): Model {
  const stones = usableStones(all);
  const grades = [...new Set(stones.map((s) => s.grade))].sort();
  if (grades.length < 2) {
    throw new Error("乾燥と湿潤の両方が撮れている石が、2つ以上の等級で必要です");
  }
  const { X, y } = buildPairs(stones);
  const fitted = fitModel(X, y, grades);

  // 石を1個ずつ抜いて学習→その石を判定（同じ石が学習と検証の両方に入らない）
  let correct = 0, total = 0;
  for (const held of stones) {
    const rest = stones.filter((s) => s !== held);
    const restGrades = new Set(rest.map((s) => s.grade));
    if (restGrades.size < 2 || !restGrades.has(held.grade)) continue;
    const tr = buildPairs(rest);
    const m = fitModel(tr.X, tr.y, grades);
    // 石単位: その石の全ペアの確率を平均して判定
    const te = buildPairs([held]);
    const avg = new Array(grades.length).fill(0);
    for (const x of te.X) predictVector(m, x).forEach((p, i) => (avg[i] += p / te.X.length));
    const guess = grades[avg.indexOf(Math.max(...avg))];
    if (guess === held.grade) correct++;
    total++;
  }

  return {
    version: 1,
    grades,
    featureNames: PAIR_FEATURE_NAMES,
    ...fitted,
    trainedAt: Date.now(),
    nStones: stones.length,
    nPairs: X.length,
    cvAccuracy: total ? correct / total : null,
  };
}

export function isModel(v: unknown): v is Model {
  const m = v as Model;
  return !!m && m.version === 1 && Array.isArray(m.grades) && Array.isArray(m.W) && m.W.length === m.grades.length;
}
