import { afterEach, describe, expect, it, vi } from "vitest";
import bundled from "../public/model.json";
import { loadModel } from "./analyze";
import { FEATURE_NAMES, type StoneFeatures } from "./features";
import { isModel, predict, trainModel, type Model } from "./model";

const sample: StoneFeatures = { L: 50, a: 2, b: 6, Lstd: 8, spotRatio: 0.05, texture: 5, areaRatio: 0.3 };

describe("public/model.json", () => {
  it("is a version 2 model with the current features", () => {
    expect(isModel(bundled)).toBe(true);
    const m = bundled as Model;
    expect(m.version).toBe(2);
    expect(m.featureNames).toEqual(FEATURE_NAMES);
    expect(m.grades.length).toBeGreaterThanOrEqual(2);
  });

  it("predicts probabilities that sum to 1", () => {
    const p = predict(bundled as Model, sample);
    expect(p.map((q) => q.grade)).toEqual((bundled as Model).grades);
    expect(p.every((q) => Number.isFinite(q.prob))).toBe(true);
    expect(p.reduce((s, q) => s + q.prob, 0)).toBeCloseTo(1, 6);
  });
});

describe("isModel", () => {
  const m = bundled as Model;
  it("rejects models that do not match the current features or shapes", () => {
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

  // 端末で学習したモデル（公開版と区別できるよう石の数を変える）
  const f = (L: number): StoneFeatures => ({ ...sample, L });
  const local = trainModel([
    { stoneId: "A", grade: "2", dry: [f(80), f(81)] },
    { stoneId: "B", grade: "4", dry: [f(40), f(41)] },
  ]);

  it("uses the model trained on this device first", async () => {
    stubStorage(JSON.stringify(local));
    const fetch = stubFetch(bundled);
    const r = await loadModel();
    expect(r?.source).toBe("local");
    expect(r?.model.nStones).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to the bundled model when there is no local model", async () => {
    stubStorage(null);
    stubFetch(bundled);
    const r = await loadModel();
    expect(r?.source).toBe("bundled");
    expect(r?.model).toEqual(bundled);
  });

  it("ignores an old or broken local model and uses the bundled one", async () => {
    stubStorage(JSON.stringify({ ...local, version: 1 }));
    stubFetch(bundled);
    expect((await loadModel())?.source).toBe("bundled");
    stubStorage("{broken");
    expect((await loadModel())?.source).toBe("bundled");
  });

  it("returns null when neither is available", async () => {
    stubStorage(null);
    stubFetch(null, false);
    expect(await loadModel()).toBeNull();
  });
});
