import { useEffect, useMemo, useState } from "react";
import { deleteShot, listShots, putShot } from "../db";
import { newId, type Captured } from "../capture";
import { judgeQuality } from "../quality";
import { CONDITION_LABEL, type Condition, type Shot, type Stone } from "../types";
import { Camera } from "./Camera";

const FACES = ["A面", "B面", "C面", "D面", "側面", "その他"];

export function StoneDetail({ stone, onBack }: { stone: Stone; onBack: () => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [condition, setCondition] = useState<Condition>("dry");
  const [face, setFace] = useState(FACES[0]);
  const [hasCard, setHasCard] = useState(true);
  const [mode, setMode] = useState<"list" | "camera">("list");
  const [pending, setPending] = useState<Captured | null>(null);

  const reload = () => listShots(stone.id).then(setShots);
  useEffect(() => {
    reload();
  }, [stone.id]);

  const urls = useMemo(() => new Map(shots.map((s) => [s.id, URL.createObjectURL(s.blob)])), [shots]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const count = (c: Condition) => shots.filter((s) => s.condition === c).length;

  async function save() {
    if (!pending) return;
    await putShot({
      id: newId(),
      stoneId: stone.id,
      condition,
      face,
      hasReferenceCard: hasCard,
      width: pending.width,
      height: pending.height,
      quality: pending.quality,
      createdAt: Date.now(),
      blob: pending.blob,
    });
    URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    await reload();
    setMode("camera"); // 続けて撮れるようにカメラへ戻る
  }

  function retake() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setMode("camera");
  }

  async function remove(id: string) {
    if (!confirm("この写真を削除しますか？")) return;
    await deleteShot(id);
    reload();
  }

  if (pending) {
    const warnings = judgeQuality(pending.quality);
    const bad = warnings.some((w) => w.level === "bad");
    return (
      <div className="screen">
        <h2>確認</h2>
        <img className="review" src={pending.previewUrl} alt="撮影した写真" />
        <p className="meta">
          {stone.id} / {stone.grade}等級 / {CONDITION_LABEL[condition]} / {face}
        </p>
        {warnings.length === 0 ? (
          <p className="ok">画質チェック: 問題なし</p>
        ) : (
          <ul className="warnings">
            {warnings.map((w) => (
              <li key={w.message} className={w.level}>{w.message}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="ghost" onClick={retake}>撮り直す</button>
          <button className={bad ? "danger" : "primary"} onClick={save}>
            {bad ? "このまま保存" : "保存"}
          </button>
        </div>
      </div>
    );
  }

  const settings = (
    <div className="settings">
      <div className="seg" role="radiogroup" aria-label="撮影条件">
        {(["dry", "wet"] as Condition[]).map((c) => (
          <button key={c} className={condition === c ? "on" : ""} onClick={() => setCondition(c)} role="radio" aria-checked={condition === c}>
            {CONDITION_LABEL[c]} <small>{count(c)}枚</small>
          </button>
        ))}
      </div>
      <div className="row">
        <select value={face} onChange={(e) => setFace(e.target.value)} aria-label="面">
          {FACES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={hasCard} onChange={(e) => setHasCard(e.target.checked)} />
          基準カードあり
        </label>
      </div>
    </div>
  );

  if (mode === "camera") {
    return (
      <div className="screen camera-screen">
        {settings}
        <Camera
          hint={`${stone.id}（${stone.grade}等級）${CONDITION_LABEL[condition]}・${face}`}
          onCaptured={(c) => setPending(c)}
          onCancel={() => setMode("list")}
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>← 一覧</button>
      <h2>
        {stone.id} <span className="grade">{stone.grade}等級</span>
      </h2>
      {(stone.source || stone.note) && <p className="meta">{[stone.source, stone.note].filter(Boolean).join(" / ")}</p>}
      {settings}
      <button className="primary wide" onClick={() => setMode("camera")}>
        {CONDITION_LABEL[condition]}を撮影する
      </button>
      {count("dry") > 0 && count("wet") === 0 && (
        <p className="tip">乾燥写真のみです。同じ面を水で濡らした写真も撮ると、褐色化の比較ができます。</p>
      )}
      {(["dry", "wet"] as Condition[]).map((c) => (
        <section key={c}>
          <h3>{CONDITION_LABEL[c]}（{count(c)}枚）</h3>
          <div className="grid">
            {shots
              .filter((s) => s.condition === c)
              .map((s) => (
                <figure key={s.id}>
                  <img src={urls.get(s.id)} alt={`${s.face}`} loading="lazy" />
                  <figcaption>
                    {s.face}
                    {judgeQuality(s.quality).some((w) => w.level === "bad") && <span className="flag">要確認</span>}
                    <button className="x" onClick={() => remove(s.id)} aria-label="削除">削除</button>
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
