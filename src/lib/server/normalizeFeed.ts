import type {
  LiveTrain,
  RealtimeFeed,
  TripDescriptor,
  TripUpdate,
  VehiclePosition,
} from "@/types/transit";

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
const parentStop = (id: string | undefined) => id?.replace(/[NS]$/, "") || null;
const identity = (trip: TripDescriptor) =>
  `${trip.routeId}:${trip.startDate || ""}:${trip.tripId}`;
const extension = (trip: TripDescriptor) =>
  trip?.[".transit_realtime.nyctTripDescriptor"] || {};

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
    if (entity.isDeleted) {
      continue;
    }

    const part = entity.tripUpdate || entity.vehicle;

    if (!part?.trip?.tripId) {
      continue;
    }

    const key = identity(part.trip);
    const entry = trips.get(key) || { trip: part.trip };

    if (entity.tripUpdate) {
      entry.update = entity.tripUpdate;
    }

    if (entity.vehicle) {
      entry.vehicle = entity.vehicle;
    }
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

    if (!stopId) {
      continue;
    }

    const observedAt = Number(vehicle?.timestamp || timestamp);

    if (now - observedAt > MAX_AGE_SECONDS || observedAt > now + 30) {
      continue;
    }

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
    if (now - train.updatedAt > MAX_AGE_SECONDS) {
      history.delete(key);
    }

  return trains;
}
