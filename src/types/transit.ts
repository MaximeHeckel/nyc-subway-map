export type Point = [number, number];
export type RoutePath = Point[];

export interface LiveTrain {
  id: string;
  routeId: string;
  stopId: string;
  nextStopId: string | null;
  fromStopId: string | null;
  direction: "N" | "S" | null;
  status: string;
  arrivalAt: number | null;
  departedAt: number | null;
  updatedAt: number;
  expiresAt: number;
  estimated: boolean;
  stale?: boolean;
}

export interface RealtimeSnapshot {
  mode: "live";
  status: "live" | "partial" | "unavailable";
  serverTime: number;
  pollAfterMs: number;
  feeds: {
    id: string;
    timestamp: number | null;
    status: "live" | "unavailable";
    error: string | null;
  }[];
  trains: LiveTrain[];
}

export interface StationBranch {
  stops: Record<string, number | undefined>;
  order: string[];
  northDirection: number;
}
export type StationMap = Record<string, StationBranch[]>;
export type GtfsStops = Record<string, { name: string; p: Point }>;
export type GtfsPatterns = Record<string, { stops: string[]; count: number }[]>;

export interface TripDescriptor {
  tripId?: string;
  routeId: string;
  startDate?: string;
  scheduleRelationship?: string;
  ".transit_realtime.nyctTripDescriptor"?: {
    isAssigned?: boolean;
    direction?: string;
  };
}
export interface TripUpdate {
  trip: TripDescriptor;
  stopTimeUpdate?: {
    stopId?: string;
    scheduleRelationship?: string;
    arrival?: { time?: number };
    departure?: { time?: number };
  }[];
}
export interface VehiclePosition {
  trip: TripDescriptor;
  stopId?: string;
  timestamp?: number;
  currentStatus?: string;
}
export interface RealtimeFeed {
  header?: { timestamp?: number; gtfsRealtimeVersion?: string };
  entity?: {
    id?: string;
    isDeleted?: boolean;
    tripUpdate?: TripUpdate;
    vehicle?: VehiclePosition;
  }[];
}
