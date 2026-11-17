import type { LiveTrain, StationBranch } from "@/types/transit";
type StationPosition = Pick<LiveTrain, "stopId"> &
  Partial<Pick<LiveTrain, "nextStopId" | "fromStopId" | "direction">>;
export interface InterpolatedPosition {
  fromIndex?: number;
  toIndex: number;
  status: string;
  stale?: boolean;
  departedAt?: number | null;
  arrivalAt?: number | null;
}

// Each service has its own station positions; shared complexes do not imply shared tracks.

export function locateSchematicTrain(
  train: StationPosition,
  branches: StationBranch[] = [],
) {
  const candidates = branches
    .map((branch, pathIndex) => ({ branch, pathIndex }))
    .filter(({ branch }) => branch.stops[train.stopId] !== undefined);
  const score = ({ branch }: { branch: StationBranch }) =>
    (branch.stops[train.nextStopId ?? ""] !== undefined ? 2 : 0) +
    (branch.stops[train.fromStopId ?? ""] !== undefined ? 1 : 0);
  candidates.sort((a, b) => score(b) - score(a));
  const match = candidates[0];

  if (!match) {
    return null;
  }

  const { branch, pathIndex } = match;
  const to = branch.stops[train.stopId]!;
  const from = branch.stops[train.fromStopId ?? ""];
  const next = branch.stops[train.nextStopId ?? ""];
  const direction =
    Math.sign((next ?? NaN) - to) ||
    Math.sign(to - (from ?? NaN)) ||
    branch.northDirection * (train.direction === "S" ? -1 : 1);

  return { pathIndex, to, from, direction };
}

export function liveProgress(train: InterpolatedPosition, now: number) {
  if (
    train.status === "STOPPED_AT" ||
    train.stale ||
    train.fromIndex === undefined ||
    !train.departedAt ||
    !train.arrivalAt ||
    train.arrivalAt <= train.departedAt
  )
    return train.toIndex;
  const fraction = Math.max(
    0,
    Math.min(
      1,
      (now - train.departedAt) / (train.arrivalAt - train.departedAt),
    ),
  );

  return train.fromIndex + (train.toIndex - train.fromIndex) * fraction;
}
