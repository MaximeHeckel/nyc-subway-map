import { routeOrder } from "../src/data/routes";
import { getTrainGlyphs } from "../src/features/SubwayMap/model/trainGlyphs";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import type { LiveTrain, StationMap } from "../src/types/transit";
import { createSubwayModel } from "../src/features/SubwayMap/model/createSubwayModel";
import { createViewport } from "../src/features/SubwayMap/canvas/createViewport";
import stationMapData from "../src/data/station-map.json" with { type: "json" };

const stationMap: StationMap = stationMapData;
const trains: LiveTrain[] = Object.entries(stationMap).flatMap(
  ([routeId, branches]) =>
    branches.flatMap((branch) =>
      branch.order.map((stopId, index) => ({
        id: `${routeId}:${stopId}:${index}`,
        routeId,
        stopId,
        fromStopId: branch.order[index - 1] ?? null,
        nextStopId: branch.order[index + 1] ?? null,
        direction: "S" as const,
        status: "IN_TRANSIT_TO",
        arrivalAt: 1060,
        departedAt: 1000,
        updatedAt: 1000,
        expiresAt: 1120,
        estimated: true,
      })),
    ),
);

// Captured from the original renderer before extraction. Cover all station
// mappings, ASCII cells, seeded trains and geometry, not just route counts.
const baselines = {
  orthogonal: {
    all: "e6f4a0e7866bee6d980d2da61cc3e044fa52e851b3df374865596738c7dc1e31",
    A: "a048ab7555eb00a60ecead916b69c2f349f385d17f3b4696f93b570753ecb9bd",
    SIR: "947bdc581716cdf83c7af5c9784816fbf4be7514784ca2b51d70fe53267fad5f",
  },
};

for (const layout of ["orthogonal"] as const) {
  for (const route of ["all", "A", "SIR"] as const) {
    test(`${layout}/${route} preserves the original map and train placements`, () => {
      const model = createSubwayModel(
        layout,
        route === "all" ? routeOrder : [route],
      );
      const coverage = model.setLiveTrains(trains);
      const state = {
        routes: model.routes.map((route) => ({
          id: route.id,
          paths: route.paths,
          characters: [...route.characterPaths.values()],
          trains: route.trains,
          liveTrains: route.liveTrains,
        })),
        cells: model.cells.map(({ point, colors, char }) => ({
          p: point,
          colors,
          char,
        })),
        coverage,
      };
      const digest = createHash("sha256")
        .update(JSON.stringify(state))
        .digest("hex");

      assert.equal(digest, baselines[layout][route]);
    });
  }
}

test("geographic routes retain a fine, continuous eight-direction grid", () => {
  const model = createSubwayModel("geographic", routeOrder);

  // The coarse map had 1,057 cells: nearby corridors need more room than that.
  assert.ok(model.cells.length > 2500);
  assert.ok(
    model.cells.filter((cell) => cell.colors.length > 1).length /
      model.cells.length <
      0.3,
  );

  for (const route of model.routes) {
    for (const path of route.characterPaths.values()) {
      assert.ok(path.length > 0);

      path.forEach(([x, y], index) => {
        assert.equal(x % 2, 0);
        assert.equal(y % 2, 0);

        if (index === 0) return;

        const previous = path[index - 1];
        assert.equal(
          Math.max(Math.abs(x - previous[0]), Math.abs(y - previous[1])),
          2,
        );
      });
    }
  }
});

test("geographic trains remain on their service's character paths in both directions", () => {
  const model = createSubwayModel("geographic", routeOrder);

  for (const direction of ["N", "S"] as const) {
    const coverage = model.setLiveTrains(
      trains.map((train) => ({ ...train, direction })),
    );
    assert.ok(coverage.mapped / trains.length > 0.95);

    for (const route of model.routes) {
      for (const train of route.liveTrains) {
        assert.ok(
          [...route.characterPaths.values()].includes(train.characters),
        );

        for (const time of [1000, 1030, 1060]) {
          for (const glyph of getTrainGlyphs(train, 2, time)) {
            assert.ok(train.characters.includes(glyph.point));
          }
        }
      }
    }
  }
});

test("layout changes remap retained trains onto the new character paths", () => {
  const model = createSubwayModel("orthogonal", routeOrder);
  model.setLiveTrains(trains);
  model.setLayout("geographic", ["A"]);

  const fresh = createSubwayModel("geographic", ["A"]);
  fresh.setLiveTrains(trains);

  assert.deepEqual(model.routes, fresh.routes);
  assert.deepEqual(model.cells, fresh.cells);
});

test("camera keeps the cursor anchor stable and bounds pan and zoom", () => {
  const model = createSubwayModel("orthogonal", routeOrder);
  const camera = createViewport();
  camera.fit(1600, 900, model.routes);
  camera.setZoom(3, 600, 300);

  assert.equal((600 - camera.view.panX) / camera.view.zoom, 600);
  assert.equal((300 - camera.view.panY) / camera.view.zoom, 300);

  camera.panBy(-10000, 10000);
  assert.equal(camera.view.panX, -3200);
  assert.equal(camera.view.panY, 0);

  camera.setZoom(0);
  assert.equal(camera.view.zoom, 1);
  assert.equal(camera.view.panX, 0);
  assert.equal(camera.view.panY, 0);
});

test("two-character trains fold tails at termini without duplicating the head", () => {
  const path: [number, number][] = [
    [0, 0],
    [2, 0],
    [4, 0],
  ];
  const train = { path, characters: path, pos: 0, direction: 1 };

  assert.deepEqual(getTrainGlyphs(train, 2, 1000), [
    { character: "-", point: [2, 0], isHead: false },
    { character: "→", point: [0, 0], isHead: true },
  ]);

  train.pos = 2;
  train.direction = -1;
  assert.deepEqual(getTrainGlyphs(train, 2, 1000), [
    { character: "-", point: [2, 0], isHead: false },
    { character: "←", point: [4, 0], isHead: true },
  ]);
  assert.equal(getTrainGlyphs(train, 1, 1000).length, 1);
});

test("simulation reverses at endpoints without leaving its path", () => {
  const model = createSubwayModel("orthogonal", routeOrder);
  model.advance(10000, 3);

  for (const route of model.routes) {
    for (const train of route.trains) {
      assert.ok(train.pos === 0 || train.pos === train.path.length - 1);
      assert.equal(train.direction, train.pos === 0 ? 1 : -1);
    }
  }
});

for (const layout of ["orthogonal", "geographic"] as const) {
  test(`${layout} filters multiple services and restores all without rebuilding on equivalent selections`, () => {
    const model = createSubwayModel(layout, routeOrder);
    const allCells = model.cells;
    const paths = model.routes.map((route) => route.paths);
    model.setLiveTrains(trains);
    model.setLayout(layout, ["A", "C"]);

    assert.deepEqual(
      model.activeRoutes.map((route) => route.id),
      ["A", "C"],
    );
    const selectedCells = new Set(
      model.activeRoutes.flatMap((route) =>
        [...route.characterPaths.values()].flatMap((path) =>
          path.map((point) => point.join(",")),
        ),
      ),
    );
    assert.deepEqual(model.occupiedCells, selectedCells);
    assert.ok(model.activeRoutes.every((route) => route.liveTrains.length > 0));

    const revision = model.revision;
    model.setLayout(layout, ["C", "A", "A"]);
    assert.equal(model.revision, revision);
    assert.deepEqual(
      model.routes.map((route) => route.paths),
      paths,
    );

    model.setLayout(layout, []);
    assert.equal(model.activeRoutes.length, 0);
    assert.equal(model.cells.length, 0);

    model.setLayout(layout, routeOrder);
    assert.deepEqual(model.cells, allCells);
  });
}
