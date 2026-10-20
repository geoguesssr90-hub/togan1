import { useEffect, useMemo, useState } from "react";
import { listStones, moveShots } from "../db";
import { allocateStoneIds, initialPlan, sortByCreatedAt, type Plan } from "../split";
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
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    listStones().then(setStones);
  }, []);

  const sorted = useMemo(() => sortByCreatedAt(shots), [shots]);
  const blobs = useMemo(() => sorted.map((s) => s.blob), [sorted]);
  const thumbs = useThumbnails(blobs);
  const perStone = parsePerStone(perStoneText);
  // 写真か枚数が変わったら、N 枚ずつの振り分けからやり直す
  useEffect(() => {
    setPlan(perStone ? initialPlan(sorted.length, perStone) : null);
  }, [sorted, perStone]);
  const ids = plan ? allocateStoneIds(stones, plan.rows.length) : [];
  // 1行だけでも、元の石に残す写真があれば「一部を新しい石へ移す」意味がある
  const canSplit = !!plan && plan.rows.length >= 1 && (plan.rows.length >= 2 || plan.excluded.length > 0);

  async function apply() {
    if (!plan || !canSplit) return;
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const note = [stone.note, `${stone.id} から分割`].filter(Boolean).join(" / ");
      const newStones: Stone[] = ids.map((id) => ({ id, grade: stone.grade, source: stone.source, note, createdAt: now }));
      const moves = plan.rows.flatMap((r, k) => r.map((i) => ({ shotId: sorted[i].id, stoneId: ids[k] })));
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
        写真を撮影順に並べて区切り、新しい石ID（{stone.grade}等級）に移します。「元の石に残す」にした写真は {stone.id}
        に残り、{stone.id} が空になったら削除します。
      </p>
      <div className="settings">
        <PerStoneInput value={perStoneText} onChange={setPerStoneText} />
        {!perStone && <p className="warnings bad">1個あたりの枚数は1以上の整数にしてください。</p>}
      </div>
      <p className="tip">枚数を変えると、手直しした振り分けは最初からやり直しになります。</p>
      {plan && perStone && (
        <SplitPreview
          key={perStone}
          plan={plan}
          onChange={setPlan}
          ids={ids}
          thumbs={thumbs}
          perStone={perStone}
          excludeLabel="元の石に残す"
        />
      )}
      {plan && !canSplit && <p className="tip">このままでは分ける必要がありません（行が1つで、元の石に残す写真もありません）。</p>}
      {error && <p className="warnings bad">{error}</p>}
      <div className="row">
        <button className="ghost" onClick={onCancel} disabled={busy}>キャンセル</button>
        <button className="primary" onClick={apply} disabled={!canSplit || busy}>
          {busy ? "移動中…" : `石 ${plan?.rows.length ?? 0} 個に分ける`}
        </button>
      </div>
    </div>
  );
}
