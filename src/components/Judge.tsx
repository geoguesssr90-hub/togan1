import { useEffect, useState, type ReactNode } from "react";
import {
  analyzeBlob,
  describeModel,
  loadModelStatus,
  OUTDATED_MODEL_MESSAGE,
  SEGMENT_WARNING,
  type Analysis,
  type LoadedModel,
} from "../analyze";
import type { Captured } from "../capture";
import { predict, type Model } from "../model";
import { BatchJudge } from "./BatchJudge";
import { Camera } from "./Camera";

type Step = "capture" | "analyzing" | "result";

interface Shot {
  captured: Captured;
  analysis?: Analysis;
}

type Mode = "single" | "batch";
const MODE_LABEL: Record<Mode, string> = { single: "1個ずつ", batch: "まとめて" };

export function Judge({ onBack }: { onBack: () => void }) {
  const [loaded, setLoaded] = useState<LoadedModel | null | undefined>(undefined);
  const [outdated, setOutdated] = useState(false);
  const [mode, setMode] = useState<Mode>("single");

  useEffect(() => {
    loadModelStatus().then((r) => {
      setLoaded(r.loaded);
      setOutdated(r.outdated);
    });
  }, []);

  if (loaded === undefined) return <div className="screen"><p className="meta">モデルを読み込み中…</p></div>;

  if (loaded === null) {
    return (
      <div className="screen">
        <button className="back" onClick={onBack}>← 一覧</button>
        <h2>判定</h2>
        {outdated ? (
          <p className="warnings warn">{OUTDATED_MODEL_MESSAGE}。一覧画面の「学習し直す」を実行してください。</p>
        ) : (
          <p>まだ判定用のモデルがありません。一覧画面の「モデルを学習する」を先に実行してください。</p>
        )}
      </div>
    );
  }

  const { model, source } = loaded;
  const modelInfo = <p className="meta judge-model">使用モデル: {describeModel(model, source)}</p>;
  // 切り替えは各モードの最初の撮影画面にだけ出す（途中で切り替えて撮影済みの写真を失わないように）
  const modeSwitch = (
    <>
      <div className="seg judge-mode" role="radiogroup" aria-label="判定のしかた">
        {(["single", "batch"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} role="radio" aria-checked={mode === m}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {modelInfo}
    </>
  );

  return mode === "single" ? (
    <SingleJudge model={model} onBack={onBack} modeSwitch={modeSwitch} modelInfo={modelInfo} />
  ) : (
    <BatchJudge model={model} onBack={onBack} modeSwitch={modeSwitch} modelInfo={modelInfo} />
  );
}

interface ModeProps {
  model: Model;
  onBack: () => void;
  modeSwitch: ReactNode;
  modelInfo: ReactNode; // どちらのモデルで判定したか（結果画面に出す）
}

/** 1個ずつ: 乾燥写真を1枚撮る → 結果 */
function SingleJudge({ model, onBack, modeSwitch, modelInfo }: ModeProps) {
  const [step, setStep] = useState<Step>("capture");
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.captured.previewUrl);
    },
    [shot],
  );

  async function onCaptured(c: Captured) {
    setShot({ captured: c });
    setStep("analyzing");
    setError(null);
    try {
      const analysis = await analyzeBlob(c.blob, true);
      setShot({ captured: c, analysis });
      setStep("result");
    } catch {
      setError("画像を解析できませんでした。撮り直してください。");
      setStep("capture");
    }
  }

  function restart() {
    setShot(null);
    setStep("capture");
  }

  if (step === "capture") {
    return (
      <div className="screen camera-screen">
        {modeSwitch}
        <div className="judge-steps" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <span className="on">1 撮影</span>
          <span>2 結果</span>
        </div>
        {error && <p className="warnings bad">{error}</p>}
        <Camera
          hint="乾いた石を、石と違う色の無地の背景の中央に置いて撮影してください"
          onCaptured={onCaptured}
          onCancel={onBack}
        />
      </div>
    );
  }

  if (step === "analyzing" || !shot?.analysis) {
    return <div className="screen"><p className="meta">解析中…</p></div>;
  }

  // 石が見つからないときは判定しない（背景や空の画像を判定しても意味がない）
  if (shot.analysis.status === "none") {
    return (
      <div className="screen">
        <button className="back" onClick={onBack}>← 一覧</button>
        <h2>石が見つかりませんでした</h2>
        <p className="warnings warn">{SEGMENT_WARNING}</p>
        <img className="mask-one" src={shot.analysis.maskPreview} alt="撮影した写真" />
        <button className="primary wide" onClick={restart}>撮り直す</button>
      </div>
    );
  }

  const f = shot.analysis.features;
  const tooLarge = shot.analysis.status === "tooLarge";
  const probs = predict(model, f);
  const top = probs.reduce((p, q) => (q.prob > p.prob ? q : p));

  const rows: [string, string][] = [
    ["白さ（L*）", f.L.toFixed(1)],
    ["黄み（b*）", f.b.toFixed(1)],
    ["赤み（a*）", f.a.toFixed(1)],
    ["ムラ（L*のばらつき）", f.Lstd.toFixed(1)],
    ["暗い斑点の割合", pct(f.spotRatio)],
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

      {tooLarge && <p className="warnings warn">{SEGMENT_WARNING}（石として認識した範囲が画面の30%以上あります）</p>}

      <h3>判定の根拠</h3>
      <table className="summary">
        <thead><tr><th>項目</th><th>値</th></tr></thead>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody>
      </table>

      <h3>石として認識した範囲</h3>
      <img className="mask-one" src={shot.analysis.maskPreview} alt="石として認識した範囲" />
      <p className="tip">
        色の付いた部分だけを使って判定しています。影や背景に色が付いている場合は、撮り方を見直してください。
      </p>

      {modelInfo}

      <button className="primary wide" onClick={restart}>別の石を判定する</button>
    </div>
  );
}

function pct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
