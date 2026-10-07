import { useEffect, useState } from "react";
import { deleteStone, listShots, listStones, nextStoneId, putStone } from "../db";
import { exportDataset } from "../exportZip";
import { GRADES, type Grade, type Shot, type Stone } from "../types";

export function Home({ onOpen }: { onOpen: (s: Stone) => void }) {
  const [stones, setStones] = useState<Stone[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: "", grade: "3" as Grade, source: "", note: "" });
  const [exporting, setExporting] = useState(false);
  const [storage, setStorage] = useState<string>("");

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

  const per = (id: string, c?: "dry" | "wet") => shots.filter((s) => s.stoneId === id && (!c || s.condition === c)).length;
  const usedGrades = GRADES.filter((g) => stones.some((s) => s.grade === g));

  return (
    <div className="screen">
      <header className="top">
        <h1>陶眼 <span>データ収集</span></h1>
        <p className="meta">{storage}</p>
      </header>

      {usedGrades.length > 0 && (
        <table className="summary">
          <thead>
            <tr><th>等級</th><th>石</th><th>乾燥</th><th>湿潤</th></tr>
          </thead>
          <tbody>
            {usedGrades.map((g) => {
              const ids = stones.filter((s) => s.grade === g).map((s) => s.id);
              const c = (cond: "dry" | "wet") => shots.filter((s) => ids.includes(s.stoneId) && s.condition === cond).length;
              return (
                <tr key={g}><td>{g}等級</td><td>{ids.length}</td><td>{c("dry")}</td><td>{c("wet")}</td></tr>
              );
            })}
          </tbody>
        </table>
      )}

      {adding ? (
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
        <button className="primary wide" onClick={startAdd}>石を登録する</button>
      )}

      <ul className="stones">
        {stones.map((s) => (
          <li key={s.id} className="card">
            <button className="stone-open" onClick={() => onOpen(s)}>
              <strong>{s.id}</strong>
              <span className="grade">{s.grade}等級</span>
              <span className="counts">乾 {per(s.id, "dry")} / 湿 {per(s.id, "wet")}</span>
            </button>
            <button className="x" onClick={() => remove(s)} aria-label={`${s.id}を削除`}>削除</button>
          </li>
        ))}
        {stones.length === 0 && !adding && <li className="empty">まだ石が登録されていません。</li>}
      </ul>

      <button className="ghost wide" onClick={doExport} disabled={exporting || shots.length === 0}>
        {exporting ? "書き出し中…" : `学習用データを書き出す（${shots.length}枚・ZIP）`}
      </button>
      <p className="tip">写真はこの端末のブラウザ内にだけ保存されます。撮影後はこまめにZIPで書き出してください。</p>
    </div>
  );
}
