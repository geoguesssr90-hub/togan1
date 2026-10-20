import { describe, expect, it } from "vitest";
import {
  allocateStoneIds,
  compactRows,
  excludeItems,
  initialPlan,
  moveToNewRow,
  moveToRow,
  shiftEarlier,
  shiftLater,
  sortByCaptureOrder,
  sortByCreatedAt,
  splitEvery,
  type Plan,
} from "./split";

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

describe("editing the plan", () => {
  const base = (): Plan => initialPlan(7, 3); // [[0,1,2],[3,4,5],[6]]

  it("starts with N photos per row", () => {
    expect(base()).toEqual({ rows: [[0, 1, 2], [3, 4, 5], [6]], excluded: [] });
  });

  it("moves selected photos to the end of a row, in capture order", () => {
    expect(moveToRow(base(), new Set([2, 0]), 1).rows).toEqual([[1], [3, 4, 5, 0, 2], [6]]);
  });

  it("drops rows that become empty (stone IDs close up)", () => {
    const p = moveToRow(base(), new Set([6]), 0);
    expect(p.rows).toEqual([[0, 1, 2, 6], [3, 4, 5]]);
    expect(allocateStoneIds([], p.rows.length)).toEqual(["S001", "S002"]);
    expect(compactRows({ rows: [[1], [], [2]], excluded: [] }).rows).toEqual([[1], [2]]);
  });

  it("makes a new row right after the row of the earliest selected photo", () => {
    expect(moveToNewRow(base(), new Set([2, 1])).rows).toEqual([[0], [1, 2], [3, 4, 5], [6]]);
    expect(moveToNewRow(base(), new Set([0, 1, 2])).rows).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(moveToNewRow(base(), new Set())).toEqual(base());
  });

  it("excludes photos and brings them back from the excluded list", () => {
    const ex = excludeItems(base(), new Set([6, 4]));
    expect(ex).toEqual({ rows: [[0, 1, 2], [3, 5]], excluded: [4, 6] });
    expect(moveToRow(ex, new Set([4]), 1)).toEqual({ rows: [[0, 1, 2], [3, 5, 4]], excluded: [6] });
    expect(moveToNewRow(ex, new Set([6]))).toEqual({ rows: [[0, 1, 2], [3, 5], [6]], excluded: [4] });
  });

  it("shifts later from a row where one photo was missed", () => {
    // 2個目の石を2枚しか撮らなかった: 11枚が [3][3][3][2] に区切られ、3個目以降がずれている
    const p = initialPlan(11, 3);
    expect(shiftLater(p, 1, 3).rows).toEqual([[0, 1, 2], [3, 4], [5, 6, 7], [8, 9, 10]]);
  });

  it("shifting later from a full last row makes a new row", () => {
    expect(shiftLater(initialPlan(6, 3), 1, 3).rows).toEqual([[0, 1, 2], [3, 4], [5]]);
  });

  it("shifts earlier from a row when the previous stone has one extra photo", () => {
    // 2個目の石を4枚撮った: 3個目の行の先頭（6）は2個目の石の写真
    const p = initialPlan(13, 3);
    expect(shiftEarlier(p, 2).rows).toEqual([[0, 1, 2], [3, 4, 5, 6], [7, 8, 9], [10, 11, 12]]);
    expect(shiftEarlier(p, 0)).toEqual(p); // 先頭の行では何もしない
  });

  it("keeps the excluded list when shifting", () => {
    const ex = excludeItems(initialPlan(9, 3), new Set([8]));
    expect(shiftLater(ex, 0, 3).excluded).toEqual([8]);
    expect(shiftEarlier(ex, 1).excluded).toEqual([8]);
  });
});
