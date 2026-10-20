import { useEffect, useRef, useState, type ReactNode } from "react";
import { analyzeBatchBlob, type BatchAnalysis } from "../analyze";
import { judgeSide, worseGrade, type StoneJudgement } from "../batch";
import type { Captured } from "../capture";
import type { Box } from "../features";
import type { Model } from "../model";
import { Camera } from "./Camera";

/**
 * 撮影の順番。濡らした石を乾かさずに済むよう、乾燥を先に撮ってから濡らす:
 * 表・乾燥 → 裏返して 裏・乾燥 → 濡らして 裏・湿潤 → 裏返して濡らし 表・湿潤
 */
type PhotoKey = "frontDry" | "backDry" | "backWet" | "frontWet";
type Step = PhotoKey | "analyzing" | "result";

const STEP_LABEL: Record<PhotoKey, string> = { frontDry: "表 乾燥", backDry: "裏 乾燥", backWet: "裏 湿潤", frontWet: "表 湿潤" };
const PHOTO_LABEL: Record<PhotoKey, string> = { frontDry: "表（乾燥）", backDry: "裏（乾燥）", backWet: "裏（湿潤）", frontWet: "表（湿潤）" };
const ORDER: PhotoKey[] = ["frontDry", "backDry", "backWet", "frontWet"];

interface Side {
  name: "表" | "裏";
  photo: Captured; // 乾燥写真（結果の表示に使う）
  dry: BatchAnalysis;
  wet: BatchAnalysis;
  judged: StoneJudgement[] | null; // 乾燥と湿潤で石の数が合わなければ null
}

interface Result {
  front: Side;
  back: Side | null; // 裏を撮らなかった場合 null
  warnings: string[];
}

interface Props {
  model: Model;
  onBack: () => void;
  modeSwitch: ReactNode;
}

/** まとめて判定: 暗い背景に並べた複数の石を1枚で撮り、1個ずつ切り出して判定する */
export function BatchJudge({ model, onBack, modeSwitch }: Props) {
  const [step, setStep] = useState<Step>("frontDry");
  const [photos, setPhotos] = useState<Partial<Record<PhotoKey, Captured>>>({});
  const [skipBack, setSkipBack] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function nextStep(key: PhotoKey, skip: boolean): PhotoKey | null {
    const rest = ORDER.slice(ORDER.indexOf(key) + 1).filter((k) => !(skip && (k === "backDry" || k === "backWet")));
    return rest[0] ?? null;
  }

  function prevStep(key: PhotoKey): PhotoKey | null {
    const before = ORDER.slice(0, ORDER.indexOf(key)).filter((k) => !(skipBack && (k === "backDry" || k === "backWet")));
    return before[before.length - 1] ?? null;
  }

  function onCaptured(key: PhotoKey, c: Captured) {
    urlsRef.current.push(c.previewUrl);
    const next = { ...photos, [key]: c };
    setPhotos(next);
    const n = nextStep(key, skipBack);
    if (n) setStep(n);
    else analyze(next);
  }

  async function analyze(p: Partial<Record<PhotoKey, Captured>>) {
    setStep("analyzing");
    setError(null);
    try {
      // スマホのメモリを考えて1枚ずつ解析する
      const a: Partial<Record<PhotoKey, BatchAnalysis>> = {};
      for (const k of ORDER) if (p[k]) a[k] = await analyzeBatchBlob(p[k]!.blob);
      setResult(buildResult(model, p, a));
      setStep("result");
    } catch {
      setError("画像を解析できませんでした。撮り直してください。");
      restart();
    }
  }

  function restart() {
    setPhotos({});
    setSkipBack(false);
    setResult(null);
    setStep("frontDry");
  }

  if (step === "analyzing") return <div className="screen"><p className="meta">石を切り出して判定中…</p></div>;

  if (step === "result" && result) return <BatchResult result={result} model={model} onBack={onBack} onRestart={restart} />;

  const key = step as PhotoKey;
  const hint: Record<PhotoKey, string> = {
    frontDry: "乾いた石を暗い背景に、触れないよう隙間をあけて並べ、全体を撮影してください（基準カードは写さない）",
    backDry: "石をその場で裏返し、乾いた状態で撮影してください",
    backWet: "石を動かさずに水で濡らし、同じ位置から撮影してください",
    frontWet: skipBack
      ? "石を動かさずに水で濡らし、同じ位置から撮影してください"
      : "石をその場で裏返して表を上にし、水で濡らして撮影してください",
  };
  const steps = ORDER.filter((k) => !(skipBack && (k === "backDry" || k === "backWet")));

  return (
    <div className="screen camera-screen">
      {key === "frontDry" && modeSwitch}
      <div className="judge-steps" style={{ gridTemplateColumns: `repeat(${steps.length + 1}, 1fr)` }}>
        {steps.map((k) => (
          <span key={k} className={k === key ? "on" : photos[k] ? "done" : ""}>{STEP_LABEL[k]}</span>
        ))}
        <span>結果</span>
      </div>
      {error && <p className="warnings bad">{error}</p>}
      <Camera
        key={key}
        showGuide={false}
        hint={hint[key]}
        onCaptured={(c) => onCaptured(key, c)}
        onCancel={() => {
          const p = prevStep(key);
          if (p) setStep(p);
          else onBack();
        }}
      />
      {key === "backDry" && (
        <button
          className="ghost wide skip-back"
          onClick={() => {
            setSkipBack(true);
            setStep("frontWet");
          }}
        >
          裏は撮らない
        </button>
      )}
    </div>
  );
}

function buildResult(
  model: Model,
  p: Partial<Record<PhotoKey, Captured>>,
  a: Partial<Record<PhotoKey, BatchAnalysis>>,
): Result {
  const warnings: string[] = [];
  for (const k of ORDER) {
    const an = a[k];
    if (!an) continue;
    if (an.stones.length === 0) warnings.push(`${PHOTO_LABEL[k]}の写真で石が見つかりませんでした。暗い背景の上で撮り直してください。`);
    const merged = an.stones.filter((s) => s.maybeMerged).map((s) => `${s.index}番`);
    if (merged.length)
      warnings.push(`${PHOTO_LABEL[k]}の ${merged.join("・")} は、石どうしがくっついている可能性があります。隙間をあけて撮り直してください。`);
  }

  const side = (name: "表" | "裏", dk: PhotoKey, wk: PhotoKey): Side | null => {
    const photo = p[dk], dry = a[dk], wet = a[wk];
    if (!photo || !dry || !wet) return null;
    const judged = judgeSide(model, dry.stones, wet.stones);
    if (!judged && dry.stones.length > 0 && wet.stones.length > 0)
      warnings.push(
        `${name}の乾燥（${dry.stones.length}個）と湿潤（${wet.stones.length}個）で石の数が合わないため、${name}は判定できませんでした。`,
      );
    return { name, photo, dry, wet, judged };
  };
  const front = side("表", "frontDry", "frontWet")!;
  const back = side("裏", "backDry", "backWet");
  if (front.judged && back?.judged && front.judged.length !== back.judged.length)
    warnings.push(
      `表（${front.judged.length}個）と裏（${back.judged.length}個）で石の数が合わないため、表と裏を対応させられませんでした。別々に表示します。`,
    );
  return { front, back, warnings };
}

function fmt(j: StoneJudgement | undefined) {
  return j ? `${j.grade}等級（${Math.round(j.prob * 100)}%）` : "—";
}

function BatchResult({ result, model, onBack, onRestart }: { result: Result; model: Model; onBack: () => void; onRestart: () => void }) {
  const { front, back, warnings } = result;
  const fj = front.judged, bj = back?.judged ?? null;
  // 表と裏を番号で対応させられるか（裏を撮っていなければ表だけで総合を出す）
  const matched = !!fj && (!back || (!!bj && bj.length === fj.length));

  return (
    <div className="screen">
      <button className="back" onClick={onBack}>← 一覧</button>
      <p className="meta">まとめて判定（試作モデル）</p>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => <li key={w} className="warn">{w}</li>)}
        </ul>
      )}

      {[front, back].map((s) => s && <SideOverlay key={s.name} side={s} />)}

      {matched ? (
        <table className="summary batch-table">
          <thead><tr><th>番号</th><th>表</th><th>裏</th><th>総合</th></tr></thead>
          <tbody>
            {fj!.map((f, k) => {
              const b = bj?.[k];
              return (
                <tr key={f.index}>
                  <td>{f.index}</td>
                  <td>{fmt(f)}</td>
                  <td>{fmt(b)}</td>
                  <td className="overall">{b ? worseGrade(f.grade, b.grade) : f.grade}等級</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        [front, back].map(
          (s) =>
            s?.judged && (
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
      <p className="tip">
        学習: 石 {model.nStones} 個 / {new Date(model.trainedAt).toLocaleString("ja-JP")}
        {model.cvAccuracy != null && ` / 検証正解率 ${Math.round(model.cvAccuracy * 100)}%`}
      </p>

      <button className="primary wide" onClick={onRestart}>別の石を判定する</button>
    </div>
  );
}

interface Mark {
  box: Box;
  text: string;
  warn: boolean;
}

/** 乾燥写真に、各石の枠・番号・判定等級を重ねて描く */
function SideOverlay({ side }: { side: Side }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height } = side.dry;
  const marks: Mark[] = side.judged
    ? side.judged.map((j) => ({ box: j.box, text: `${j.index}  ${j.grade}等級`, warn: j.maybeMerged }))
    : side.dry.stones.map((s) => ({ box: s.box, text: `${s.index}`, warn: s.maybeMerged }));

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
        const color = m.warn ? "#f2a33a" : "#2fa0aa";
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
      <figcaption>{side.name}（乾燥）</figcaption>
    </figure>
  );
}
