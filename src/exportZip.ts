import JSZip from "jszip";
import type { Shot, Stone } from "./types";

/**
 * 学習用のフォルダ構成:
 *   images/grade_{等級}/{石ID}/{dry|wet}_{連番}.jpg
 *   metadata.csv  … 1行1枚。石IDで分割すればデータリークを防げる
 *   stones.csv    … 1行1石
 */
export function shotPath(stone: Stone, shot: Shot, index: number): string {
  return `images/grade_${stone.grade}/${stone.id}/${shot.condition}_${String(index).padStart(3, "0")}.jpg`;
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildMetadataRows(stones: Stone[], shots: Shot[]): { path: string; shot: Shot; row: string }[] {
  const byId = new Map(stones.map((s) => [s.id, s]));
  const counters = new Map<string, number>();
  const out: { path: string; shot: Shot; row: string }[] = [];
  for (const shot of shots) {
    const stone = byId.get(shot.stoneId);
    if (!stone) continue;
    const key = `${stone.id}/${shot.condition}`;
    const idx = (counters.get(key) ?? 0) + 1;
    counters.set(key, idx);
    const path = shotPath(stone, shot, idx);
    const row = [
      path,
      stone.id,
      stone.grade,
      shot.condition,
      shot.face,
      shot.hasReferenceCard ? 1 : 0,
      shot.width,
      shot.height,
      shot.quality.meanLuma.toFixed(1),
      shot.quality.sharpness.toFixed(1),
      shot.quality.clippedRatio.toFixed(4),
      shot.quality.darkRatio.toFixed(4),
      new Date(shot.createdAt).toISOString(),
    ]
      .map(csvCell)
      .join(",");
    out.push({ path, shot, row });
  }
  return out;
}

export const METADATA_HEADER =
  "path,stone_id,grade,condition,face,has_reference_card,width,height,mean_luma,sharpness,clipped_ratio,dark_ratio,created_at";

export async function exportDataset(stones: Stone[], shots: Shot[]): Promise<Blob> {
  const zip = new JSZip();
  const rows = buildMetadataRows(stones, shots);
  for (const r of rows) zip.file(r.path, r.shot.blob);
  zip.file("metadata.csv", "﻿" + [METADATA_HEADER, ...rows.map((r) => r.row)].join("\n"));
  zip.file(
    "stones.csv",
    "﻿" +
      ["stone_id,grade,source,note", ...stones.map((s) => [s.id, s.grade, s.source, s.note].map(csvCell).join(","))].join(
        "\n",
      ),
  );
  return zip.generateAsync({ type: "blob" });
}
