import { describe, expect, it } from "vitest";
import { pairSides, worseGrade, type StoneJudgement } from "./batch";
import { segmentStones } from "./features";

type Circle = [cx: number, cy: number, r: number];

/** 暗い背景(30)に明るい円(230)を描いた画像 */
function circles(w: number, h: number, list: Circle[]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = list.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) ? 230 : 30;
      a[i] = v; a[i + 1] = v; a[i + 2] = v; a[i + 3] = 255;
    }
  return a;
}

function centerOf(s: { cx: number; cy: number }) {
  return [Math.round(s.cx), Math.round(s.cy)];
}

describe("segmentStones", () => {
  it("splits stones and numbers them row by row, left to right", () => {
    const w = 300, h = 200;
    // 上の行は右の石のほうが少し上にあるが、同じ行として左から数える
    const { stones } = segmentStones(circles(w, h, [[120, 150, 20], [200, 45, 20], [60, 55, 20]]), w, h);
    expect(stones.length).toBe(3);
    expect(stones.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(stones.map(centerOf)).toEqual([[60, 55], [200, 45], [120, 150]]);
    expect(stones.every((s) => !s.maybeMerged)).toBe(true);
    // 明るい円そのものの特徴量が取れている
    expect(stones[0].features.L).toBeGreaterThan(85);
    expect(stones[0].features.areaRatio).toBeCloseTo((Math.PI * 20 * 20) / (w * h), 2);
  });

  it("drops stones touching the edge and tiny specks", () => {
    const w = 300, h = 200;
    const { stones } = segmentStones(circles(w, h, [[10, 100, 25], [150, 100, 25], [250, 40, 4]]), w, h);
    expect(stones.length).toBe(1);
    expect(centerOf(stones[0])).toEqual([150, 100]);
  });

  it("flags a component much larger than the others as possibly merged", () => {
    const w = 400, h = 200;
    // 2つの円が数画素の幅で接して1つの成分になる（1画素だけの接触はオープニングで切れる）。
    // しきい値は中央値の2.5倍なので、他の石（半径15）より大きい円どうし（半径20）で確かめる
    const { stones } = segmentStones(
      circles(w, h, [[50, 50, 15], [150, 50, 15], [250, 50, 15], [100, 140, 20], [136, 140, 20]]),
      w,
      h,
    );
    expect(stones.length).toBe(4);
    expect(stones.filter((s) => s.maybeMerged).map((s) => s.index)).toEqual([4]);
  });

  it("returns no stones for an empty background", () => {
    const w = 100, h = 80;
    expect(segmentStones(circles(w, h, []), w, h).stones).toEqual([]);
  });
});

function judged(grades: string[]): StoneJudgement[] {
  return grades.map((grade, k) => ({ index: k + 1, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, maybeMerged: false, grade, prob: 0.8 }));
}

describe("pairSides", () => {
  it("pairs front and back by number and takes the worse grade", () => {
    const rows = pairSides(judged(["2", "3", "4"]), judged(["3", "3", "2"]))!;
    expect(rows.map((r) => [r.index, r.front.grade, r.back?.grade, r.overall])).toEqual([
      [1, "2", "3", "3"],
      [2, "3", "3", "3"],
      [3, "4", "2", "4"],
    ]);
  });

  it("uses the front only when the back was skipped", () => {
    const rows = pairSides(judged(["2", "4"]), null)!;
    expect(rows.map((r) => [r.back, r.overall])).toEqual([[null, "2"], [null, "4"]]);
  });

  it("cannot pair when the stone counts differ", () => {
    expect(pairSides(judged(["2", "3"]), judged(["2"]))).toBeNull();
  });
});

describe("worseGrade", () => {
  it("returns the larger grade number (lower quality)", () => {
    expect(worseGrade("2", "3")).toBe("3");
    expect(worseGrade("4", "2")).toBe("4");
    expect(worseGrade("3", "3")).toBe("3");
    expect(worseGrade("10", "9")).toBe("10"); // 文字列ではなく数値で比べる
  });
});
