import { useEffect, useMemo, useRef, useState } from "react";
import { deleteShot, listShots, putShot } from "../db";
import { newId, type Captured } from "../capture";
import { judgeQuality } from "../quality";
import { CONDITION_LABEL, type Shot, type Stone } from "../types";
import { BulkImport } from "./BulkImport";
import { Camera } from "./Camera";
import { SplitStone } from "./SplitStone";

export function StoneDetail({ stone, onBack }: { stone: Stone; onBack: () => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [hasCard, setHasCard] = useState(true);
  const [mode, setMode] = useState<"list" | "camera" | "split">("list");
  const [pending, setPending] = useState<Captured | null>(null);
  const [importFiles, setImportFiles] = useState<File[] | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const reload = () => listShots(stone.id).then(setShots);
  useEffect(() => {
    reload();
  }, [stone.id]);

  const urls = useMemo(() => new Map(shots.map((s) => [s.id, URL.createObjectURL(s.blob)])), [shots]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  async function save() {
    if (!pending) return;
    await putShot({
      id: newId(),
      stoneId: stone.id,
      condition: "dry", // 湿潤の撮影は廃止。既存データとの互換のためフィールドは残す
      face: "", // 面の入力は廃止。既存データとの互換のためフィールドは残す
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
          {stone.id} / {stone.grade}等級
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
      <label className="check">
        <input type="checkbox" checked={hasCard} onChange={(e) => setHasCard(e.target.checked)} />
        基準カードあり
      </label>
    </div>
  );

  function onImportFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) setImportFiles(files);
  }

  if (importFiles) {
    return (
      <BulkImport
        stone={stone}
        files={importFiles}
        hasCard={hasCard}
        settings={settings}
        onDone={() => {
          setImportFiles(null);
          reload();
        }}
      />
    );
  }

  if (mode === "split") {
    return (
      <SplitStone
        stone={stone}
        shots={shots}
        onCancel={() => setMode("list")}
        onDone={(deleted) => {
          if (deleted) onBack();
          else {
            setMode("list");
            reload();
          }
        }}
      />
    );
  }

  if (mode === "camera") {
    return (
      <div className="screen camera-screen">
        {settings}
        <Camera
          hint={`${stone.id}（${stone.grade}等級）`}
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
        撮影する
      </button>
      <button className="wide import-button" onClick={() => importRef.current?.click()}>
        写真をまとめて取り込む
      </button>
      <input ref={importRef} type="file" accept="image/*" multiple hidden onChange={onImportFiles} />
      {shots.length >= 2 && (
        <button className="ghost wide" onClick={() => setMode("split")}>
          N枚ずつ別の石に分ける
        </button>
      )}
      <section>
        <h3>写真（{shots.length}枚）</h3>
        <div className="grid">
          {shots.map((s) => (
            <figure key={s.id}>
              <img src={urls.get(s.id)} alt={s.face || "写真"} loading="lazy" />
              <figcaption>
                {s.face}
                {/* 湿潤の撮影は廃止したが、以前に撮った湿潤写真は見分けられるようにする */}
                {s.condition === "wet" && <span className="wet-tag">{CONDITION_LABEL.wet}</span>}
                {judgeQuality(s.quality).some((w) => w.level === "bad") && <span className="flag">要確認</span>}
                <button className="x" onClick={() => remove(s.id)} aria-label="削除">削除</button>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
