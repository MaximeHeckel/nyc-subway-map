import type { GeoProjection } from "d3-geo";
import type { Point, RoutePath } from "@/types/transit";
import type { SubwayOptions } from "../types";
import { CELL_SIZE } from "../constants";
import { rasterizeSchematic } from "./schematicGrid";

export function gridPath(
  points: RoutePath,
  projection: GeoProjection,
): RoutePath {
  const result: RoutePath = [];
  let previous: Point | undefined;

  for (const coordinates of points) {
    const point = projection(coordinates)! as Point;

    if (!previous) {
      result.push(point);
      previous = point;
      continue;
    }

    // Preserve the projected line until the final ASCII-grid snap. Sampling
    // supports train progress without introducing an intermediate staircase.
    const dx = point[0] - previous[0];
    const dy = point[1] - previous[1];
    const steps = Math.ceil(Math.hypot(dx, dy));

    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      result.push([previous[0] + dx * fraction, previous[1] + dy * fraction]);
    }

    previous = point;
  }

  return result;
}

export function simplifyLine(points: RoutePath, tolerance = 2.5): RoutePath {
  if (points.length < 3) {
    return points;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  let maxDistanceSquared = 0;
  let farthestIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const progress = lengthSquared
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
              lengthSquared,
          ),
        )
      : 0;
    const distanceSquared =
      (point[0] - start[0] - progress * dx) ** 2 +
      (point[1] - start[1] - progress * dy) ** 2;

    if (distanceSquared > maxDistanceSquared) {
      maxDistanceSquared = distanceSquared;
      farthestIndex = i;
    }
  }

  return maxDistanceSquared > tolerance * tolerance
    ? [
        ...simplifyLine(points.slice(0, farthestIndex + 1), tolerance).slice(
          0,
          -1,
        ),
        ...simplifyLine(points.slice(farthestIndex), tolerance),
      ]
    : [start, end];
}

// Deliberate corridor layout traced from the supplied transit-diagram reference.
// Points are diagram coordinates, not longitude/latitude. Shared corridors reuse anchors.
export function cleanPath(anchors: RoutePath): RoutePath {
  const points = anchors.map<Point>((point) => [
    Math.round(point[0] / 8) + 15,
    Math.round(point[1] / 8) + 3,
  ]);
  const result = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1];
    const end = points[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const directionX = Math.sign(dx);
    const directionY = Math.sign(dy);
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
    const corner = [
      end[0] - directionX * diagonal,
      end[1] - directionY * diagonal,
    ];
    let x = start[0];
    let y = start[1];

    for (const segmentEnd of [corner, end]) {
      const steps = Math.max(
        Math.abs(segmentEnd[0] - x),
        Math.abs(segmentEnd[1] - y),
      );
      const stepX = Math.sign(segmentEnd[0] - x);
      const stepY = Math.sign(segmentEnd[1] - y);

      for (let step = 0; step < steps; step++) {
        x += stepX;
        y += stepY;
        result.push([x, y]);
      }
    }
  }

  return result;
}

export function characterPath(
  path: RoutePath,
  layoutMode: SubwayOptions["layout"],
  cellSize = CELL_SIZE,
): RoutePath {
  if (layoutMode === "orthogonal") {
    return rasterizeSchematic(path, cellSize);
  }
  // Simplify before quantization: straight diagonal runs get two endpoints,
  // never independently rounded samples on both sides of a grid boundary.
  const anchors = simplifyLine(path, 0.6).map<Point>(([x, y]) => [
    Math.round(x / cellSize),
    Math.round(y / cellSize),
  ]);
  const result: RoutePath = [];

  for (let i = 0; i < anchors.length; i++) {
    if (!i) {
      result.push(anchors[i]);
      continue;
    }

    let [x, y] = anchors[i - 1];
    const [endX, endY] = anchors[i];
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const directionX = Math.sign(endX - x);
    const directionY = Math.sign(endY - y);
    let error = dx + dy;

    while (x !== endX || y !== endY) {
      const doubledError = 2 * error;

      if (doubledError >= dy) {
        error += dy;
        x += directionX;
      }

      if (doubledError <= dx) {
        error += dx;
        y += directionY;
      }

      if (result.at(-1)![0] !== x || result.at(-1)![1] !== y)
        result.push([x, y]);
    }
  }

  return result.map(([x, y]) => [x * cellSize, y * cellSize]);
}

export function characterAt(path: RoutePath, index: number) {
  // Follow a real adjacent edge instead of averaging across a turn, which
  // could label a horizontal correction as another diagonal dash.
  const start =
    path[index === path.length - 1 ? Math.max(0, index - 1) : index];
  const end = path[Math.min(path.length - 1, index + 1)];
  const dx = Math.sign(end[0] - start[0]);
  const dy = Math.sign(end[1] - start[1]);

  return dx === 0 ? "|" : dy === 0 ? "-" : dx === dy ? "\\" : "/";
}

export function arrowAt(path: RoutePath, index: number, direction: number) {
  const point = path[index];
  const ahead = path[index + direction];
  const behind = path[index - direction];

  if (!ahead && !behind) {
    return direction > 0 ? "→" : "←";
  }

  const dx = Math.sign(ahead ? ahead[0] - point[0] : point[0] - behind[0]);
  const dy = Math.sign(ahead ? ahead[1] - point[1] : point[1] - behind[1]);

  if (dy === 0) {
    return dx > 0 ? "→" : "←";
  }

  if (dx === 0) {
    return dy > 0 ? "↓" : "↑";
  }

  return dy > 0 ? (dx > 0 ? "↘" : "↙") : dx > 0 ? "↗" : "↖";
}

export function nearestIndex(path: RoutePath, point: Point) {
  let best = 0;
  let distance = Infinity;
  path.forEach((candidate, index) => {
    const squaredDistance =
      (candidate[0] - point[0]) ** 2 + (candidate[1] - point[1]) ** 2;

    if (squaredDistance < distance) {
      distance = squaredDistance;
      best = index;
    }
  });

  return { index: best, distance };
}
