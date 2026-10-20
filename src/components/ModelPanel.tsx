import { useEffect, useState } from "react";
import {
  clearLocalModel,
  collectSamples,
  downloadModel,
  loadModelStatus,
  MODEL_SOURCE_LABEL,
  OUTDATED_MODEL_MESSAGE,
  saveModel,
  type ModelSource,
} from "../analyze";
import { trainModel, usableStones, type Model } from "../model";

/** 一覧画面に置く「学習」「判定」パネル */
export function ModelPanel({ onJudge }: { onJudge: () => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [source, setSource] = useState<ModelSource | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadModelStatus().then(({ loaded, outdated }) => {
      setModel(loaded?.model ?? null);
      setSource(loaded?.source ?? null);
      setOutdated(outdated);
    });
  }, []);

  async function train() {
    setError(null);
    setNotice(null);
    setProgress("写真を解析中…");
    try {
      const { samples, skipped } = await collectSamples((d, t) => setProgress(`写真を解析中… ${d} / ${t} 枚`));
      const ok = usableStones(samples);
      setProgress(`学習中…（石 ${ok.length} 個）`);
      await new Promise((r) => setTimeout(r, 30)); // 表示を更新させる
      const m = trainModel(samples);
      saveModel(m);
      setModel(m);
      setSource("local");
      setOutdated(false);
      if (skipped > 0) setNotice(`石を切り出せなかった写真 ${skipped} 枚は、学習に使っていません。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    if (!confirm("この端末で学習したモデルを削除しますか？公開版のモデルがあれば、以後はそれで判定します。")) return;
    clearLocalModel();
    setNotice(null);
    loadModelStatus().then(({ loaded, outdated }) => {
      setModel(loaded?.model ?? null);
      setSource(loaded?.source ?? null);
      setOutdated(outdated);
    });
  }

  return (
    <section className="card model-panel">
      <div className="model-head">
        <h3>判定モデル</h3>
        {model ? (
          <span className="meta">
            {MODEL_SOURCE_LABEL[source ?? "local"]}・石 {model.nStones} 個・{model.grades.map((g) => g + "等級").join(" / ")}
            {model.cvAccuracy != null && `・検証正解率 ${Math.round(model.cvAccuracy * 100)}%`}
          </span>
        ) : (
          <span className="meta">未学習</span>
        )}
      </div>
      {!model && outdated && <p className="warnings warn">{OUTDATED_MODEL_MESSAGE}</p>}
      {notice && <p className="meta">{notice}</p>}
      {progress && <p className="meta">{progress}</p>}
      {error && <p className="warnings bad">{error}</p>}
      <div className="row">
        <button className="ghost" onClick={train} disabled={!!progress}>
          {model ? "学習し直す" : "モデルを学習する"}
        </button>
        <button className="primary" onClick={onJudge} disabled={!model || !!progress}>
          判定する
        </button>
      </div>
      {model && (
        <div className="row model-sub">
          <button className="x" onClick={() => downloadModel(model)}>モデルを書き出す</button>
          {source === "local" && <button className="x" onClick={reset}>端末のモデルを削除</button>}
        </div>
      )}
    </section>
  );
}
