import type { QualityMetrics } from "./types";

/**
 * RGBA画素列から画質指標を計算する（純粋関数。テスト可能）。
 * 解析は縮小画像で行う前提（長辺 ~400px）。
 */
export function computeQuality(rgba: Uint8ClampedArray, width: number, height: number): QualityMetrics {
  const n = width * height;
  const luma = new Float32Array(n);
  let sum = 0;
  let clipped = 0;
  let dark = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y;
    sum += y;
    if (r >= 250 && g >= 250 && b >= 250) clipped++;
    if (y <= 15) dark++;
  }

  // ラプラシアン分散でピントの甘さを見る
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let yy = 1; yy < height - 1; yy++) {
    for (let xx = 1; xx < width - 1; xx++) {
      const i = yy * width + xx;
      const v = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      lapSum += v;
      lapSq += v * v;
      count++;
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const sharpness = count ? lapSq / count - lapMean * lapMean : 0;

  return {
    meanLuma: n ? sum / n : 0,
    sharpness,
    clippedRatio: n ? clipped / n : 0,
    darkRatio: n ? dark / n : 0,
  };
}

export interface QualityWarning {
  level: "warn" | "bad";
  message: string;
}

/** しきい値は暫定。実データで調整する。 */
export function judgeQuality(q: QualityMetrics): QualityWarning[] {
  const w: QualityWarning[] = [];
  if (q.sharpness < 20) w.push({ level: "bad", message: "ピントが合っていません。撮り直してください" });
  else if (q.sharpness < 60) w.push({ level: "warn", message: "ややピンボケの可能性があります" });
  if (q.clippedRatio > 0.05) w.push({ level: "bad", message: "白飛びしています。光を弱めてください" });
  if (q.meanLuma < 60) w.push({ level: "warn", message: "暗すぎます。照明を確認してください" });
  if (q.darkRatio > 0.15) w.push({ level: "warn", message: "濃い影があります。拡散光で撮ってください" });
  return w;
}
