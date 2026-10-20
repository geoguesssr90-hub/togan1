/** まとめて削除のための選択操作（純粋関数） */

/** id の選択を切り替えた新しい集合を返す */
export function toggled(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 指定した等級の石をすべて選択に加える（既に選んでいる石はそのまま） */
export function withGrade(
  selected: ReadonlySet<string>,
  stones: readonly { id: string; grade: string }[],
  grade: string,
): Set<string> {
  const next = new Set(selected);
  for (const s of stones) if (s.grade === grade) next.add(s.id);
  return next;
}

/** 選んだ石の個数と、一緒に消える写真の枚数 */
export function deletionSummary(
  selectedStoneIds: ReadonlySet<string>,
  shots: readonly { stoneId: string }[],
): { stones: number; photos: number } {
  return { stones: selectedStoneIds.size, photos: shots.filter((s) => selectedStoneIds.has(s.stoneId)).length };
}

/** 「すべてのデータを削除」の確認文字列 */
export const WIPE_CONFIRM_TEXT = "削除する";

export function isWipeConfirmed(input: string): boolean {
  return input.trim() === WIPE_CONFIRM_TEXT;
}
