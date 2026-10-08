import { useEffect, useRef, useState, type ReactNode } from "react";
import { deleteShot, putShot } from "../db";
import { captureFromFile, newId } from "../capture";
import { judgeQuality, type QualityWarning } from "../quality";
import { CONDITION_LABEL, type Condition, type Stone } from "../types";

interface Props {
  stone: Stone;
  files: File[];
  condition: Condition;
  face: string;
  hasCard: boolean;
  settings: ReactNode; // 撮影条件・面・基準カードの入力欄（StoneDetail と共通）
  onDone: () => void;
}

interface Warned {
  shotId: string;
  name: string;
  previewUrl: string;
  warnings: QualityWarning[];
}

/** 選んだ写真に同じ撮影設定を割り当て、1枚ずつ順番に画質チェックして保存する */
export function BulkImport({ stone, files, condition, face, hasCard, settings, onDone }: Props) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [processed, setProcessed] = useState(0);
  const [imported, setImported] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [warned, setWarned] = useState<Warned[]>([]);
  const [deleted, setDeleted] = useState(0);
  const cancelRef = useRef(false);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    cancelRef.current = false; // StrictMode の再マウントでも中止扱いにならないように
    return () => {
      cancelRef.current = true;
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  async function run() {
    setPhase("running");
    // スマホのメモリ不足を避けるため並列にせず1枚ずつ処理する
    for (let i = 0; i < files.length; i++) {
      if (cancelRef.current) break;
      const file = files[i];
      try {
        const c = await captureFromFile(file);
        const shotId = newId();
        await putShot({
          id: shotId,
          stoneId: stone.id,
          condition,
          face,
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
          setWarned((w) => [...w, { shotId, name: file.name, previewUrl: c.previewUrl, warnings }]);
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

  if (phase === "confirm") {
    return (
      <div className="screen">
        <h2>写真をまとめて取り込む</h2>
        <p className="meta">
          {stone.id} / {stone.grade}等級 / {files.length}枚を選択
        </p>
        <p className="tip">選んだ写真すべてに、次の撮影条件・面・基準カードの有無を割り当てます。</p>
        {settings}
        <div className="row">
          <button className="ghost" onClick={onDone}>キャンセル</button>
          <button className="primary" onClick={run}>
            {CONDITION_LABEL[condition]}・{face}として取り込む
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div className="screen">
        <h2>取り込み中</h2>
        <p className="progress-count">
          {processed} / {files.length} 枚
        </p>
        <progress className="progress" max={files.length} value={processed} />
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
        {processed < files.length && `（中止: 残り${files.length - processed}枚は未処理）`}
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
                <p className="meta">{w.name}</p>
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
