import type { Point } from "@/types/transit";
import type { MappedTrain, SimulatedTrain } from "../types";
import { arrowAt, characterAt } from "./geometry";
import { liveProgress } from "./livePositions";

export interface TrainGlyph {
  character: string;
  point: Point;
  isHead: boolean;
}

export function getTrainGlyphs(
  train: MappedTrain | SimulatedTrain,
  length: 1 | 2,
  now: number,
): TrainGlyph[] {
  if ("expiresAt" in train && now >= train.expiresAt) {
    return [];
  }

  const path = train.characters;
  const progress =
    "toIndex" in train
      ? liveProgress(train, now)
      : (train.pos / Math.max(1, train.path.length - 1)) * (path.length - 1);
  const headIndex = Math.round(progress);
  const seen = new Set<string>();
  const glyphs: TrainGlyph[] = [];

  for (let segment = length - 1; segment >= 0; segment--) {
    let index = headIndex - segment * train.direction;

    // Fold the tail inward at a terminus, without covering the head.
    if (index < 0 || index >= path.length) {
      index = headIndex + segment * train.direction;
    }

    index = Math.max(0, Math.min(path.length - 1, index));
    const point = path[index];
    const key = point.join(",");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const isHead = segment === 0;
    const character = isHead
      ? arrowAt(path, index, train.direction)
      : characterAt(path, index);
    glyphs.push({ character, point, isHead });
  }

  return glyphs;
}
