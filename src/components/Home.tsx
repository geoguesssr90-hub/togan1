import { useEffect, useState } from "react";
import { deleteAllData, deleteStone, deleteStones, listShots, listStones, nextStoneId, putStone } from "../db";
import { exportDataset } from "../exportZip";
import { deletionSummary, isWipeConfirmed, toggled, WIPE_CONFIRM_TEXT, withGrade } from "../selection";
import { GRADES, type Grade, type Shot, type Stone } from "../types";
import { ModelPanel } from "./ModelPanel";

export function Home({
  onStart,
  onOpen,
  onJudge,
  onSplitImport,
}: {
  onStart: () => void;
  onOpen: (s: Stone) => void;
  onJudge: () => void;
  onSplitImport: () => void;
}) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: "", grade: "3" as Grade, source: "", note: "" });
  const [exporting, setExporting] = useState(false);
  const [storage, setStorage] = useState<string>("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [wiping, setWiping] = useState(false);

  async function reload() {
    const [st, sh] = await Promise.all([listStones(), listShots()]);
    setStones(st);
    setShots(sh);
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage != null) setStorage(`${(est.usage / 1024 / 1024).toFixed(1)} MB 使用中`);
    } catch {
      /* noop */
    }
  }
  useEffect(() => {
    reload();
  }, []);

  function startAdd() {
    setForm((f) => ({ ...f, id: nextStoneId(stones), note: "" }));
    setAdding(true);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const id = form.id.trim();
    if (!id) return;
    if (stones.some((s) => s.id === id)) return alert(`${id} は既に登録されています`);
    const stone: Stone = { id, grade: form.grade, source: form.source.trim(), note: form.note.trim(), createdAt: Date.now() };
    await putStone(stone);
    setAdding(false);
    onOpen(stone);
  }

  async function remove(s: Stone) {
    if (!confirm(`${s.id} と写真をすべて削除しますか？`)) return;
    await deleteStone(s.id);
    reload();
  }

  function startSelect() {
    setAdding(false);
    setSelected(new Set());
    setSelecting(true);
  }

  function endSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function removeSelected() {
    const { stones: n, photos: m } = deletionSummary(selected, shots);
    if (n === 0) return;
    if (!confirm(`石 ${n} 個と写真 ${m} 枚を削除します。元に戻せません。よろしいですか？`)) return;
    setBusy(true);
    try {
      await deleteStones([...selected]);
      endSelect();
      await reload();
    } catch {
      alert("削除できませんでした。何も削除されていません。");
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      const blob = await exportDataset(stones, shots);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `togan-dataset-${stamp}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally {
      setExporting(false);
    }
  }

  const exportButton = (
    <button className="ghost wide" onClick={doExport} disabled={exporting || shots.length === 0}>
      {exporting ? "書き出し中…" : `学習用データを書き出す（${shots.length}枚・ZIP）`}
    </button>
  );

  if (wiping) {
    return (
      <WipeAll
        stoneCount={stones.length}
        photoCount={shots.length}
        exportButton={exportButton}
        onCancel={() => setWiping(false)}
        onDone={async () => {
          setWiping(false);
          endSelect();
          await reload();
        }}
      />
    );
  }

  const per = (id: string) => shots.filter((s) => s.stoneId === id).length;
  const usedGrades = GRADES.filter((g) => stones.some((s) => s.grade === g));
  const summary = deletionSummary(selected, shots);

  return (
    <div className={"screen" + (selecting ? " selecting" : "")}>
      <button className="back" onClick={onStart}>← 最初の画面</button>
      <header className="top">
        <h1>陶眼 <span>データ収集</span></h1>
        <p className="meta">{storage}</p>
      </header>

      {usedGrades.length > 0 && (
        <table className="summary">
          <thead>
            <tr><th>等級</th><th>石</th><th>写真</th></tr>
          </thead>
          <tbody>
            {usedGrades.map((g) => {
              const ids = stones.filter((s) => s.grade === g).map((s) => s.id);
              const n = shots.filter((s) => ids.includes(s.stoneId)).length;
              return (
                <tr key={g}><td>{g}等級</td><td>{ids.length}</td><td>{n}</td></tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selecting ? null : adding ? (
        <form className="card form" onSubmit={add}>
          <label>石ID<input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required /></label>
          <label>
            等級
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value as Grade })}>
              {GRADES.map((g) => <option key={g} value={g}>{g}等級</option>)}
            </select>
          </label>
          <label>入手元<input value={form.source} placeholder="例: 上田陶石 2026-09-11" onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
          <label>メモ<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="row">
            <button type="button" className="ghost" onClick={() => setAdding(false)}>やめる</button>
            <button className="primary">登録して撮影へ</button>
          </div>
        </form>
      ) : (
        <>
          <button className="primary wide" onClick={startAdd}>石を登録する</button>
          <button className="wide import-button" onClick={onSplitImport}>複数の石をまとめて取り込む</button>
        </>
      )}

      {stones.length > 0 && (
        <div className="list-head">
          <h3>石（{stones.length}個）</h3>
          <button className="ghost small" onClick={selecting ? endSelect : startSelect}>
            {selecting ? "完了" : "選択"}
          </button>
        </div>
      )}

      {selecting && (
        <div className="select-tools">
          <button className="small" onClick={() => setSelected(new Set(stones.map((s) => s.id)))}>すべて選択</button>
          {usedGrades.map((g) => (
            <button key={g} className="small" onClick={() => setSelected((sel) => withGrade(sel, stones, g))}>
              {g}等級
            </button>
          ))}
          <button className="small ghost" onClick={() => setSelected(new Set())}>選択を解除</button>
        </div>
      )}

      <ul className="stones">
        {stones.map((s) => (
          <li key={s.id} className={"card" + (selected.has(s.id) ? " selected" : "")}>
            {selecting ? (
              <label className="stone-open stone-check">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => setSelected((sel) => toggled(sel, s.id))} />
                <strong>{s.id}</strong>
                <span className="grade">{s.grade}等級</span>
                <span className="counts">写真 {per(s.id)}枚</span>
              </label>
            ) : (
              <>
                <button className="stone-open" onClick={() => onOpen(s)}>
                  <strong>{s.id}</strong>
                  <span className="grade">{s.grade}等級</span>
                  <span className="counts">写真 {per(s.id)}枚</span>
                </button>
                <button className="x" onClick={() => remove(s)} aria-label={`${s.id}を削除`}>削除</button>
              </>
            )}
          </li>
        ))}
        {stones.length === 0 && !adding && <li className="empty">まだ石が登録されていません。</li>}
      </ul>

      {!selecting && (
        <>
          <ModelPanel onJudge={onJudge} />
          {exportButton}
          <p className="tip">写真はこの端末のブラウザ内にだけ保存されます。撮影後はこまめにZIPで書き出してください。</p>
          {(stones.length > 0 || shots.length > 0) && (
            <button className="link-danger" onClick={() => setWiping(true)}>すべてのデータを削除</button>
          )}
        </>
      )}

      {selecting && (
        <div className="select-bar">
          <button className="danger" onClick={removeSelected} disabled={busy || summary.stones === 0}>
            {busy ? "削除中…" : `選択した石を削除（${summary.stones}個・写真${summary.photos}枚）`}
          </button>
        </div>
      )}
    </div>
  );
}

/** すべてのデータを削除する確認画面。「削除する」と入力しないと実行できない */
function WipeAll({
  stoneCount,
  photoCount,
  exportButton,
  onCancel,
  onDone,
}: {
  stoneCount: number;
  photoCount: number;
  exportButton: React.ReactNode;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function wipe() {
    if (!isWipeConfirmed(text)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAllData();
      onDone();
    } catch {
      setError("削除できませんでした。何も削除されていません。");
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <button className="back" onClick={onCancel}>← 一覧</button>
      <h2>すべてのデータを削除</h2>
      <p>
        この端末に保存した石 {stoneCount} 個と写真 {photoCount} 枚をすべて削除します。元に戻せません。
        端末で学習したモデルは削除しません。
      </p>
      <p className="warnings warn">先にZIPで書き出すことをおすすめします。</p>
      {exportButton}
      <label className="wipe-confirm">
        確認のため「{WIPE_CONFIRM_TEXT}」と入力してください
        <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      {error && <p className="warnings bad">{error}</p>}
      <div className="row">
        <button className="ghost" onClick={onCancel} disabled={busy}>やめる</button>
        <button className="danger" onClick={wipe} disabled={busy || !isWipeConfirmed(text)}>
          {busy ? "削除中…" : "すべて削除する"}
        </button>
      </div>
    </div>
  );
}
