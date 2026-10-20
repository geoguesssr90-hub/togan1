import { useEffect, useMemo, useRef, useState } from "react";
import { listStones } from "../db";
import { allocateStoneIds, initialPlan, sortByCaptureOrder, type Plan } from "../split";
import { GRADES, type Grade, type Stone } from "../types";
import { ImportRunner, type ImportItem } from "./BulkImport";
import { parsePerStone, PerStoneInput, SplitPreview, useThumbnails } from "./SplitPreview";

/** 複数の石を撮った写真を、撮影順に N 枚ずつ新しい石へ振り分けて取り込む */
export function SplitImport({ onDone }: { onDone: () => void }) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [grade, setGrade] = useState<Grade>("3");
  const [perStoneText, setPerStoneText] = useState("3");
  const [hasCard, setHasCard] = useState(true);
  const [files, setFiles] = useState<File[] | null>(null);
  const [run, setRun] = useState<{ items: ImportItem[]; newStones: Stone[] } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listStones().then(setStones);
  }, []);

  const perStone = parsePerStone(perStoneText);
  const sorted = useMemo(() => (files ? sortByCaptureOrder(files) : []), [files]);
  const thumbs = useThumbnails(sorted);
  // 写真か枚数が変わったら、N 枚ずつの振り分けからやり直す
  useEffect(() => {
    setPlan(perStone ? initialPlan(sorted.length, perStone) : null);
  }, [sorted, perStone]);
  const ids = plan ? allocateStoneIds(stones, plan.rows.length) : [];

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length) setFiles(picked);
  }

  function start() {
    if (!plan || plan.rows.length === 0) return;
    const now = Date.now();
    const newStones: Stone[] = ids.map((id) => ({ id, grade, source: "", note: "", createdAt: now }));
    const items = plan.rows.flatMap((r, k) => r.map((i) => ({ file: sorted[i], stoneId: ids[k] })));
    setRun({ items, newStones });
  }

  if (run) return <ImportRunner items={run.items} newStones={run.newStones} hasCard={hasCard} onDone={onDone} />;

  const settings = (
    <div className="settings">
      <div className="row">
        <label>
          等級
          <select value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
            {GRADES.map((g) => <option key={g} value={g}>{g}等級</option>)}
          </select>
        </label>
        <PerStoneInput value={perStoneText} onChange={setPerStoneText} />
      </div>
      {!perStone && <p className="warnings bad">1個あたりの枚数は1以上の整数にしてください。</p>}
      <label className="check">
        <input type="checkbox" checked={hasCard} onChange={(e) => setHasCard(e.target.checked)} />
        基準カードあり
      </label>
    </div>
  );

  const picker = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPick} />;

  if (!files) {
    return (
      <div className="screen">
        <button className="back" onClick={onDone}>← 一覧</button>
        <h2>複数の石をまとめて取り込む</h2>
        <p className="tip">
          1個の石を続けて同じ枚数ずつ撮った写真を、撮影順に区切って新しい石IDに振り分けます。取り込む前に確認画面が出ます。
        </p>
        {settings}
        <button className="primary wide" onClick={() => fileRef.current?.click()}>写真を選ぶ</button>
        {picker}
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>振り分けの確認</h2>
      {settings}
      <p className="tip">枚数を変えると、手直しした振り分けは最初からやり直しになります。</p>
      {plan && perStone && (
        <SplitPreview
          key={perStone}
          plan={plan}
          onChange={setPlan}
          ids={ids}
          thumbs={thumbs}
          perStone={perStone}
          excludeLabel="取り込まない"
        />
      )}
      <div className="row">
        <button className="ghost" onClick={() => setFiles(null)}>選び直す</button>
        <button className="primary" onClick={start} disabled={!plan || plan.rows.length === 0}>
          取り込む（{grade}等級・石 {plan?.rows.length ?? 0} 個）
        </button>
      </div>
      <button className="ghost wide" onClick={onDone}>やめる</button>
      {picker}
    </div>
  );
}
