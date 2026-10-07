import { describe, expect, it } from "vitest";
import { computeQuality, judgeQuality } from "./quality";
import { buildMetadataRows, METADATA_HEADER } from "./exportZip";
import { nextStoneId } from "./db";
import type { Shot, Stone } from "./types";

function img(w: number, h: number, f: (x: number, y: number) => number) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      a[i] = a[i + 1] = a[i + 2] = v;
      a[i + 3] = 255;
    }
  return a;
}

describe("quality", () => {
  it("flat gray image is blurry", () => {
    const q = computeQuality(img(50, 50, () => 128), 50, 50);
    expect(q.meanLuma).toBeCloseTo(128, 0);
    expect(q.sharpness).toBe(0);
    expect(judgeQuality(q).some((w) => w.level === "bad")).toBe(true);
  });
  it("checkerboard is sharp", () => {
    const q = computeQuality(img(50, 50, (x, y) => ((x + y) % 2 ? 200 : 60)), 50, 50);
    expect(q.sharpness).toBeGreaterThan(1000);
    expect(judgeQuality(q).find((w) => w.message.includes("ピント"))).toBeUndefined();
  });
  it("detects clipping and dark areas", () => {
    const q = computeQuality(img(10, 10, (x) => (x < 5 ? 255 : 0)), 10, 10);
    expect(q.clippedRatio).toBeCloseTo(0.5);
    expect(q.darkRatio).toBeCloseTo(0.5);
  });
});

describe("export", () => {
  const q = { meanLuma: 1, sharpness: 2, clippedRatio: 0, darkRatio: 0 };
  const stones: Stone[] = [{ id: "S001", grade: "2", source: "上田, 天草", note: "", createdAt: 0 }];
  const shot = (id: string, condition: "dry" | "wet"): Shot => ({
    id, stoneId: "S001", condition, face: "A面", hasReferenceCard: true, width: 1, height: 1, quality: q, createdAt: 0, blob: new Blob(),
  });
  it("numbers per stone and condition, grouped by grade", () => {
    const rows = buildMetadataRows(stones, [shot("a", "dry"), shot("b", "wet"), shot("c", "dry"), { ...shot("d", "dry"), stoneId: "ghost" }]);
    expect(rows.map((r) => r.path)).toEqual([
      "images/grade_2/S001/dry_001.jpg",
      "images/grade_2/S001/wet_001.jpg",
      "images/grade_2/S001/dry_002.jpg",
    ]);
    expect(rows[0].row.split(",").length).toBe(METADATA_HEADER.split(",").length);
  });
  it("next stone id", () => {
    expect(nextStoneId([])).toBe("S001");
    expect(nextStoneId([...stones, { ...stones[0], id: "S009" }])).toBe("S010");
  });
});
