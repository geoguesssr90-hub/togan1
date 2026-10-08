import { computeQuality } from "./quality";
import { fitLongSide } from "./resize";
import type { QualityMetrics } from "./types";

export interface Captured {
  blob: Blob;
  width: number;
  height: number;
  quality: QualityMetrics;
  previewUrl: string;
}

const ANALYSIS_LONG_SIDE = 400;

/** 映像フレームまたは画像を JPEG 化し、縮小版で画質を評価する */
export async function captureFrom(source: CanvasImageSource, width: number, height: number): Promise<Captured> {
  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  full.getContext("2d")!.drawImage(source, 0, 0, width, height);

  const scale = Math.min(1, ANALYSIS_LONG_SIDE / Math.max(width, height));
  const aw = Math.max(1, Math.round(width * scale));
  const ah = Math.max(1, Math.round(height * scale));
  const small = document.createElement("canvas");
  small.width = aw;
  small.height = ah;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(full, 0, 0, aw, ah);
  const quality = computeQuality(sctx.getImageData(0, 0, aw, ah).data, aw, ah);

  const blob: Blob = await new Promise((res, rej) =>
    full.toBlob((b) => (b ? res(b) : rej(new Error("JPEG変換に失敗"))), "image/jpeg", 0.92),
  );
  return { blob, width, height, quality, previewUrl: URL.createObjectURL(blob) };
}

/**
 * 写真ファイルを読み込み、長辺が上限を超えていれば縮小して JPEG 化する。
 * imageOrientation: "from-image" で EXIF の向きを反映した状態でデコードされ（bmp.width/height も回転後の値）、
 * それを canvas に描いて再エンコードするので、保存される JPEG は画素自体が正しい向きになる（EXIF は残らない）。
 */
export async function captureFromFile(file: File): Promise<Captured> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitLongSide(bmp.width, bmp.height);
    return await captureFrom(bmp, width, height);
  } finally {
    bmp.close();
  }
}

export function newId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}
