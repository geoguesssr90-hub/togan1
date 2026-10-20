import { afterEach, describe, expect, it, vi } from "vitest";
import bundled from "../public/model.json";
import { loadModel, loadModelStatus } from "./analyze";
import { FEATURE_NAMES, SEGMENTATION, type StoneFeatures } from "./features";
import { isModel, predict, trainModel, type Model } from "./model";

const sample: StoneFeatures = { L: 50, a: 2, b: 6, Lstd: 8, spotRatio: 0.05, texture: 5, areaRatio: 0.3 };
const f = (L: number): StoneFeatures => ({ ...sample, L });

// 端末で学習したモデル（石2個）と、公開版の代わりのモデル（石4個）。nStones で見分ける
const local = trainModel([
  { stoneId: "A", grade: "2", dry: [f(80), f(81)] },
  { stoneId: "B", grade: "4", dry: [f(40), f(41)] },
]);
const published = trainModel([
  { stoneId: "A", grade: "2", dry: [f(80)] },
  { stoneId: "B", grade: "2", dry: [f(82)] },
  { stoneId: "C", grade: "4", dry: [f(40)] },
  { stoneId: "D", grade: "4", dry: [f(42)] },
]);

describe("public/model.json", () => {
  // 切り出し方式を変えたら学習し直して差し替える前提。差し替える前は「古い形式」として扱われることを確かめる
  it("is either a model for the current segmentation, or reported as outdated", async () => {
    if (isModel(bundled)) {
      const m = bundled as Model;
      expect(m.segmentation).toBe(SEGMENTATION);
      expect(m.featureNames).toEqual(FEATURE_NAMES);
      const p = predict(m, sample);
      expect(p.reduce((s, q) => s + q.prob, 0)).toBeCloseTo(1, 6);
    } else {
      vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
      vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => bundled }));
      expect(await loadModelStatus()).toEqual({ loaded: null, outdated: true });
      vi.unstubAllGlobals();
    }
  });
});

describe("isModel", () => {
  it("accepts a freshly trained model", () => {
    expect(isModel(local)).toBe(true);
    expect(local.segmentation).toBe(SEGMENTATION);
  });

  it("rejects models from another segmentation or with the wrong shapes", () => {
    const m = local;
    expect(isModel({ ...m, segmentation: undefined })).toBe(false); // 切り出し方式を変える前のモデル
    expect(isModel({ ...m, segmentation: "bright-otsu" })).toBe(false);
    expect(isModel({ ...m, version: 1 })).toBe(false);
    expect(isModel({ ...m, featureNames: [...FEATURE_NAMES].reverse() })).toBe(false);
    expect(isModel({ ...m, mean: m.mean.slice(1) })).toBe(false);
    expect(isModel({ ...m, W: m.W.map((w) => w.slice(1)) })).toBe(false);
    expect(isModel({ ...m, bias: [...m.bias, 0] })).toBe(false);
    expect(isModel({ ...m, std: m.std.map(() => NaN) })).toBe(false);
    expect(isModel(null)).toBe(false);
  });
});

describe("loadModel", () => {
  function stubStorage(value: string | null) {
    vi.stubGlobal("localStorage", { getItem: () => value, setItem: () => {}, removeItem: () => {} });
  }
  function stubFetch(body: unknown, ok = true) {
    const fetch = vi.fn(async () => ({ ok, json: async () => body }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("uses the model trained on this device first", async () => {
    stubStorage(JSON.stringify(local));
    const fetch = stubFetch(published);
    const r = await loadModel();
    expect(r?.source).toBe("local");
    expect(r?.model.nStones).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the published model when there is no local model", async () => {
    stubStorage(null);
    stubFetch(published);
    const r = await loadModel();
    expect(r?.source).toBe("bundled");
    expect(r?.model.nStones).toBe(4);
  });

  it("ignores an outdated or broken local model and uses the published one", async () => {
    stubFetch(published);
    stubStorage(JSON.stringify({ ...local, segmentation: undefined }));
    expect((await loadModel())?.source).toBe("bundled");
    stubStorage("{broken");
    expect((await loadModel())?.source).toBe("bundled");
  });

  it("reports outdated when only old-format models are found", async () => {
    stubStorage(JSON.stringify({ ...local, segmentation: undefined }));
    stubFetch({ ...published, segmentation: undefined });
    expect(await loadModelStatus()).toEqual({ loaded: null, outdated: true });
  });

  it("returns nothing (not outdated) when there is no model at all", async () => {
    stubStorage(null);
    stubFetch(null, false);
    expect(await loadModel()).toBeNull();
    expect(await loadModelStatus()).toEqual({ loaded: null, outdated: false });
  });
});
