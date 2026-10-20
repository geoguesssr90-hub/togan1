/** まとめて判定: 切り出した石ごとの判定と、表・裏の突き合わせ（純粋関数） */
import type { Box, SegmentedStone } from "./features";
import { predict, type Model } from "./model";

/**
 * 2つの等級のうち悪い方を返す。
 * 前提: 等級は数字の文字列（types.ts の GRADES = "1"〜"5"）で、数字が大きいほど品質が低い。
 * 等級の付け方が変わったら、ここを直す。
 */
export function worseGrade(a: string, b: string): string {
  return Number(b) > Number(a) ? b : a;
}

export interface StoneJudgement {
  index: number;
  box: Box; // 乾燥写真上の位置
  maybeMerged: boolean;
  grade: string;
  prob: number;
}

/**
 * 同じ面の乾燥・湿潤写真から切り出した石を番号順に対応させて判定する。
 * 石はその場で濡らす前提なので、番号が同じなら同じ石とみなす。数が違えば対応が取れないので null。
 */
export function judgeSide(model: Model, dry: SegmentedStone[], wet: SegmentedStone[]): StoneJudgement[] | null {
  if (dry.length === 0 || dry.length !== wet.length) return null;
  return dry.map((d, k) => {
    const w = wet[k];
    const probs = predict(model, d.features, w.features);
    const top = probs.reduce((p, q) => (q.prob > p.prob ? q : p));
    return { index: d.index, box: d.box, maybeMerged: d.maybeMerged || w.maybeMerged, grade: top.grade, prob: top.prob };
  });
}
