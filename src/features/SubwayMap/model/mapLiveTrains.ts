import type { GeoProjection } from "d3-geo";
import type {
  LiveTrain,
  RoutePath,
  StationMap,
  GtfsStops,
} from "@/types/transit";
import type { Route, SubwayOptions } from "../types";
import stationMapData from "@/data/station-map.json";
import gtfsStopsData from "@/data/gtfs/stops.json";
import { locateSchematicTrain } from "./livePositions";
import { GEOGRAPHIC_DENSITY } from "../constants";
import { nearestIndex } from "./geometry";

const stationSnapDistanceSquared = (4 * GEOGRAPHIC_DENSITY) ** 2;

const stationMap = stationMapData as StationMap;
const gtfsStops = gtfsStopsData as unknown as GtfsStops;

export function mapLiveTrains(
  routes: Route[],
  trains: LiveTrain[],
  layoutMode: SubwayOptions["layout"],
  project: GeoProjection,
  inset: GeoProjection,
) {
  for (const route of routes) route.liveTrains = [];
  let unmapped = 0;

  for (const train of trains) {
    const route = routes.find(
      (candidateRoute) => candidateRoute.id === train.routeId,
    );

    if (!route) {
      unmapped++;
      continue;
    }

    let path: RoutePath;
    let characters: RoutePath;
    let toIndex: number;
    let fromIndex: number | undefined;
    let direction: number;

    if (layoutMode === "orthogonal") {
      const position = locateSchematicTrain(train, stationMap[route.id]);

      if (!position) {
        unmapped++;
        continue;
      }
      path = route.paths[position.pathIndex];
      characters = route.characterPaths.get(path)!;
      const at = (progress: number) =>
        nearestIndex(characters, path[Math.round(progress * (path.length - 1))])
          .index;
      toIndex = at(position.to);
      fromIndex = position.from === undefined ? undefined : at(position.from);
      direction = position.direction;
    } else {
      const station = gtfsStops[train.stopId];

      if (!station) {
        unmapped++;
        continue;
      }

      const projection = route.id === "SIR" ? inset : project;
      const point = projection(station.p)!;
      const candidates = [...route.characterPaths].map(
        ([candidatePath, characterPoints]) => ({
          path: candidatePath,
          characters: characterPoints,
          ...nearestIndex(characterPoints, point),
        }),
      );
      candidates.sort((a, b) => a.distance - b.distance);
      const match = candidates[0];

      if (!match || match.distance > stationSnapDistanceSquared) {
        unmapped++;
        continue;
      }
      path = match.path;
      characters = match.characters;
      toIndex = match.index;
      const previous = gtfsStops[train.fromStopId ?? ""];

      if (previous) {
        const from = nearestIndex(characters, projection(previous.p)!);

        if (from.distance <= stationSnapDistanceSquared) {
          fromIndex = from.index;
        }
      }

      const next = gtfsStops[train.nextStopId ?? ""];
      direction = next
        ? Math.sign(
            nearestIndex(characters, projection(next.p)!).index - toIndex,
          )
        : Math.sign(toIndex - (fromIndex ?? toIndex));
      direction ||= train.direction === "S" ? 1 : -1;
    }
    route.liveTrains.push({
      ...train,
      path,
      characters,
      toIndex,
      fromIndex,
      direction,
    });
  }

  return { mapped: trains.length - unmapped, unmapped };
}
