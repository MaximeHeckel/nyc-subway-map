import type { SubwayOptions } from "./types";

export const DEFAULT_OPTIONS: SubwayOptions = {
  dataMode: "live",
  layout: "orthogonal",
  route: "all",
  speed: 1,
  trainLength: 1,
  glow: true,
  glowIntensity: 0.6,
  bloom: true,
  bloomIntensity: 1.5,
  trackBloom: 0.35,
  crt: true,
  crtIntensity: 0.25,
  playing: true,
  zoom: 1,
};

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
export const CELL_SIZE = 2;
export const GEOGRAPHIC_DENSITY = 3;
export const FONT_SCALE = 2.65;
export const TRACK_OPACITY = 0.35;
export const MAX_FRAME_DELTA = 0.08;
export const POLL_INTERVAL_MS = 15_000;
export const REQUEST_TIMEOUT_MS = 12_000;
