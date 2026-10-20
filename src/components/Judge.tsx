import { useEffect, useState } from "react";
import { analyzeBlob, loadModel, type Analysis } from "../analyze";
import type { Captured } from "../capture";
import { predict, type Model } from "../model";
import { Camera } from "./Camera";

type Step = "dry" | "wet" | "analyzing" | "result";

interface Shot {
  captured: Captured;
  analysis?: Analysis;
}

export function Judge({ onBack }: { onBack: () => void }) {
  const [model, setModel] = useState<Model | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("dry");
  const [dry, setDry] = useState<Shot | null>(null);
  const [wet, setWet] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModel().then((r) => setModel(r?.model ?? null));
  }, []);

  useEffect(
    () => () => {
      if (dry) URL.revokeObjectURL(dry.captured.previewUrl);
      if (wet) URL.revokeObjectURL(wet.captured.previewUrl);
    },
    [dry, wet],
  );

  async function onWet(c: Captured) {
    const w: Shot = { captured: c };
    setWet(w);
    setStep("analyzing");
    setError(null);
    try {
      const [da, wa] = await Promise.all([analyzeBlob(dry!.captured.blob, true), analyzeBlob(c.blob, true)]);
      setDry({ ...dry!, analysis: da });
      setWet({ ...w, analysis: wa });
      setStep("result");
    } catch {
      setError("画像を解析できませんでした。撮り直してください。");
      setStep("dry");
    }
  }

  function restart() {
    setDry(null);
    setWet(null);
    setStep("dry");
  }

  if (model === undefined) return <div className="screen"><p className="meta">モデルを読み込み中…</p></div>;

  if (model === null) {
    return (
      <div className="screen">
        <button className="back" onClick={onBack}>← 一覧</button>
        <h2>判定</h2>
        <p>まだ判定用のモデルがありません。一覧画面の「モデルを学習する」を先に実行してください。</p>
      </div>
    );
  }

  if (step === "dry" || step === "wet") {
    const isDry = step === "dry";
    return (
      <div className="screen camera-screen">
        <div className="judge-steps">
          <span className={isDry ? "on" : "done"}>1 乾燥</span>
          <span className={!isDry ? "on" : ""}>2 湿潤</span>
          <span>3 結果</span>
        </div>
        {error && <p className="warnings bad">{error}</p>}
        <Camera
          hint={isDry ? "乾いた状態の石を撮影してください" : "同じ面を水で濡らして撮影してください"}
          onCaptured={(c) => {
            if (isDry) {
              setDry({ captured: c });
              setStep("wet");
            } else onWet(c);
          }}
          onCancel={() => (isDry ? onBack() : setStep("dry"))}
        />
      </div>
    );
  }

  if (step === "analyzing" || !dry?.analysis || !wet?.analysis) {
    return <div className="screen"><p className="meta">解析中…</p></div>;
  }

  const df = dry.analysis.features;
  const wf = wet.analysis.features;
  const lowArea = df.areaRatio < 0.03 || wf.areaRatio < 0.03;
  const probs = predict(model, df, wf);
  const top = probs.reduce((p, q) => (q.prob > p.prob ? q : p));

  const rows: [string, string, string][] = [
    ["白さ（L*）", df.L.toFixed(1), wf.L.toFixed(1)],
    ["黄み（b*）", df.b.toFixed(1), wf.b.toFixed(1)],
    ["赤み（a*）", df.a.toFixed(1), wf.a.toFixed(1)],
    ["ムラ（L*のばらつき）", df.Lstd.toFixed(1), wf.Lstd.toFixed(1)],
    ["暗い斑点の割合", pct(df.spotRatio), pct(wf.spotRatio)],
  ];

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>← 一覧</button>
      <p className="meta">判定結果（試作モデル）</p>
      <h2 className="judge-top">
        {top.grade}<span>等級</span>
        <small>{Math.round(top.prob * 100)}%</small>
      </h2>

      <div className="probs">
        {probs.map((p) => (
          <div key={p.grade} className={"prob" + (p === top ? " top" : "")}>
            <span className="prob-label">{p.grade}等級</span>
            <span className="prob-bar"><span style={{ width: `${Math.max(1, p.prob * 100)}%` }} /></span>
            <span className="prob-val">{Math.round(p.prob * 100)}%</span>
          </div>
        ))}
      </div>

      {lowArea && <p className="warnings warn">石を十分に検出できていません。石を画面の枠いっぱいに写してください。</p>}

      <h3>判定の根拠</h3>
      <table className="summary">
        <thead><tr><th>項目</th><th>乾燥</th><th>湿潤</th></tr></thead>
        <tbody>
          {rows.map(([k, a, b]) => <tr key={k}><td>{k}</td><td>{a}</td><td>{b}</td></tr>)}
          <tr className="emph"><td>濡らした時の明度変化</td><td colSpan={2}>{signed(wf.L - df.L)}</td></tr>
          <tr className="emph"><td>濡らした時の黄み変化（褐色化）</td><td colSpan={2}>{signed(wf.b - df.b)}</td></tr>
        </tbody>
      </table>

      <h3>石として認識した範囲</h3>
      <div className="mask-pair">
        <figure><img src={dry.analysis.maskPreview} alt="乾燥の認識範囲" /><figcaption>乾燥</figcaption></figure>
        <figure><img src={wet.analysis.maskPreview} alt="湿潤の認識範囲" /><figcaption>湿潤</figcaption></figure>
      </div>
      <p className="tip">
        色の付いた部分だけを使って判定しています。影や背景に色が付いている場合は、撮り方を見直してください。
      </p>

      <p className="tip">
        学習: 石 {model.nStones} 個 / {new Date(model.trainedAt).toLocaleString("ja-JP")}
        {model.cvAccuracy != null && ` / 検証正解率 ${Math.round(model.cvAccuracy * 100)}%`}
      </p>

      <button className="primary wide" onClick={restart}>別の石を判定する</button>
    </div>
  );
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
function signed(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}
