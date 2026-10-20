/**
 * 等級判定モデル: 特徴量の標準化 + 多クラス・ロジスティック回帰（ソフトマックス回帰）。
 * データが少ない段階でも学習でき、どの特徴が効いたかを説明しやすい。
 * データが増えたら CNN に置き換える想定（入出力の形はそのまま使える）。
 */
import { FEATURE_NAMES, featureVector, SEGMENTATION, type StoneFeatures } from "./features";

export interface Model {
  version: 2;
  segmentation: typeof SEGMENTATION; // 学習に使った石の切り出し方式。判定時と同じでなければ使えない
  grades: string[];
  featureNames: string[];
  mean: number[];
  std: number[];
  W: number[][]; // [クラス][特徴]
  bias: number[];
  trainedAt: number;
  nStones: number;
  nPhotos: number; // 学習に使った写真（サンプル）の数
  cvAccuracy: number | null; // 石を1個ずつ抜いて検証した正解率
}

export interface StoneSamples {
  stoneId: string;
  grade: string;
  dry: StoneFeatures[];
}

const MAX_PHOTOS_PER_STONE = 25;

/** 乾燥写真1枚を1サンプルにする（写真の多い石が支配しないよう、石ごとに上限あり） */
export function buildSamples(stones: StoneSamples[]): { X: number[][]; y: string[]; stoneIds: string[] } {
  const X: number[][] = [], y: string[] = [], stoneIds: string[] = [];
  for (const s of stones) {
    // 等間隔に間引く（刻み幅を足し続けると誤差で上限を1枚超えることがあるので、回数で数える）
    const n = Math.min(s.dry.length, MAX_PHOTOS_PER_STONE);
    for (let k = 0; k < n; k++) {
      X.push(featureVector(s.dry[Math.floor((k * s.dry.length) / n)]));
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

export function predict(model: Model, dry: StoneFeatures): { grade: string; prob: number }[] {
  const p = predictVector(model, featureVector(dry));
  return model.grades.map((grade, i) => ({ grade, prob: p[i] }));
}

/** 学習に使える石（乾燥写真がある） */
export function usableStones(stones: StoneSamples[]): StoneSamples[] {
  return stones.filter((s) => s.dry.length > 0);
}

export function trainModel(all: StoneSamples[]): Model {
  const stones = usableStones(all);
  const grades = [...new Set(stones.map((s) => s.grade))].sort();
  if (grades.length < 2) {
    throw new Error("乾燥写真のある石が、2つ以上の等級で必要です");
  }
  const { X, y } = buildSamples(stones);
  const fitted = fitModel(X, y, grades);

  // 石を1個ずつ抜いて学習→その石を判定（同じ石が学習と検証の両方に入らない）
  let correct = 0, total = 0;
  for (const held of stones) {
    const rest = stones.filter((s) => s !== held);
    const restGrades = new Set(rest.map((s) => s.grade));
    if (restGrades.size < 2 || !restGrades.has(held.grade)) continue;
    const tr = buildSamples(rest);
    const m = fitModel(tr.X, tr.y, grades);
    // 石単位: その石の全写真の確率を平均して判定
    const te = buildSamples([held]);
    const avg = new Array(grades.length).fill(0);
    for (const x of te.X) predictVector(m, x).forEach((p, i) => (avg[i] += p / te.X.length));
    const guess = grades[avg.indexOf(Math.max(...avg))];
    if (guess === held.grade) correct++;
    total++;
  }

  return {
    version: 2,
    segmentation: SEGMENTATION,
    grades,
    featureNames: FEATURE_NAMES,
    ...fitted,
    trainedAt: Date.now(),
    nStones: stones.length,
    nPhotos: X.length,
    cvAccuracy: total ? correct / total : null,
  };
}

/**
 * 読み込んだデータが、今のコードで使えるモデルかを確かめる。
 * 特徴量の数・順番（featureNames）が FEATURE_NAMES と違うモデルや、石の切り出し方式（segmentation）が
 * 今と違うモデルは、読めても誤った判定になるので受け付けない。
 */
export function isModel(v: unknown): v is Model {
  const m = v as Model;
  if (!m || m.version !== 2 || m.segmentation !== SEGMENTATION) return false;
  if (!Array.isArray(m.grades) || m.grades.length < 2) return false;
  const d = FEATURE_NAMES.length;
  const numbers = (a: unknown, n: number) =>
    Array.isArray(a) && a.length === n && a.every((x) => typeof x === "number" && Number.isFinite(x));
  return (
    Array.isArray(m.featureNames) &&
    m.featureNames.length === d &&
    m.featureNames.every((f, j) => f === FEATURE_NAMES[j]) &&
    numbers(m.mean, d) &&
    numbers(m.std, d) &&
    numbers(m.bias, m.grades.length) &&
    Array.isArray(m.W) &&
    m.W.length === m.grades.length &&
    m.W.every((w) => numbers(w, d))
  );
}
