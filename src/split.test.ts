import { describe, expect, it } from "vitest";
import { allocateStoneIds, sortByCaptureOrder, sortByCreatedAt, splitEvery } from "./split";

describe("sortByCaptureOrder", () => {
  it("sorts by lastModified, then by file name with numbers in order", () => {
    const files = [
      { name: "IMG_10.jpg", lastModified: 200 },
      { name: "IMG_9.jpg", lastModified: 200 },
      { name: "IMG_20.jpg", lastModified: 100 },
      { name: "IMG_1.jpg", lastModified: 300 },
    ];
    expect(sortByCaptureOrder(files).map((f) => f.name)).toEqual(["IMG_20.jpg", "IMG_9.jpg", "IMG_10.jpg", "IMG_1.jpg"]);
    expect(files[0].name).toBe("IMG_10.jpg"); // 元の配列は変えない
  });
});

describe("sortByCreatedAt", () => {
  it("sorts by createdAt, then by id", () => {
    const shots = [
      { id: "b", createdAt: 5 },
      { id: "a", createdAt: 5 },
      { id: "c", createdAt: 1 },
    ];
    expect(sortByCreatedAt(shots).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});

describe("splitEvery", () => {
  it("splits into groups of N", () => {
    const { groups, remainder } = splitEvery([1, 2, 3, 4, 5, 6], 3);
    expect(groups).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(remainder).toBe(0);
  });

  it("detects a remainder and keeps it as a short last group", () => {
    const { groups, remainder } = splitEvery([1, 2, 3, 4, 5, 6, 7], 3);
    expect(groups).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(remainder).toBe(1);
  });

  it("handles fewer items than N and no items", () => {
    expect(splitEvery([1, 2], 3)).toEqual({ groups: [[1, 2]], remainder: 2 });
    expect(splitEvery([], 3)).toEqual({ groups: [], remainder: 0 });
  });

  it("rejects N that is not a positive integer", () => {
    expect(() => splitEvery([1], 0)).toThrow();
    expect(() => splitEvery([1], 1.5)).toThrow();
    expect(() => splitEvery([1], NaN)).toThrow();
  });
});

describe("allocateStoneIds", () => {
  it("continues numbering after existing stone IDs", () => {
    expect(allocateStoneIds([{ id: "S001" }, { id: "S007" }, { id: "memo" }], 3)).toEqual(["S008", "S009", "S010"]);
    expect(allocateStoneIds([], 2)).toEqual(["S001", "S002"]);
    expect(allocateStoneIds([{ id: "S001" }], 0)).toEqual([]);
  });
});
