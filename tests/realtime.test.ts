import { normalizeFeed } from "../src/lib/server/normalizeFeed.ts";
import type { RealtimeFeed, StationMap, GtfsStops } from "../src/types/transit";
import test from "node:test";
import assert from "node:assert/strict";
import { getRealtimeTrains, FEEDS } from "../src/lib/server/mta.ts";
import {
  locateSchematicTrain,
  liveProgress,
} from "../src/features/SubwayMap/model/livePositions.ts";
import stationMapData from "../src/data/station-map.json" with { type: "json" };
import stopsData from "../src/data/gtfs/stops.json" with { type: "json" };
import schema from "../src/data/gtfs/schema.json" with { type: "json" };
import protobuf from "protobufjs";
const stationMap: StationMap = stationMapData;
const stops = stopsData as unknown as GtfsStops;
const ext = ".transit_realtime.nyctTripDescriptor";
const now = 10000;
function fixture({
  assigned = true,
  status = "IN_TRANSIT_TO",
  observedAt = now,
  stopId = "127S",
  arrivalAt = now + 60,
  routeId = "1",
  relationship,
}: {
  assigned?: boolean;
  status?: string;
  observedAt?: number;
  stopId?: string;
  arrivalAt?: number;
  routeId?: string;
  relationship?: string;
} = {}): RealtimeFeed & {
  header: NonNullable<RealtimeFeed["header"]>;
  entity: NonNullable<RealtimeFeed["entity"]>;
} {
  const trip = {
    tripId: "test-trip",
    startDate: "20261116",
    routeId,
    [ext]: { isAssigned: assigned },
    scheduleRelationship: relationship,
  };
  return {
    header: { timestamp: now },
    entity: [
      {
        tripUpdate: {
          trip,
          stopTimeUpdate: [
            { stopId, arrival: { time: arrivalAt } },
            { stopId: "128S", arrival: { time: now + 180 } },
          ],
        },
      },
      {
        vehicle: { trip, stopId, timestamp: observedAt, currentStatus: status },
      },
    ],
  };
}
test("trip update and vehicle become one train; directional platform IDs normalize", () => {
  const trains = normalizeFeed(fixture(), "gtfs", new Map(), now);
  assert.equal(trains.length, 1);
  assert.equal(trains[0].stopId, "127");
  assert.equal(trains[0].nextStopId, "128");
  assert.equal(trains[0].direction, "S");
});
test("reject unassigned, canceled, stale, and future vehicle observations", () => {
  for (const options of [
    { assigned: false },
    { relationship: "CANCELED" },
    { observedAt: now - 121 },
    { observedAt: now + 300 },
  ])
    assert.equal(
      normalizeFeed(fixture(options), "gtfs", new Map(), now).length,
      0,
    );
  const stale = fixture();
  stale.header.timestamp = now - 121;
  assert.equal(normalizeFeed(stale, "gtfs", new Map(), now).length, 0);
});
test("missing vehicle status defaults to IN_TRANSIT_TO, and express route aliases normalize", () => {
  const feed = fixture({ routeId: "6X" });
  delete feed.entity[1].vehicle!.currentStatus;
  const [train] = normalizeFeed(feed, "gtfs", new Map(), now);
  assert.equal(train.status, "IN_TRANSIT_TO");
  assert.equal(train.routeId, "6");
});
test("only observed station transitions create a travel interval", () => {
  const history = new Map();
  const [first] = normalizeFeed(fixture(), "gtfs", history, now);
  assert.equal(first.fromStopId, null);
  const next = fixture({
    stopId: "128S",
    arrivalAt: now + 90,
    observedAt: now + 15,
  });
  next.header.timestamp = now + 15;
  const [second] = normalizeFeed(next, "gtfs", history, now + 15);
  assert.equal(second.fromStopId, "127");
  assert.equal(second.departedAt, now + 15);
});
test("interpolation stops at stations and never runs past an arrival", () => {
  const train = {
    fromIndex: 10,
    toIndex: 20,
    departedAt: 100,
    arrivalAt: 200,
    status: "IN_TRANSIT_TO",
  };
  assert.equal(liveProgress(train, 150), 15);
  assert.equal(liveProgress(train, 500), 20);
  assert.equal(liveProgress(train, 50), 10);
  assert.equal(liveProgress({ ...train, status: "STOPPED_AT" }, 150), 20);
  assert.equal(liveProgress({ ...train, stale: true }, 150), 20);
});
test("Rockaway branch selected using neighboring stations", () => {
  assert.equal(
    locateSchematicTrain(
      { stopId: "H04", nextStopId: "H06", direction: "S" },
      stationMap.A,
    )!.pathIndex,
    1,
  );
  assert.equal(
    locateSchematicTrain(
      { stopId: "H04", nextStopId: "H12", direction: "S" },
      stationMap.A,
    )!.pathIndex,
    2,
  );
  assert.equal(
    locateSchematicTrain({ stopId: "A61", nextStopId: "A63" }, stationMap.A)!
      .pathIndex,
    0,
  );
});
test("unrepresented branches are omitted instead of snapped onto another track", () => {
  assert.equal(locateSchematicTrain({ stopId: "204" }, stationMap["5"]), null);
});
test("all 26 service station sequences are monotonic, bounded, and use known IDs", () => {
  assert.equal(Object.keys(stationMap).length, 26);
  for (const branches of Object.values(stationMap))
    for (const branch of branches) {
      let previous = -1;
      for (const id of branch.order) {
        assert.ok(stops[id]);
        const position = branch.stops[id];
        assert.ok(position !== undefined);
        assert.ok(position >= 0 && position <= 1);
        assert.ok(position > previous);
        previous = position;
      }
    }
});
test("API coalesces requests, retains partial results, and expires failed feeds", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let currentTime = Math.floor(originalNow() / 1000);
  const initialTime = currentTime;
  Date.now = () => currentTime * 1000;
  let calls = 0;
  const Feed = protobuf.Root.fromJSON(schema).lookupType(
    "transit_realtime.FeedMessage",
  );
  const payload = fixture({
    observedAt: initialTime,
    arrivalAt: initialTime + 60,
  });
  payload.header = { gtfsRealtimeVersion: "1.0", timestamp: initialTime };
  payload.entity.forEach((entity, i) => {
    entity.id = String(i);
  });
  const bytes = Feed.encode(Feed.fromObject(payload)).finish();
  let failureMode = "none";
  globalThis.fetch = async (url) => {
    calls++;
    if (
      failureMode === "all" ||
      (failureMode === "partial" && String(url).endsWith("gtfs-ace"))
    )
      throw Error("Feed offline");
    return new Response(Uint8Array.from(bytes));
  };
  try {
    const [a, b] = await Promise.all([
      getRealtimeTrains(),
      getRealtimeTrains(),
    ]);
    assert.equal(calls, FEEDS.length);
    assert.equal(a.status, "live");
    assert.equal(b.trains.length, FEEDS.length);
    await getRealtimeTrains();
    assert.equal(calls, FEEDS.length);

    currentTime += 16;
    failureMode = "partial";
    const partial = await getRealtimeTrains();
    assert.equal(partial.status, "partial");
    assert.equal(partial.trains.filter((train) => train.stale).length, 1);

    currentTime += 16;
    failureMode = "all";
    const unavailable = await getRealtimeTrains();
    assert.equal(unavailable.status, "unavailable");
    assert.ok(unavailable.trains.length > 0);
    assert.ok(unavailable.trains.every((train) => train.stale));

    currentTime = initialTime + 121;
    const expired = await getRealtimeTrains();
    assert.equal(expired.trains.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
