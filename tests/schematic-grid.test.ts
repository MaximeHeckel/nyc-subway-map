import type { Point } from "../src/lib/types";
import test from "node:test";
import assert from "node:assert/strict";
import { rasterizeSchematic } from "../src/lib/schematicGrid.ts";

const line = (
  x: number,
  y: number,
  dx: number,
  dy: number,
  count: number,
): Point[] =>
  Array.from({ length: count + 1 }, (_, i) => [x + dx * i, y + dy * i]);
const steps = (points: Point[]) =>
  points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]);

test("odd/even snapping never inserts a sideways step inside a diagonal run", () => {
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      for (let x = 10; x < 12; x++)
        for (let y = 10; y < 12; y++)
          for (let length = 6; length < 25; length++) {
            const path = line(x, y, dx, dy, length),
              output = rasterizeSchematic(path);
            const moves = steps(output);
            const indices = moves.flatMap(([sx, sy], i) =>
              sx && sy ? [i] : [],
            );
            assert.ok(indices.length > 0);
            assert.equal(
              indices.at(-1)! - indices[0] + 1,
              indices.length,
              `Broken diagonal ${JSON.stringify(path)}`,
            );
            for (const i of indices)
              assert.deepEqual(moves[i], [dx * 2, dy * 2]);
            assert.deepEqual(
              output[0],
              path[0].map((v) => Math.round(v / 2) * 2 || 0),
            );
            assert.deepEqual(
              output.at(-1),
              path.at(-1)!.map((v) => Math.round(v / 2) * 2 || 0),
            );
          }
});
test("short corners remain explicit and rounding corrections meet the following straight", () => {
  const diagonal = line(11, 11, 1, -1, 9);
  const path = [...diagonal, ...line(20, 2, 0, -1, 6).slice(1)];
  const output = rasterizeSchematic(path);
  const moves = steps(output);
  assert.deepEqual(
    moves.slice(0, 4),
    Array.from({ length: 4 }, () => [2, -2]),
  );
  assert.ok(moves.slice(4).every(([x, y]) => x === 0 && y === -2));
  assert.equal(new Set(output.map((p) => p.join(","))).size, output.length);
});
test("single points, duplicate anchors, and axis-aligned paths stay bounded", () => {
  assert.deepEqual(rasterizeSchematic([]), []);
  assert.deepEqual(rasterizeSchematic([[3, 3]]), [[4, 4]]);
  assert.deepEqual(
    rasterizeSchematic([
      [2, 2],
      [2, 2],
      [4, 2],
    ]),
    [
      [2, 2],
      [4, 2],
    ],
  );
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    assert.ok(
      steps(rasterizeSchematic(line(10, 10, dx, dy, 12))).every(
        ([x, y]) => x === dx * 2 && y === dy * 2,
      ),
    );
  }
});
