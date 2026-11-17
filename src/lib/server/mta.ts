import type {
  LiveTrain,
  RealtimeSnapshot,
  RealtimeFeed,
  TripDescriptor,
  TripUpdate,
  VehiclePosition,
} from "../types";
import protobuf from "protobufjs";
import schema from "../../data/gtfs/schema.json" with { type: "json" };

const FeedMessage = protobuf.Root.fromJSON(schema).lookupType(
  "transit_realtime.FeedMessage",
);
export const FEEDS = [
  "gtfs",
  "gtfs-ace",
  "gtfs-bdfm",
  "gtfs-g",
  "gtfs-jz",
  "gtfs-l",
  "gtfs-nqrw",
  "gtfs-si",
];
const BASE_URL =
  "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";
const ALIASES: Record<string, string> = {
  GS: "ST",
  S: "ST",
  FS: "SF",
  H: "SR",
  SI: "SIR",
  "6X": "6",
  "7X": "7",
  FX: "F",
};
export const MAX_AGE_SECONDS = 120;
interface FeedResult {
  fetchedAt: number;
  timestamp: number | null;
  trains: LiveTrain[];
  error: string | null;
  pending?: Promise<FeedResult>;
}
const cache = new Map<string, FeedResult>();
const histories = new Map<string, Map<string, LiveTrain>>();
const parentStop = (id: string | undefined) => id?.replace(/[NS]$/, "") || null;
const identity = (trip: TripDescriptor) =>
  `${trip.routeId}:${trip.startDate || ""}:${trip.tripId}`;
const extension = (trip: TripDescriptor) =>
  trip?.[".transit_realtime.nyctTripDescriptor"] || {};

export function decodeFeed(bytes: Uint8Array): RealtimeFeed {
  return FeedMessage.toObject(FeedMessage.decode(bytes), {
    longs: Number,
    enums: String,
  }) as RealtimeFeed;
}

export function normalizeFeed(
  feed: RealtimeFeed,
  feedId: string,
  history = new Map<string, LiveTrain>(),
  now = Date.now() / 1000,
) {
  const timestamp = Number(feed.header?.timestamp);
  if (
    !Number.isFinite(timestamp) ||
    now - timestamp > MAX_AGE_SECONDS ||
    timestamp > now + 60
  )
    return [];
  const trips = new Map<
    string,
    { trip: TripDescriptor; update?: TripUpdate; vehicle?: VehiclePosition }
  >();
  for (const entity of feed.entity || []) {
    if (entity.isDeleted) continue;
    const part = entity.tripUpdate || entity.vehicle;
    if (!part?.trip?.tripId) continue;
    const key = identity(part.trip);
    const entry = trips.get(key) || { trip: part.trip };
    if (entity.tripUpdate) entry.update = entity.tripUpdate;
    if (entity.vehicle) entry.vehicle = entity.vehicle;
    trips.set(key, entry);
  }
  const trains = [];
  for (const [key, { trip, update, vehicle }] of trips) {
    const ext = extension(trip);
    if (["CANCELED", "DELETED"].includes(trip.scheduleRelationship ?? ""))
      continue;
    // The feed also includes scheduled trips that have no physical train yet.
    if (ext.isAssigned === false || (!vehicle && ext.isAssigned !== true))
      continue;
    const updates = (update?.stopTimeUpdate || []).filter(
      (s) => s.scheduleRelationship !== "SKIPPED",
    );
    const stopId = parentStop(vehicle?.stopId || updates[0]?.stopId);
    if (!stopId) continue;
    const observedAt = Number(vehicle?.timestamp || timestamp);
    if (now - observedAt > MAX_AGE_SECONDS || observedAt > now + 30) continue;
    const stopIndex = updates.findIndex((s) => parentStop(s.stopId) === stopId);
    const stop = updates[stopIndex];
    const next = stopIndex >= 0 ? updates[stopIndex + 1] : null;
    const previous = history.get(key);
    const changed = previous && previous.stopId !== stopId;
    const status = vehicle
      ? vehicle.currentStatus || "IN_TRANSIT_TO"
      : "UNKNOWN";
    const direction: LiveTrain["direction"] =
      ext.direction === "NORTH"
        ? "N"
        : ext.direction === "SOUTH"
          ? "S"
          : ((vehicle?.stopId || updates[0]?.stopId || "").match(
              /[NS]$/,
            )?.[0] as "N" | "S" | undefined) || null;
    const train: LiveTrain = {
      id: `${feedId}:${key}`,
      routeId: ALIASES[trip.routeId] || trip.routeId,
      stopId,
      nextStopId: parentStop(next?.stopId),
      direction,
      status,
      arrivalAt: Number(stop?.arrival?.time || stop?.departure?.time) || null,
      updatedAt: observedAt,
      expiresAt: Math.min(timestamp, observedAt) + MAX_AGE_SECONDS,
      fromStopId: changed ? previous.stopId : previous?.fromStopId || null,
      departedAt: changed ? timestamp : previous?.departedAt || null,
      estimated: status !== "STOPPED_AT",
    };
    // Only animate across a segment after observing a station transition.
    if (train.departedAt && (train.arrivalAt ?? 0) <= train.departedAt)
      train.departedAt = null;
    history.set(key, train);
    trains.push(train);
  }
  for (const [key, train] of history)
    if (now - train.updatedAt > MAX_AGE_SECONDS) history.delete(key);
  return trains;
}

async function getFeed(id: string, now: number): Promise<FeedResult> {
  let entry = cache.get(id);
  if (entry?.pending) return entry.pending;
  if (entry && now - entry.fetchedAt < 15) return entry;
  const previous = entry;
  entry ||= { fetchedAt: 0, timestamp: null, trains: [], error: null };
  const pending: Promise<FeedResult> = (async () => {
    try {
      const response = await fetch(`${BASE_URL}${id}`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) throw Error(`MTA returned ${response.status}`);
      const feed = decodeFeed(new Uint8Array(await response.arrayBuffer()));
      const timestamp = Number(feed.header?.timestamp);
      if (
        !Number.isFinite(timestamp) ||
        now - timestamp > MAX_AGE_SECONDS ||
        timestamp > now + 60
      )
        throw Error("MTA feed timestamp is stale");
      if (!histories.has(id)) histories.set(id, new Map());
      const result = {
        fetchedAt: now,
        timestamp,
        trains: normalizeFeed(feed, id, histories.get(id), now),
        error: null,
      };
      cache.set(id, result);
      return result;
    } catch (error) {
      const result = {
        fetchedAt: now,
        timestamp: previous?.timestamp || null,
        trains: previous?.trains || [],
        error: error instanceof Error ? error.message : String(error),
      };
      cache.set(id, result);
      return result;
    }
  })();
  entry.pending = pending;
  cache.set(id, entry);
  return pending;
}

export async function getRealtimeTrains(): Promise<RealtimeSnapshot> {
  const now = Date.now() / 1000;
  const results = await Promise.all(FEEDS.map((id) => getFeed(id, now)));
  const feeds: RealtimeSnapshot["feeds"] = results.map((r, i) => ({
    id: FEEDS[i],
    timestamp: r.timestamp,
    status: r.error ? "unavailable" : "live",
    error: r.error,
  }));
  const trains = results.flatMap((r) =>
    r.trains
      .filter((t) => t.expiresAt > now)
      .map((t) => ({ ...t, stale: Boolean(r.error) })),
  );
  const available = feeds.filter((f) => f.status === "live").length;
  return {
    mode: "live",
    status:
      available === FEEDS.length
        ? "live"
        : available
          ? "partial"
          : "unavailable",
    serverTime: now,
    pollAfterMs: 15000,
    feeds,
    trains,
  };
}
