import { describe, expect, it } from "vitest";
import { confidenceLabel } from "./confidence";

describe("confidenceLabel", () => {
  it("is high at 80% or more", () => {
    expect(confidenceLabel(1)).toBe("高");
    expect(confidenceLabel(0.8)).toBe("高");
  });

  it("is medium from 50% up to but not including 80%", () => {
    expect(confidenceLabel(0.7999)).toBe("中");
    expect(confidenceLabel(0.5)).toBe("中");
  });

  it("is low below 50%", () => {
    expect(confidenceLabel(0.4999)).toBe("低");
    expect(confidenceLabel(0.34)).toBe("低");
  });
});
