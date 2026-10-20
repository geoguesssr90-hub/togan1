/** ブラウザ側: 画像Blobを縮小して特徴量を取り出す。学習時と判定時で同じ関数を使う。 */
import { extractFeatures, segmentStones, type SegmentedStone, type StoneFeatures } from "./features";
import { listShots, listStones } from "./db";
import { isModel, type Model, type StoneSamples } from "./model";

const ANALYSIS_LONG_SIDE = 400;

export interface Analysis {
  features: StoneFeatures;
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
    const { features, mask } = extractFeatures(img.data, w, h);
    if (!withPreview) return { features };
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
    return { features, maskPreview: c.toDataURL("image/jpeg", 0.85) };
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
    const { stones } = segmentStones(ctx.getImageData(0, 0, w, h).data, w, h);
    return { width: w, height: h, stones };
  } finally {
    bmp.close();
  }
}

/** 保存済みの写真のうち condition が "dry" のものだけから特徴量を作る（順番に処理してメモリを節約） */
export async function collectSamples(onProgress: (done: number, total: number) => void): Promise<StoneSamples[]> {
  const [stones, allShots] = await Promise.all([listStones(), listShots()]);
  const shots = allShots.filter((s) => s.condition === "dry");
  const byStone = new Map<string, StoneSamples>(
    stones.map((s) => [s.id, { stoneId: s.id, grade: s.grade, dry: [] }]),
  );
  let done = 0;
  for (const shot of shots) {
    const target = byStone.get(shot.stoneId);
    if (target) {
      try {
        const { features } = await analyzeBlob(shot.blob);
        if (features.areaRatio > 0.01) target.dry.push(features);
      } catch {
        /* 読めない画像は飛ばす */
      }
    }
    onProgress(++done, shots.length);
  }
  return [...byStone.values()];
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
export async function loadModel(): Promise<{ model: Model; source: ModelSource } | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw);
      if (isModel(m)) return { model: m, source: "local" };
    }
  } catch {
    /* noop */
  }
  try {
    const res = await fetch("/model.json", { cache: "no-store" });
    if (res.ok) {
      const m = await res.json();
      if (isModel(m)) return { model: m, source: "bundled" };
    }
  } catch {
    /* noop */
  }
  return null;
}

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
