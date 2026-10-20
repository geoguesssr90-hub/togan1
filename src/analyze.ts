/** ブラウザ側: 画像Blobを縮小して特徴量を取り出す。学習時と判定時で同じ関数を使う。 */
import {
  extractFeatures,
  segmentStones,
  usableForTraining,
  type SegmentedStone,
  type SegmentStatus,
  type StoneFeatures,
} from "./features";
import { listShots, listStones } from "./db";
import { isModel, type Model, type StoneSamples } from "./model";

const ANALYSIS_LONG_SIDE = 400;

export interface Analysis {
  features: StoneFeatures;
  status: SegmentStatus; // ok 以外は、背景と石を区別できなかった可能性がある
  maskPreview?: string; // 石と認識した範囲を色付けした画像（確認用）
}

export async function analyzeBlob(blob: Blob, withPreview = false): Promise<Analysis> {
  const bmp = await createImageBitmap(blob);
  try {
    const s = Math.min(1, ANALYSIS_LONG_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const { features, mask, status } = extractFeatures(img.data, w, h);
    if (!withPreview) return { features, status };
    const d = img.data;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        d[i * 4] = d[i * 4] * 0.55 + 47 * 0.45;
        d[i * 4 + 1] = d[i * 4 + 1] * 0.55 + 160 * 0.45;
        d[i * 4 + 2] = d[i * 4 + 2] * 0.55 + 170 * 0.45;
      } else {
        d[i * 4] *= 0.45;
        d[i * 4 + 1] *= 0.45;
        d[i * 4 + 2] *= 0.45;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { features, status, maskPreview: c.toDataURL("image/jpeg", 0.85) };
  } finally {
    bmp.close();
  }
}

/**
 * まとめて判定用の解析サイズ。1枚に6〜9個並べるので、1個判定（長辺400px）と
 * 石1個あたりの画素数がおおよそ揃うように大きめにする（きめ・斑点は解像度に左右されるため）。
 */
const BATCH_LONG_SIDE = 1200;

export interface BatchAnalysis {
  width: number; // 解析した画像の大きさ（stones の座標はこの大きさ基準）
  height: number;
  stones: SegmentedStone[];
  suspicious: boolean; // 背景と石を区別できなかった可能性がある
}

export async function analyzeBatchBlob(blob: Blob): Promise<BatchAnalysis> {
  const bmp = await createImageBitmap(blob);
  try {
    const s = Math.min(1, BATCH_LONG_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s));
    const h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const { stones, suspicious } = segmentStones(ctx.getImageData(0, 0, w, h).data, w, h);
    return { width: w, height: h, stones, suspicious };
  } finally {
    bmp.close();
  }
}

/**
 * 保存済みの写真のうち condition が "dry" のものだけから特徴量を作る（順番に処理してメモリを節約）。
 * 石が見つからなかった写真は学習に使わず、skipped に数える（大きすぎるという警告の出る写真は使う）。
 */
export async function collectSamples(
  onProgress: (done: number, total: number) => void,
): Promise<{ samples: StoneSamples[]; skipped: number }> {
  const [stones, allShots] = await Promise.all([listStones(), listShots()]);
  const shots = allShots.filter((s) => s.condition === "dry");
  const byStone = new Map<string, StoneSamples>(
    stones.map((s) => [s.id, { stoneId: s.id, grade: s.grade, dry: [] }]),
  );
  let done = 0, skipped = 0;
  for (const shot of shots) {
    const target = byStone.get(shot.stoneId);
    if (target) {
      try {
        const { features, status } = await analyzeBlob(shot.blob);
        if (usableForTraining(status)) target.dry.push(features);
        else skipped++;
      } catch {
        skipped++; // 読めない画像は飛ばす
      }
    }
    onProgress(++done, shots.length);
  }
  return { samples: [...byStone.values()], skipped };
}

const KEY = "togan-model-v2";

export function saveModel(m: Model) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* 保存できない環境では、その場だけ使う */
  }
}

export type ModelSource = "local" | "bundled";

export const MODEL_SOURCE_LABEL: Record<ModelSource, string> = { local: "この端末で学習", bundled: "公開版" };

/** 判定画面などに出すモデルの説明（どちらのモデルか・学習した石の数・日時・検証正解率） */
export function describeModel(model: Model, source: ModelSource): string {
  return [
    MODEL_SOURCE_LABEL[source],
    `石 ${model.nStones} 個`,
    new Date(model.trainedAt).toLocaleString("ja-JP"),
    model.cvAccuracy != null ? `検証正解率 ${Math.round(model.cvAccuracy * 100)}%` : null,
  ]
    .filter(Boolean)
    .join("・");
}

/**
 * この端末で学習したモデル → なければ公開されている public/model.json。
 * 端末で学習したモデルを優先するのは、その端末で意図して学習し直した結果を使うため。
 * 公開版に戻すときは「端末のモデルを削除」を使う。形式が古い・壊れた端末のモデルは無視して公開版を使う。
 * public/model.json は Service Worker が事前キャッシュするので、オフラインでも読める。
 */
export async function loadModel(): Promise<LoadedModel | null> {
  return (await loadModelStatus()).loaded;
}

export interface LoadedModel {
  model: Model;
  source: ModelSource;
}

/**
 * loadModel と同じ順でモデルを探し、使えるモデルがなかった場合は、古い形式のモデルが
 * あったか（outdated）も返す。「学習し直してください」の表示に使う。
 */
export async function loadModelStatus(): Promise<{ loaded: LoadedModel | null; outdated: boolean }> {
  let outdated = false;
  const check = (m: unknown, source: ModelSource): LoadedModel | null => {
    if (isModel(m)) return { model: m, source };
    if (m && typeof m === "object") outdated = true; // 読めたが、今の形式ではない
    return null;
  };
  try {
    const raw = localStorage.getItem(KEY);
    const r = raw ? check(JSON.parse(raw), "local") : null;
    if (r) return { loaded: r, outdated: false };
  } catch {
    /* 壊れた保存データは無視する */
  }
  try {
    const res = await fetch("/model.json", { cache: "no-store" });
    const r = res.ok ? check(await res.json(), "bundled") : null;
    if (r) return { loaded: r, outdated: false };
  } catch {
    /* noop */
  }
  return { loaded: null, outdated };
}

export const OUTDATED_MODEL_MESSAGE = "モデルの形式が古いため、学習し直してください";

/** 石を切り出せなかったときの案内（1個判定・まとめて判定で共通） */
export const SEGMENT_WARNING = "背景と石を区別できませんでした。背景を石と違う色にするか、石を中央に置いて撮り直してください。";

export function clearLocalModel() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function downloadModel(m: Model) {
  const blob = new Blob([JSON.stringify(m)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "model.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
