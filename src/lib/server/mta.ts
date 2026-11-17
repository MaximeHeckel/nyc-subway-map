import { normalizeFeed, MAX_AGE_SECONDS } from "./normalizeFeed";
import type {
  LiveTrain,
  RealtimeSnapshot,
  RealtimeFeed,
} from "@/types/transit";
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

interface FeedResult {
  fetchedAt: number;
  timestamp: number | null;
  trains: LiveTrain[];
  error: string | null;
  pending?: Promise<FeedResult>;
}

const cache = new Map<string, FeedResult>();
const histories = new Map<string, Map<string, LiveTrain>>();

export function decodeFeed(bytes: Uint8Array): RealtimeFeed {
  return FeedMessage.toObject(FeedMessage.decode(bytes), {
    longs: Number,
    enums: String,
  }) as RealtimeFeed;
}

async function getFeed(id: string, now: number): Promise<FeedResult> {
  let entry = cache.get(id);

  if (entry?.pending) {
    return entry.pending;
  }

  if (entry && now - entry.fetchedAt < 15) {
    return entry;
  }

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

      if (!histories.has(id)) {
        histories.set(id, new Map());
      }

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
