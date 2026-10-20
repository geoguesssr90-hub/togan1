import { useEffect, useRef, useState, type ReactNode } from "react";
import { deleteShot, putShot, putStone } from "../db";
import { captureFromFile, newId } from "../capture";
import { judgeQuality, type QualityWarning } from "../quality";
import type { Stone } from "../types";

interface Props {
  stone: Stone;
  files: File[];
  hasCard: boolean;
  settings: ReactNode; // 基準カードの入力欄（StoneDetail と共通）
  onDone: () => void;
}

/** 選んだ写真をすべて1つの石に取り込む（確認 → ImportRunner） */
export function BulkImport({ stone, files, hasCard, settings, onDone }: Props) {
  const [started, setStarted] = useState(false);

  if (started) {
    return <ImportRunner items={files.map((file) => ({ file, stoneId: stone.id }))} hasCard={hasCard} onDone={onDone} />;
  }

  return (
    <div className="screen">
      <h2>写真をまとめて取り込む</h2>
      <p className="meta">
        {stone.id} / {stone.grade}等級 / {files.length}枚を選択
      </p>
      <p className="tip">選んだ写真すべてに、次の基準カードの有無を割り当てます。</p>
      {settings}
      <div className="row">
        <button className="ghost" onClick={onDone}>キャンセル</button>
        <button className="primary" onClick={() => setStarted(true)}>取り込む</button>
      </div>
    </div>
  );
}

export interface ImportItem {
  file: File;
  stoneId: string;
}

interface RunnerProps {
  items: ImportItem[];
  hasCard: boolean;
  /** 新しく作る石。その石の写真を初めて保存する直前に登録する（中止しても空の石を残さない） */
  newStones?: Stone[];
  onDone: () => void;
}

interface Warned {
  shotId: string;
  stoneId: string;
  name: string;
  previewUrl: string;
  warnings: QualityWarning[];
}

/** 写真を1枚ずつ順番に縮小・画質チェックして保存する。表示したらすぐに始める */
export function ImportRunner({ items, hasCard, newStones = [], onDone }: RunnerProps) {
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [processed, setProcessed] = useState(0);
  const [imported, setImported] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [warned, setWarned] = useState<Warned[]>([]);
  const [deleted, setDeleted] = useState(0);
  const cancelRef = useRef(false);
  const startedRef = useRef(false);
  const urlsRef = useRef<string[]>([]);
  const multiStone = new Set(items.map((it) => it.stoneId)).size > 1;

  useEffect(() => {
    cancelRef.current = false; // StrictMode の再マウントでも中止扱いにならないように
    if (!startedRef.current) {
      startedRef.current = true; // StrictMode で2回走らないように
      run();
    }
    return () => {
      cancelRef.current = true;
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  async function run() {
    const pendingStones = new Map(newStones.map((s) => [s.id, s]));
    // スマホのメモリ不足を避けるため並列にせず1枚ずつ処理する
    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      const { file, stoneId } = items[i];
      try {
        const c = await captureFromFile(file);
        const stone = pendingStones.get(stoneId);
        if (stone) {
          await putStone(stone);
          pendingStones.delete(stoneId);
        }
        const shotId = newId();
        await putShot({
          id: shotId,
          stoneId,
          condition: "dry", // 湿潤の撮影は廃止。既存データとの互換のためフィールドは残す
          face: "", // 面の入力は廃止。既存データとの互換のためフィールドは残す
          hasReferenceCard: hasCard,
          width: c.width,
          height: c.height,
          quality: c.quality,
          createdAt: file.lastModified || Date.now(), // 撮影日時として扱う
          blob: c.blob,
        });
        setImported((n) => n + 1);
        const warnings = judgeQuality(c.quality);
        if (warnings.length) {
          urlsRef.current.push(c.previewUrl);
          setWarned((w) => [...w, { shotId, stoneId, name: file.name, previewUrl: c.previewUrl, warnings }]);
        } else {
          URL.revokeObjectURL(c.previewUrl);
        }
      } catch {
        setFailed((f) => [...f, file.name]);
      }
      setProcessed(i + 1);
    }
    setPhase("done");
  }

  async function remove(item: Warned) {
    if (!confirm("この写真を削除しますか？")) return;
    await deleteShot(item.shotId);
    setWarned((w) => w.filter((x) => x.shotId !== item.shotId));
    setDeleted((n) => n + 1);
  }

  if (phase === "running") {
    return (
      <div className="screen">
        <h2>取り込み中</h2>
        <p className="progress-count">
          {processed} / {items.length} 枚
        </p>
        <progress className="progress" max={items.length} value={processed} />
        <p className="tip">画面を閉じずにお待ちください。</p>
        <button className="ghost wide" onClick={() => (cancelRef.current = true)}>中止</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>取り込み結果</h2>
      <p>
        {imported}枚を取り込みました
        {processed < items.length && `（中止: 残り${items.length - processed}枚は未処理）`}
        {deleted > 0 && `。うち${deleted}枚を削除`}
      </p>
      {failed.length > 0 && (
        <>
          <h3>読み込めなかった写真（{failed.length}枚）</h3>
          <ul className="warnings">
            {failed.map((name, i) => <li key={i} className="bad">{name}</li>)}
          </ul>
        </>
      )}
      <h3>画質の警告（{warned.length}枚）</h3>
      {warned.length === 0 ? (
        <p className="ok">警告の出た写真はありません</p>
      ) : (
        <ul className="import-warned">
          {warned.map((w) => (
            <li key={w.shotId} className="card">
              <img src={w.previewUrl} alt={w.name} />
              <div>
                <p className="meta">{multiStone ? `${w.stoneId} / ${w.name}` : w.name}</p>
                <ul className="warnings">
                  {w.warnings.map((x) => <li key={x.message} className={x.level}>{x.message}</li>)}
                </ul>
              </div>
              <button className="x" onClick={() => remove(w)} aria-label={`${w.name}を削除`}>削除</button>
            </li>
          ))}
        </ul>
      )}
      <button className="primary wide" onClick={onDone}>完了</button>
    </div>
  );
}
