import { useEffect, useRef, useState, type ReactNode } from "react";
import { analyzeBatchBlob, type BatchAnalysis } from "../analyze";
import { judgeStones, pairSides, type PairedRow, type StoneJudgement } from "../batch";
import type { Captured } from "../capture";
import type { Box } from "../features";
import type { Model } from "../model";
import { Camera } from "./Camera";

/** 撮影の順番: 表 → その場で裏返して 裏（省略可）→ 結果 */
type PhotoKey = "front" | "back";
type Step = PhotoKey | "analyzing" | "result";

const SIDE_NAME: Record<PhotoKey, string> = { front: "表", back: "裏" };

interface Side {
  name: string;
  photo: Captured;
  analysis: BatchAnalysis;
  judged: StoneJudgement[];
}

interface Result {
  front: Side;
  back: Side | null; // 裏を撮らなかった場合 null
  rows: PairedRow[] | null; // 表と裏で石の数が合わなければ null
  warnings: string[];
}

interface Props {
  model: Model;
  onBack: () => void;
  modeSwitch: ReactNode;
}

/** まとめて判定: 暗い背景に並べた複数の石を1枚で撮り、1個ずつ切り出して判定する */
export function BatchJudge({ model, onBack, modeSwitch }: Props) {
  const [step, setStep] = useState<Step>("front");
  const [front, setFront] = useState<Captured | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function analyze(f: Captured, b: Captured | null) {
    setStep("analyzing");
    setError(null);
    try {
      // スマホのメモリを考えて1枚ずつ解析する
      const fa = await analyzeBatchBlob(f.blob);
      const ba = b ? await analyzeBatchBlob(b.blob) : null;
      setResult(buildResult(model, f, fa, b, ba));
      setStep("result");
    } catch {
      setError("画像を解析できませんでした。撮り直してください。");
      restart();
    }
  }

  function onCaptured(key: PhotoKey, c: Captured) {
    urlsRef.current.push(c.previewUrl);
    if (key === "front") {
      setFront(c);
      setStep("back");
    } else analyze(front!, c);
  }

  function restart() {
    setFront(null);
    setResult(null);
    setStep("front");
  }

  if (step === "analyzing") return <div className="screen"><p className="meta">石を切り出して判定中…</p></div>;

  if (step === "result" && result) return <BatchResult result={result} onBack={onBack} onRestart={restart} />;

  const key = step as PhotoKey;
  const isFront = key === "front";
  return (
    <div className="screen camera-screen">
      {isFront && modeSwitch}
      <div className="judge-steps">
        <span className={isFront ? "on" : "done"}>1 表</span>
        <span className={isFront ? "" : "on"}>2 裏</span>
        <span>3 結果</span>
      </div>
      {error && <p className="warnings bad">{error}</p>}
      <Camera
        key={key}
        showGuide={false}
        hint={
          isFront
            ? "暗い背景に、石どうしが触れないよう隙間をあけて並べ、全体を撮影してください（基準カードは写さない）"
            : "石をその場で裏返し、同じ位置から撮影してください"
        }
        onCaptured={(c) => onCaptured(key, c)}
        onCancel={() => (isFront ? onBack() : setStep("front"))}
      />
      {!isFront && (
        <button className="ghost wide skip-back" onClick={() => analyze(front!, null)}>
          裏は撮らない
        </button>
      )}
    </div>
  );
}

function buildResult(model: Model, f: Captured, fa: BatchAnalysis, b: Captured | null, ba: BatchAnalysis | null): Result {
  const warnings: string[] = [];
  const side = (key: PhotoKey, photo: Captured, analysis: BatchAnalysis): Side => {
    const name = SIDE_NAME[key];
    if (analysis.stones.length === 0) warnings.push(`${name}の写真で石が見つかりませんでした。暗い背景の上で撮り直してください。`);
    const merged = analysis.stones.filter((s) => s.maybeMerged).map((s) => `${s.index}番`);
    if (merged.length)
      warnings.push(`${name}の ${merged.join("・")} は、石どうしがくっついている可能性があります。隙間をあけて撮り直してください。`);
    return { name, photo, analysis, judged: judgeStones(model, analysis.stones) };
  };
  const front = side("front", f, fa);
  const back = b && ba ? side("back", b, ba) : null;
  const rows = pairSides(front.judged, back?.judged ?? null);
  if (!rows && back)
    warnings.push(
      `表（${front.judged.length}個）と裏（${back.judged.length}個）で石の数が合わないため、表と裏を対応させられませんでした。別々に表示します。`,
    );
  return { front, back, rows, warnings };
}

function fmt(j: StoneJudgement | null) {
  return j ? `${j.grade}等級（${Math.round(j.prob * 100)}%）` : "—";
}

function BatchResult({
  result,
  onBack,
  onRestart,
}: {
  result: Result;
  onBack: () => void;
  onRestart: () => void;
}) {
  const { front, back, rows, warnings } = result;

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>← 最初の画面</button>
      <p className="meta">まとめて判定（試作モデル）</p>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => <li key={w} className="warn">{w}</li>)}
        </ul>
      )}

      {[front, back].map((s) => s && <SideOverlay key={s.name} side={s} />)}

      {rows ? (
        rows.length > 0 && (
          <table className="summary batch-table">
            <thead><tr><th>番号</th><th>表</th><th>裏</th><th>総合</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.index}>
                  <td>{r.index}</td>
                  <td>{fmt(r.front)}</td>
                  <td>{fmt(r.back)}</td>
                  <td className="overall"><span className="seal-inline">{r.overall}等級</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        [front, back].map(
          (s) =>
            s &&
            s.judged.length > 0 && (
              <section key={s.name}>
                <h3>{s.name}</h3>
                <table className="summary batch-table">
                  <thead><tr><th>番号</th><th>等級（確率）</th></tr></thead>
                  <tbody>
                    {s.judged.map((j) => <tr key={j.index}><td>{j.index}</td><td>{fmt(j)}</td></tr>)}
                  </tbody>
                </table>
              </section>
            ),
        )
      )}

      <p className="tip">
        総合は表と裏のうち悪い方の等級です。番号は写真の上の行から、各行を左から右の順です。
      </p>

      <div className="judge-end">
        <button className="primary wide" onClick={onRestart}>もう一度試す</button>
        <button className="ghost wide" onClick={onBack}>最初の画面に戻る</button>
      </div>
    </div>
  );
}

interface Mark {
  box: Box;
  text: string;
  warn: boolean;
}

/** 写真に、各石の枠・番号・判定等級を重ねて描く */
function SideOverlay({ side }: { side: Side }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = side.analysis;
  const marks: Mark[] = side.judged.map((j) => ({ box: j.box, text: `${j.index}  ${j.grade}等級`, warn: j.maybeMerged }));

  useEffect(() => {
    let cancelled = false;
    createImageBitmap(side.photo.blob).then((bmp) => {
      const c = ref.current;
      if (cancelled || !c) return bmp.close();
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0, width, height);
      bmp.close();
      const fs = Math.max(14, Math.round(width / 36));
      ctx.font = `600 ${fs}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2, fs / 8);
      for (const m of marks) {
        const color = m.warn ? "#9a6a00" : "#1f3a6b"; // くっつきの可能性は警告の色、それ以外は藍
        ctx.strokeStyle = color;
        ctx.strokeRect(m.box.x0, m.box.y0, m.box.x1 - m.box.x0, m.box.y1 - m.box.y0);
        const tw = ctx.measureText(m.text).width + fs * 0.6;
        const th = fs * 1.4;
        const tx = Math.min(m.box.x0, width - tw);
        const ty = m.box.y0 >= th ? m.box.y0 - th : m.box.y0;
        ctx.fillStyle = color;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = "#fff";
        ctx.fillText(m.text, tx + fs * 0.3, ty + fs * 0.2);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [side]);

  return (
    <figure className="batch-figure">
      <canvas ref={ref} aria-label={`${side.name}の判定結果`} />
      <figcaption>{side.name}</figcaption>
    </figure>
  );
}
