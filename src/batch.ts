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
  box: Box; // 写真上の位置
  maybeMerged: boolean;
  grade: string;
  prob: number;
}

/** 1枚の写真から切り出した石を、それぞれ判定する */
export function judgeStones(model: Model, stones: SegmentedStone[]): StoneJudgement[] {
  return stones.map((s) => {
    const top = predict(model, s.features).reduce((p, q) => (q.prob > p.prob ? q : p));
    return { index: s.index, box: s.box, maybeMerged: s.maybeMerged, grade: top.grade, prob: top.prob };
  });
}

export interface PairedRow {
  index: number;
  front: StoneJudgement;
  back: StoneJudgement | null; // 裏を撮らなかった場合 null
  overall: string; // 表と裏のうち悪い方の等級
}

/**
 * 表と裏を番号順に対応させる。石はその場で裏返す前提なので、番号が同じなら同じ石とみなす。
 * 裏がない（null）ときは表だけで総合を出す。石の数が違えば対応が取れないので null。
 */
export function pairSides(front: StoneJudgement[], back: StoneJudgement[] | null): PairedRow[] | null {
  if (back && back.length !== front.length) return null;
  return front.map((f, k) => {
    const b = back ? back[k] : null;
    return { index: f.index, front: f, back: b, overall: b ? worseGrade(f.grade, b.grade) : f.grade };
  });
}
