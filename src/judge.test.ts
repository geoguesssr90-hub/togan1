import { describe, expect, it } from "vitest";
import { extractFeatures, otsu, rgbToLab, type StoneFeatures } from "./features";
import { featureVector, FEATURE_NAMES } from "./features";
import { buildSamples, isModel, predict, trainModel, type StoneSamples } from "./model";

/** 灰色の背景(110)に、明るい石(stone)と左の影(30)を描いた画像 */
function scene(w: number, h: number, stone: [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c: [number, number, number] = [110, 110, 110];
      const inStone = (x - w * 0.38) ** 2 + (y - h * 0.5) ** 2 < (h * 0.2) ** 2;
      const inShadow = (x - w * 0.28) ** 2 + (y - h * 0.58) ** 2 < (h * 0.2) ** 2;
      if (inShadow) c = [30, 30, 30];
      if (inStone) c = stone;
      a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = 255;
    }
  return a;
}

describe("features", () => {
  it("Lab: white and black", () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 0);
    expect(Math.abs(rgbToLab(128, 128, 128)[1])).toBeLessThan(0.5);
  });

  it("otsu splits two clusters", () => {
    const t = otsu([...Array(50).fill(20), ...Array(50).fill(80)]);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(80);
  });

  it("finds the bright stone and ignores the shadow", () => {
    const w = 200, h = 150;
    const { features, mask } = extractFeatures(scene(w, h, [235, 232, 225]), w, h);
    expect(features.L).toBeGreaterThan(88);
    expect(features.areaRatio).toBeGreaterThan(0.1);
    // 影の中心（石と重ならない位置）は石と判定されない
    const sx = Math.round(w * 0.2), sy = Math.round(h * 0.65);
    expect(mask[sy * w + sx]).toBe(0);
  });

  it("yellower stone has larger b*", () => {
    const w = 120, h = 90;
    const white = extractFeatures(scene(w, h, [235, 233, 228]), w, h).features;
    const yellow = extractFeatures(scene(w, h, [230, 215, 170]), w, h).features;
    expect(yellow.b).toBeGreaterThan(white.b + 10);
  });
});

function f(L: number, b: number, jitter: number): StoneFeatures {
  return { L: L + jitter, a: 1, b: b - jitter, Lstd: 3, spotRatio: 0.01, texture: 2, areaRatio: 0.3 };
}

function stone(id: string, grade: string, L: number, b: number, n = 3): StoneSamples {
  // 等級が上がるほど暗く・黄色い
  const dry = Array.from({ length: n }, (_, k) => f(L, b, (k % 3) * 0.5 - 0.5));
  return { stoneId: id, grade, dry };
}

describe("model", () => {
  const data: StoneSamples[] = [];
  let k = 0;
  for (const [grade, L, b] of [["2", 90, 4], ["3", 82, 10], ["4", 74, 16]] as const)
    for (let i = 0; i < 4; i++) data.push(stone(`S${++k}`, grade, L + i * 0.7, b + i * 0.3));

  it("feature vector has the six dry features in FEATURE_NAMES order", () => {
    const v = featureVector(data[0].dry[0]);
    expect(v.length).toBe(FEATURE_NAMES.length);
    expect(v).toEqual([89.5, 1, 4.5, 3, 0.01, 2]);
  });

  it("one sample per dry photo, capped at 25 per stone", () => {
    const { X, stoneIds } = buildSamples([data[0]]);
    expect(X.length).toBe(3);
    expect(new Set(stoneIds)).toEqual(new Set(["S1"]));
    expect(buildSamples([stone("big", "2", 90, 4, 60)]).X.length).toBe(25);
  });

  it("trains, cross-validates by stone, and predicts", () => {
    const m = trainModel(data);
    expect(isModel(m)).toBe(true);
    expect(m.grades).toEqual(["2", "3", "4"]);
    expect(m.nStones).toBe(12);
    expect(m.cvAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(m.version).toBe(2);
    expect(m.nPhotos).toBe(36);
    const p = predict(m, data[0].dry[0]);
    expect(p.reduce((s, q) => s + q.prob, 0)).toBeCloseTo(1, 5);
    expect(p.reduce((a, b) => (b.prob > a.prob ? b : a)).grade).toBe("2");
    expect(JSON.parse(JSON.stringify(m))).toEqual(m); // JSONで保存できる
  });

  it("needs dry photos in two grades", () => {
    expect(() => trainModel([data[0], data[1]])).toThrow("乾燥写真のある石が、2つ以上の等級で必要です");
    expect(() => trainModel([data[0], { ...data[8], dry: [] }])).toThrow();
  });

  it("accepts only version 2 models", () => {
    const m = trainModel(data);
    expect(isModel(m)).toBe(true);
    expect(isModel({ ...m, version: 1 })).toBe(false);
  });
});
