import { useEffect, useState } from "react";
import { clearLocalModel, collectSamples, downloadModel, loadModel, saveModel } from "../analyze";
import { trainModel, usableStones, type Model } from "../model";

/** 一覧画面に置く「学習」「判定」パネル */
export function ModelPanel({ onJudge }: { onJudge: () => void }) {
  const [model, setModel] = useState<Model | null>(null);
  const [source, setSource] = useState<"local" | "bundled" | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModel().then((r) => {
      setModel(r?.model ?? null);
      setSource(r?.source ?? null);
    });
  }, []);

  async function train() {
    setError(null);
    setProgress("写真を解析中…");
    try {
      const samples = await collectSamples((d, t) => setProgress(`写真を解析中… ${d} / ${t} 枚`));
      const ok = usableStones(samples);
      setProgress(`学習中…（石 ${ok.length} 個）`);
      await new Promise((r) => setTimeout(r, 30)); // 表示を更新させる
      const m = trainModel(samples);
      saveModel(m);
      setModel(m);
      setSource("local");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    if (!confirm("この端末で学習したモデルを削除しますか？")) return;
    clearLocalModel();
    loadModel().then((r) => {
      setModel(r?.model ?? null);
      setSource(r?.source ?? null);
    });
  }

  return (
    <section className="card model-panel">
      <div className="model-head">
        <h3>判定モデル</h3>
        {model ? (
          <span className="meta">
            {source === "bundled" ? "公開版" : "この端末で学習"}・石 {model.nStones} 個・{model.grades.map((g) => g + "等級").join(" / ")}
            {model.cvAccuracy != null && `・検証正解率 ${Math.round(model.cvAccuracy * 100)}%`}
          </span>
        ) : (
          <span className="meta">未学習</span>
        )}
      </div>
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
