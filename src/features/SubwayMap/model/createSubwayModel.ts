import { geoMercator } from "d3-geo";
import type { FeatureCollection, LineString } from "geojson";
import type { LiveTrain, RoutePath } from "@/types/transit";
import type { Route, AsciiCell, SubwayOptions } from "../types";
import mapData from "@/data/subway.json";
import { colors, routeOrder, cleanRoutes } from "@/data/routes";
import { gridPath, cleanPath, characterPath, characterAt } from "./geometry";
import { mapLiveTrains } from "./mapLiveTrains";
import { advanceSimulation, seedSimulation } from "./simulation";

export function createSubwayModel(
  layout: SubwayOptions["layout"],
  route: string,
) {
  let layoutMode = layout;
  let selectedRoute = route;
  let liveTrains: LiveTrain[] = [];
  const data = {
    routes: structuredClone(mapData.routes).map((route): Route => ({
      id: route.id,
      lines: route.lines as RoutePath[],
      paths: [],
      cells: new Map(),
      trains: [],
      liveTrains: [],
      characterPaths: new Map(),
    })),
  };
  data.routes.sort(
    (a, b) => routeOrder.indexOf(a.id) - routeOrder.indexOf(b.id),
  );

  const collection = (routes: Route[]): FeatureCollection<LineString> => ({
    type: "FeatureCollection",
    features: routes.flatMap((route) =>
      route.lines.map((line) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: line },
      })),
    ),
  });
  const project = geoMercator().fitExtent(
    [
      [15, 12],
      [209, 217],
    ],
    collection(data.routes.filter((route) => route.id !== "SIR")),
  );
  const inset = geoMercator().fitExtent(
    [
      [12, 157],
      [45, 208],
    ],
    collection(data.routes.filter((route) => route.id === "SIR")),
  );

  function rebuildRoutes() {
    for (const route of data.routes) {
      const projection = route.id === "SIR" ? inset : project;
      route.paths =
        layoutMode === "orthogonal"
          ? cleanRoutes[route.id].map(cleanPath)
          : route.lines.map((line) => gridPath(line, projection));
      route.cells = new Map();

      for (const path of route.paths) {
        for (const point of path) {
          route.cells.set(point.join(","), point);
        }
      }

      route.trains = seedSimulation(route);
    }
  }

  function getActiveRoutes() {
    return selectedRoute === "all"
      ? data.routes
      : data.routes.filter((route) => route.id === selectedRoute);
  }

  const phosphor = Object.fromEntries(
    Object.entries(colors).map(([id, hex]) => {
      const rgb = [1, 3, 5].map((i) =>
        Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.78 + 255 * 0.22),
      );

      return [id, `rgb(${rgb.join(",")})`];
    }),
  );
  let asciiCells: (AsciiCell & { char: string })[] = [];
  let occupiedCells = new Set<string>();
  let asciiRevision = 0;

  function rebuildAsciiCells() {
    const cells = new Map<string, AsciiCell>();

    for (const route of data.routes) {
      route.characterPaths = new Map(
        route.paths.map((path) => [path, characterPath(path, layoutMode)]),
      );

      for (const train of route.trains) {
        train.characters = route.characterPaths.get(train.path)!;
      }
    }

    for (const route of getActiveRoutes()) {
      for (const path of route.characterPaths.values()) {
        for (let i = 0; i < path.length; i++) {
          const point = path[i];
          const key = point.join(",");
          const char = characterAt(path, i);

          if (!cells.has(key)) {
            cells.set(key, { point, colors: [], chars: new Set() });
          }

          const entry = cells.get(key)!;

          if (!entry.colors.includes(phosphor[route.id])) {
            entry.colors.push(phosphor[route.id]);
          }

          entry.chars.add(char);
        }
      }
    }

    occupiedCells = new Set(cells.keys());
    asciiRevision++;
    asciiCells = [...cells.values()].map((c) => ({
      ...c,
      char: c.chars.size > 1 ? "+" : [...c.chars][0],
    }));
  }

  rebuildRoutes();
  rebuildAsciiCells();

  return {
    get routes() {
      return data.routes;
    },
    get activeRoutes() {
      return getActiveRoutes();
    },
    get cells() {
      return asciiCells;
    },
    get occupiedCells() {
      return occupiedCells;
    },
    get revision() {
      return asciiRevision;
    },
    phosphor,
    setLayout(nextLayout: SubwayOptions["layout"], nextRoute: string) {
      const layoutChanged = nextLayout !== layoutMode;
      const routeChanged = nextRoute !== selectedRoute;
      layoutMode = nextLayout;
      selectedRoute = nextRoute;

      if (layoutChanged) {
        rebuildRoutes();
      }

      if (layoutChanged || routeChanged) {
        rebuildAsciiCells();
        mapLiveTrains(data.routes, liveTrains, layoutMode, project, inset);
      }
    },
    setLiveTrains(trains: LiveTrain[]) {
      liveTrains = trains;

      return mapLiveTrains(data.routes, trains, layoutMode, project, inset);
    },
    advance(delta: number, speed: number) {
      advanceSimulation(data.routes, delta, speed);
    },
  };
}

export type SubwayModel = ReturnType<typeof createSubwayModel>;
