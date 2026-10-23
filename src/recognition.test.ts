import { describe, expect, it } from "vitest";
import { extractFeatures } from "./features";
import { checkRecognition, edgeRatio, roiBox } from "./recognition";

const W = 200;
const H = 150;

/** 黒い背景(20)に、明るい部分(220)を描いた画像 */
function image(bright: (x: number, y: number) => boolean) {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = bright(x, y) ? 220 : 20;
      a[i] = v; a[i + 1] = v; a[i + 2] = v; a[i + 3] = 255;
    }
  return a;
}

function check(bright: (x: number, y: number) => boolean) {
  const { features, mask } = extractFeatures(image(bright), W, H);
  return checkRecognition(mask, W, H, features.areaRatio);
}

describe("checkRecognition", () => {
  it("accepts a stone inside the frame", () => {
    // 解析範囲（x 8〜68%、y 10〜90%）の中央付近の円
    expect(check((x, y) => (x - W * 0.38) ** 2 + (y - H * 0.5) ** 2 < (H * 0.25) ** 2)).toEqual({ ok: true });
  });

  it("rejects a bright region spreading over the whole frame", () => {
    // 画面の下半分が明るい（机や服など）。解析範囲の左右と下の辺にかかる
    expect(check((_x, y) => y > H * 0.45)).toEqual({ ok: false, reason: "edge" });
  });

  it("rejects an image with almost nothing", () => {
    // 小さな点だけ（解析範囲の1%未満）
    expect(check((x, y) => Math.abs(x - W * 0.38) < 2 && Math.abs(y - H * 0.5) < 2)).toEqual({ ok: false, reason: "small" });
  });

  it("uses the 2% area and 25% edge thresholds", () => {
    const mask = new Uint8Array(W * H);
    expect(checkRecognition(mask, W, H, 0.0199)).toEqual({ ok: false, reason: "small" });
    expect(checkRecognition(mask, W, H, 0.02)).toEqual({ ok: true });
    // 外周の左の辺の上半分（全周の約1割）だけ石: 25%未満なので通る
    const box = roiBox(W, H);
    for (let y = box.y0; y < (box.y0 + box.y1) / 2; y++) mask[y * W + box.x0] = 1;
    expect(edgeRatio(mask, W, box)).toBeLessThan(0.25);
    expect(checkRecognition(mask, W, H, 0.5)).toEqual({ ok: true });
    // さらに上の辺（全周の約4分の1）も石にすると25%以上
    for (let x = box.x0; x < box.x1; x++) mask[box.y0 * W + x] = 1;
    expect(edgeRatio(mask, W, box)).toBeGreaterThanOrEqual(0.25);
    expect(checkRecognition(mask, W, H, 0.5)).toEqual({ ok: false, reason: "edge" });
  });

  it("matches the analysis range used by extractFeatures", () => {
    const { mask } = extractFeatures(image(() => true), W, H);
    const box = roiBox(W, H);
    let outside = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const inBox = x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
        if (!inBox && mask[y * W + x]) outside++;
        if (inBox) expect(mask[y * W + x]).toBe(1);
      }
    expect(outside).toBe(0);
  });
});
