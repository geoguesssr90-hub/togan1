/** 等級の選択肢。現場の区分に合わせてここだけ変えればよい。 */
export const GRADES = ["1", "2", "3", "4", "5"] as const;
export type Grade = (typeof GRADES)[number];

/** 撮影条件。乾燥と湿潤の色差（褐色化）が判定の手がかりになる。 */
export type Condition = "dry" | "wet";
export const CONDITION_LABEL: Record<Condition, string> = { dry: "乾燥", wet: "湿潤" };

export interface Stone {
  id: string; // 例: S001。データ分割の単位
  grade: Grade;
  source: string; // 入手元（例: 上田陶石 2026-09-11）
  note: string;
  createdAt: number;
}

export interface QualityMetrics {
  meanLuma: number; // 0-255
  sharpness: number; // ラプラシアン分散
  clippedRatio: number; // 白飛びした画素の割合
  darkRatio: number; // 黒つぶれ画素の割合
}

export interface Shot {
  id: string;
  stoneId: string;
  condition: Condition;
  face: string; // 面のメモ（例: A面）。入力は廃止し新規は ""。旧データ互換のため残す
  hasReferenceCard: boolean;
  width: number;
  height: number;
  quality: QualityMetrics;
  createdAt: number;
  blob: Blob;
}
