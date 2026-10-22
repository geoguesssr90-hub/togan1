/** 判定結果の確からしさを、数字の代わりに「高・中・低」で示す（表示用の純粋関数） */
export type Confidence = "高" | "中" | "低";

/** 1位の確率から確信度を決める: 80%以上なら高、50%以上80%未満なら中、50%未満なら低 */
export function confidenceLabel(prob: number): Confidence {
  if (prob >= 0.8) return "高";
  if (prob >= 0.5) return "中";
  return "低";
}
