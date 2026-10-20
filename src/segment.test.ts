import { describe, expect, it } from "vitest";
import { extractFeatures, rgbToLab, segmentStones, usableForTraining } from "./features";

type RGB = [number, number, number];

/** 再現できる疑似乱数（-1〜1） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 2 ** 32) * 2 - 1;
  };
}

interface Stone {
  cx: number;
  cy: number;
  r: number;
  color: RGB;
  texture: number; // 模様の強さ（RGB の振れ幅）
}

interface Shadow {
  cx: number;
  cy: number;
  r: number;
  depth: number; // 中心で背景を何割暗くするか
  soft: number; // ぼけの幅（px）
}

/** 背景（わずかなノイズ付き）に、影と模様のある石を描く */
function scene(w: number, h: number, bg: RGB, stones: Stone[], shadows: Shadow[] = [], seed = 1) {
  const rand = rng(seed);
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = bg.map((v) => v + rand() * 1.5) as RGB;
      for (const s of shadows) {
        const d = Math.hypot(x - s.cx, y - s.cy);
        const k = Math.min(1, Math.max(0, (s.r - d) / s.soft)); // 縁はなめらかに薄くなる
        c = c.map((v) => v * (1 - s.depth * k)) as RGB;
      }
      for (const s of stones)
        if (Math.hypot(x - s.cx, y - s.cy) <= s.r) c = s.color.map((v) => v + rand() * s.texture) as RGB;
      a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = 255;
    }
  return a;
}

function truthMask(w: number, h: number, s: Stone) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - s.cx, y - s.cy) <= s.r) m[y * w + x] = 1;
  return m;
}

function iou(a: Uint8Array, b: Uint8Array) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) union++;
  }
  return union ? inter / union : 0;
}

const WHITE: RGB = [242, 242, 242]; // L* ≈ 95
const BLACK: RGB = [25, 25, 25]; // L* ≈ 9
const W = 200, H = 150;

describe("segmentation by difference from the background", () => {
  it("test colors are what the scenarios describe", () => {
    expect(rgbToLab(...WHITE)[0]).toBeCloseTo(95.5, 0);
    expect(rgbToLab(171, 171, 171)[0]).toBeCloseTo(70, 0);
    const [L, , b] = rgbToLab(226, 222, 208);
    expect(L).toBeGreaterThan(86);
    expect(L).toBeLessThan(90);
    expect(b).toBeGreaterThan(4);
  });

  it("white background: cuts out a gray stone and leaves out the soft shadow beside it", () => {
    const stone: Stone = { cx: 85, cy: 75, r: 30, color: [171, 171, 171], texture: 14 };
    const shadow: Shadow = { cx: 120, cy: 85, r: 32, depth: 0.12, soft: 12 };
    const { mask, status } = extractFeatures(scene(W, H, WHITE, [stone], [shadow]), W, H);
    expect(status).toBe("ok");
    expect(iou(mask, truthMask(W, H, stone))).toBeGreaterThan(0.85);
    // 影の中心（石と重ならない位置）は石に含まれない
    expect(mask[85 * W + 130]).toBe(0);
  });

  it("black background: cuts out a brown stone", () => {
    const stone: Stone = { cx: 100, cy: 70, r: 35, color: [150, 105, 70], texture: 14 };
    const { mask, status, features } = extractFeatures(scene(W, H, BLACK, [stone]), W, H);
    expect(status).toBe("ok");
    expect(iou(mask, truthMask(W, H, stone))).toBeGreaterThan(0.85);
    expect(features.b).toBeGreaterThan(15); // 茶色（黄み）が特徴量に出ている
  });

  it("white background: cuts out a whitish, slightly yellow stone", () => {
    const stone: Stone = { cx: 100, cy: 75, r: 35, color: [226, 222, 208], texture: 4 };
    const { mask, status } = extractFeatures(scene(W, H, WHITE, [stone]), W, H);
    expect(status).toBe("ok");
    expect(iou(mask, truthMask(W, H, stone))).toBeGreaterThanOrEqual(0.7);
  });

  it("white background: separates three stones", () => {
    const stones: Stone[] = [
      { cx: 50, cy: 75, r: 22, color: [171, 171, 171], texture: 14 },
      { cx: 105, cy: 75, r: 22, color: [150, 105, 70], texture: 14 },
      { cx: 160, cy: 75, r: 22, color: [140, 120, 95], texture: 14 },
    ];
    const seg = segmentStones(scene(W, H, WHITE, stones), W, H);
    expect(seg.stones.length).toBe(3);
    seg.stones.forEach((s, k) => expect(Math.abs(s.cx - stones[k].cx)).toBeLessThan(2)); // 左から順に番号
    expect(seg.suspicious).toBe(false);
  });

  it("an image of only the background has no stone (warned)", () => {
    const img = scene(W, H, WHITE, []);
    expect(extractFeatures(img, W, H).status).toBe("none");
    expect(segmentStones(img, W, H).stones).toEqual([]);
  });

  it("white paper on a dark table is flagged as too large (50% or more of the image)", () => {
    // 外周は机（暗い）、中央に大きな白い紙。紙が「背景と違う色の成分」になる
    const paper: Stone = { cx: 100, cy: 75, r: 72, color: WHITE, texture: 2 };
    const { status } = extractFeatures(scene(W, H, BLACK, [paper]), W, H);
    expect(status).toBe("tooLarge");
    expect(usableForTraining(status)).toBe(true); // 警告は出すが、外周に接していないので学習には使う
  });

  it("a stone filling 40% of the image is used for training without a warning", () => {
    const r = Math.sqrt((0.4 * W * H) / Math.PI);
    const stone: Stone = { cx: 100, cy: 75, r, color: [150, 105, 70], texture: 8 };
    const { status, features } = extractFeatures(scene(W, H, WHITE, [stone]), W, H);
    expect(features.areaRatio).toBeGreaterThan(0.38);
    expect(status).toBe("ok");
    expect(usableForTraining(status)).toBe(true);
  });

  it("only photos with no stone found are left out of training", () => {
    expect(usableForTraining("none")).toBe(false);
    expect(usableForTraining("ok")).toBe(true);
  });

  it("batch: warns when most of the foreground touches the edge (background not separated)", () => {
    // 机（暗い）の上に、上下の端まで届く白い紙の帯。石は紙の上にある
    const a = scene(W, H, BLACK, []);
    for (let y = 0; y < H; y++)
      for (let x = 60; x < 140; x++) {
        const i = (y * W + x) * 4;
        a[i] = a[i + 1] = a[i + 2] = 242;
      }
    const seg = segmentStones(a, W, H);
    expect(seg.stones).toEqual([]);
    expect(seg.suspicious).toBe(true);
  });
});

// 弱点A・Bの再現ケース。模様のない石（flat）と、石の内部に明度±3程度の細かいノイズを入れた石（noisy）の両方で確かめる
describe.each([
  ["flat", 0],
  ["noisy (L* ±3)", 8],
])("stones that used to be lost: %s", (_name, texture) => {
  it("A: gray, brown and whitish stones side by side on white are all found", () => {
    const stones: Stone[] = [
      { cx: 50, cy: 75, r: 22, color: [171, 171, 171], texture },
      { cx: 105, cy: 75, r: 22, color: [150, 105, 70], texture },
      { cx: 160, cy: 75, r: 22, color: [226, 222, 208], texture },
    ];
    const seg = segmentStones(scene(W, H, WHITE, stones), W, H);
    expect(seg.stones.length).toBe(3);
    seg.stones.forEach((s, k) => expect(Math.abs(s.cx - stones[k].cx)).toBeLessThan(2));
    // 白っぽい石も、境界まで取りこぼさずに切り出せている
    expect(seg.stones[2].area).toBeGreaterThan(Math.PI * 22 * 22 * 0.85);
  });

  it("B: twelve gray circles on white are all found", () => {
    const w = 400, h = 300;
    const stones: Stone[] = [];
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 4; k++) stones.push({ cx: 55 + 97 * k, cy: 55 + 95 * j, r: 30, color: [171, 171, 171], texture });
    const seg = segmentStones(scene(w, h, WHITE, stones), w, h);
    expect(seg.stones.length).toBe(12);
    expect(seg.stones.every((s) => s.area > Math.PI * 30 * 30 * 0.85)).toBe(true);
  });
});

/** 白い背景（L* ≈ 95.5）を明度で dL だけ暗くする影の濃さ（0〜1） */
function depthForDeltaL(dL: number): number {
  const target = rgbToLab(...WHITE)[0] - dL;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const v = Math.round(WHITE[0] * (1 - mid));
    if (rgbToLab(v, v, v)[0] > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// 影の除去。石には実物に近い明度±3のノイズを入れる（模様が完全にない石の横の影は、石ごと残ることを許容する）
describe("shadows beside stones (stone texture L* ±3)", () => {
  const stoneColors: [string, RGB][] = [
    ["gray", [171, 171, 171]],
    ["brown", [150, 105, 70]],
    ["whitish", [226, 222, 208]],
  ];
  const shadows: [string, number, number][] = [
    ["hard, 15 darker", 15, 1],
    ["hard, 30 darker", 30, 1],
    ["soft, 15 darker", 15, 12],
  ];
  const cases = stoneColors.flatMap(([sName, color]) => shadows.map(([dName, dL, soft]) => [sName, dName, color, dL, soft] as const));

  it.each(cases)("%s stone, %s shadow: the shadow is removed and the stone stays", (_s, _d, color, dL, soft) => {
    const stone: Stone = { cx: 85, cy: 75, r: 30, color, texture: 8 };
    const shadow: Shadow = { cx: 115, cy: 85, r: 32, depth: depthForDeltaL(dL), soft };
    const { mask, status } = extractFeatures(scene(W, H, WHITE, [stone], [shadow]), W, H);
    expect(status).toBe("ok");

    const inStone = truthMask(W, H, stone);
    let stoneArea = 0, stoneKept = 0, shadowArea = 0, shadowKept = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (inStone[i]) {
          stoneArea++;
          if (mask[i]) stoneKept++;
        } else if (Math.hypot(x - shadow.cx, y - shadow.cy) <= shadow.r - soft) {
          // 影の濃い部分（縁のぼけを除く、石と重ならない部分）
          shadowArea++;
          if (mask[i]) shadowKept++;
        }
      }
    expect(stoneKept / stoneArea).toBeGreaterThanOrEqual(0.85);
    expect(shadowKept / shadowArea).toBeLessThanOrEqual(0.2);
  });
});
