import { geoMercator } from "d3-geo";
import type { FeatureCollection, LineString } from "geojson";
import type { LiveTrain, RoutePath, Point } from "@/types/transit";
import type { Route, AsciiCell, SubwayOptions } from "../types";
import mapData from "@/data/subway.json";
import { colors, routeOrder, cleanRoutes } from "@/data/routes";
import { gridPath, cleanPath, characterPath, characterAt } from "./geometry";
import { GEOGRAPHIC_DENSITY } from "../constants";
import { mapLiveTrains } from "./mapLiveTrains";
import { advanceSimulation, seedSimulation } from "./simulation";

export function createSubwayModel(
  layout: SubwayOptions["layout"],
  routes: readonly string[],
) {
  let layoutMode = layout;
  let selectedRoutes = new Set(routes);
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

  // More grid coordinates resolve neighboring corridors without changing framing.
  for (const projection of [project, inset]) {
    projection.scale(projection.scale() * GEOGRAPHIC_DENSITY);
    projection.translate(
      projection
        .translate()
        .map((value) => value * GEOGRAPHIC_DENSITY) as Point,
    );
  }

  function density() {
    return layoutMode === "geographic" ? GEOGRAPHIC_DENSITY : 1;
  }

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

      route.trains = seedSimulation(route, density());
    }
  }

  function getActiveRoutes() {
    return data.routes.filter((route) => selectedRoutes.has(route.id));
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
            cells.set(key, {
              point,
              colors: [],
              routeIds: [],
              chars: new Set(),
            });
          }

          const entry = cells.get(key)!;

          if (!entry.routeIds.includes(route.id)) {
            entry.routeIds.push(route.id);
          }

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
    get density() {
      return density();
    },
    get revision() {
      return asciiRevision;
    },
    phosphor,
    setLayout(
      nextLayout: SubwayOptions["layout"],
      nextRoutes: readonly string[],
    ) {
      const layoutChanged = nextLayout !== layoutMode;
      const nextSelection = new Set(nextRoutes);
      const routeChanged =
        nextSelection.size !== selectedRoutes.size ||
        [...nextSelection].some((route) => !selectedRoutes.has(route));
      layoutMode = nextLayout;
      selectedRoutes = nextSelection;

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
      advanceSimulation(data.routes, delta, speed * density());
    },
  };
}

export type SubwayModel = ReturnType<typeof createSubwayModel>;
