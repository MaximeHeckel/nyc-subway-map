import type { Route, SimulatedTrain } from "../types";

export function advanceSimulation(routes: Route[], dt: number, speed: number) {
  for (const route of routes) {
    for (const train of route.trains) {
      train.pos += dt * speed * 8 * train.direction;

      if (train.pos >= train.path.length - 1) {
        train.pos = train.path.length - 1;
        train.direction = -1;
      }

      if (train.pos <= 0) {
        train.pos = 0;
        train.direction = 1;
      }
    }
  }
}

export function seedSimulation(route: Route, density = 1): SimulatedTrain[] {
  const trains: SimulatedTrain[] = [];
  const usablePaths = route.paths.filter((path) => path.length >= 5);
  const totalLength = usablePaths.reduce(
    (total, path) => total + path.length,
    0,
  );
  const count = Math.max(1, Math.round(route.cells.size / (95 * density)));

  for (let i = 0; i < count && totalLength; i++) {
    let distance = (totalLength * (i + 0.35)) / count;
    let path = usablePaths[0];

    for (const candidate of usablePaths) {
      path = candidate;

      if (distance < candidate.length) {
        break;
      }

      distance -= candidate.length;
    }

    trains.push({
      path,
      characters: [],
      pos: Math.min(distance, path.length - 1),
      direction: i % 2 ? -1 : 1,
    });
  }

  return trains;
}
