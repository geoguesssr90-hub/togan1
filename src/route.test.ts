import { describe, expect, it } from "vitest";
import { hashForRoute, routeFromHash } from "./route";

describe("route", () => {
  it("reads the screen from the URL hash", () => {
    expect(routeFromHash("")).toBe("start");
    expect(routeFromHash("#judge")).toBe("judge");
    expect(routeFromHash("#train")).toBe("train");
    expect(routeFromHash("#something-else")).toBe("start");
  });

  it("round-trips between screen and hash", () => {
    for (const r of ["start", "judge", "train"] as const) expect(routeFromHash(hashForRoute(r))).toBe(r);
    expect(hashForRoute("start")).toBe("");
  });
});
