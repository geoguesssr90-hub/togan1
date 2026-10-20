import { useEffect, useMemo, useState } from "react";
import { listStones, moveShots } from "../db";
import { allocateStoneIds, sortByCreatedAt, splitEvery } from "../split";
import type { Shot, Stone } from "../types";
import { parsePerStone, PerStoneInput, SplitPreview, useThumbnails } from "./SplitPreview";

interface Props {
  stone: Stone;
  shots: Shot[];
  onCancel: () => void;
  /** 振り分けが終わったとき。元の石を削除したら deleted = true */
  onDone: (deleted: boolean) => void;
}

/** 1つの石IDに入っている写真を、撮影順に N 枚ずつ新しい石IDへ分け直す */
export function SplitStone({ stone, shots, onCancel, onDone }: Props) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [perStoneText, setPerStoneText] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStones().then(setStones);
  }, []);

  const sorted = useMemo(() => sortByCreatedAt(shots), [shots]);
  const blobs = useMemo(() => sorted.map((s) => s.blob), [sorted]);
  const thumbs = useThumbnails(blobs);
  const perStone = parsePerStone(perStoneText);
  const split = perStone ? splitEvery(sorted, perStone) : null;
  const ids = split ? allocateStoneIds(stones, split.groups.length) : [];
  const canSplit = !!split && split.groups.length >= 2;

  async function apply() {
    if (!split || !canSplit) return;
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const note = [stone.note, `${stone.id} から分割`].filter(Boolean).join(" / ");
      const newStones: Stone[] = ids.map((id) => ({ id, grade: stone.grade, source: stone.source, note, createdAt: now }));
      const moves = split.groups.flatMap((g, k) => g.map((s) => ({ shotId: s.id, stoneId: ids[k] })));
      onDone(await moveShots(newStones, moves, stone.id));
    } catch {
      setError("分け直しに失敗しました。写真は元の石に残っています。");
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h2>{stone.id} を別の石に分ける</h2>
      <p className="tip">
        写真を撮影順に並べて区切り、新しい石ID（{stone.grade}等級）に移します。元の {stone.id} は空になったら削除します。
      </p>
      <div className="settings">
        <PerStoneInput value={perStoneText} onChange={setPerStoneText} />
        {!perStone && <p className="warnings bad">1個あたりの枚数は1以上の整数にしてください。</p>}
      </div>
      {split && (
        <SplitPreview
          rows={split.groups.map((g, k) => ({ stoneId: ids[k], photos: g.map((_, j) => k * perStone! + j) }))}
          thumbs={thumbs}
          perStone={perStone!}
          total={sorted.length}
          remainder={split.remainder}
        />
      )}
      {split && !canSplit && <p className="tip">写真が{perStone}枚以下なので、分ける必要はありません。</p>}
      {error && <p className="warnings bad">{error}</p>}
      <div className="row">
        <button className="ghost" onClick={onCancel} disabled={busy}>キャンセル</button>
        <button className="primary" onClick={apply} disabled={!canSplit || busy}>
          {busy ? "移動中…" : `石 ${split?.groups.length ?? 0} 個に分ける`}
        </button>
      </div>
    </div>
  );
}
