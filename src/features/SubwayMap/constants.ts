import { routeOrder } from "@/data/routes";
import type { SubwayOptions } from "./types";
import { DEFAULT_VISUAL_PRESET, VISUAL_PRESETS } from "./presets";

export const DEFAULT_OPTIONS: SubwayOptions = {
  dataMode: "live",
  layout: "orthogonal",
  routes: routeOrder,
  speed: 1,
  playing: true,
  zoom: 1,
  ...VISUAL_PRESETS[DEFAULT_VISUAL_PRESET],
};

export const CONTROL_PANEL_ID = "ny-subway";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const CELL_SIZE = 2;
export const GEOGRAPHIC_DENSITY = 3;
export const FONT_SCALE = 2.65;
export const TRACK_OPACITY = 0.35;
export const MAX_FRAME_DELTA = 0.08;
export const POLL_INTERVAL_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 12_000;
