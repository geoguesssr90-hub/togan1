import { describe, expect, it } from "vitest";
import { deletionSummary, isWipeConfirmed, toggled, withGrade } from "./selection";

describe("selection", () => {
  it("toggles an id without changing the original set", () => {
    const a = new Set(["S001"]);
    expect([...toggled(a, "S002")]).toEqual(["S001", "S002"]);
    expect([...toggled(a, "S001")]).toEqual([]);
    expect([...a]).toEqual(["S001"]);
  });

  it("adds all stones of a grade to the selection", () => {
    const stones = [
      { id: "S001", grade: "2" },
      { id: "S002", grade: "3" },
      { id: "S003", grade: "2" },
    ];
    expect([...withGrade(new Set(["S002"]), stones, "2")].sort()).toEqual(["S001", "S002", "S003"]);
    expect([...withGrade(new Set(), stones, "5")]).toEqual([]);
  });

  it("counts selected stones and their photos", () => {
    const shots = [{ stoneId: "S001" }, { stoneId: "S001" }, { stoneId: "S002" }, { stoneId: "S003" }];
    expect(deletionSummary(new Set(["S001", "S003"]), shots)).toEqual({ stones: 2, photos: 3 });
    expect(deletionSummary(new Set(), shots)).toEqual({ stones: 0, photos: 0 });
  });

  it("requires the exact confirmation text to wipe all data", () => {
    expect(isWipeConfirmed("削除する")).toBe(true);
    expect(isWipeConfirmed(" 削除する ")).toBe(true);
    expect(isWipeConfirmed("削除")).toBe(false);
    expect(isWipeConfirmed("")).toBe(false);
  });
});
