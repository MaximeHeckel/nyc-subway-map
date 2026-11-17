import { useMemo } from "react";
import { useDialKitController, type DialConfig } from "dialkit";
import { routeOrder } from "@/data/routes";
import type { SubwayOptions } from "../types";
import { DEFAULT_OPTIONS, MIN_ZOOM, MAX_ZOOM } from "../constants";

const controlConfig = {
  data: {
    type: "select",
    default: DEFAULT_OPTIONS.dataMode,
    options: [
      { label: "Live MTA", value: "live" },
      { label: "Simulation", value: "simulation" },
    ],
  },
  layout: {
    type: "select",
    default: DEFAULT_OPTIONS.layout,
    options: [
      { label: "Schematic", value: "orthogonal" },
      { label: "Geographic", value: "geographic" },
    ],
  },
  route: {
    type: "select",
    default: DEFAULT_OPTIONS.route,
    options: [{ label: "All services", value: "all" }, ...routeOrder],
  },
  trainLength: {
    type: "select",
    default: String(DEFAULT_OPTIONS.trainLength),
    options: [
      { label: "1 character (arrow)", value: "1" },
      { label: "2 characters", value: "2" },
    ],
  },
  playing: DEFAULT_OPTIONS.playing,
  simSpeed: [DEFAULT_OPTIONS.speed, 0.25, 3, 0.25],
  zoom: [DEFAULT_OPTIONS.zoom, MIN_ZOOM, MAX_ZOOM, 0.01],
  glow: DEFAULT_OPTIONS.glow,
  glowIntensity: [DEFAULT_OPTIONS.glowIntensity, 0, 4, 0.1],
  bloom: DEFAULT_OPTIONS.bloom,
  bloomIntensity: [DEFAULT_OPTIONS.bloomIntensity, 0, 3, 0.1],
  trackBloom: [DEFAULT_OPTIONS.trackBloom, 0, 1, 0.05],
  crt: DEFAULT_OPTIONS.crt,
  crtStrength: [DEFAULT_OPTIONS.crtIntensity, 0, 1.5, 0.05],
} satisfies DialConfig;

export function useSubwayControls() {
  const { values, setValues } = useDialKitController(
    "Controls",
    controlConfig,
    {
      id: "ny-subway",
    },
  );
  const controls = useMemo<SubwayOptions>(
    () => ({
      dataMode: values.data === "simulation" ? "simulation" : "live",
      layout: values.layout === "geographic" ? "geographic" : "orthogonal",
      route: values.route,
      trainLength: values.trainLength === "2" ? 2 : 1,
      playing: values.playing,
      speed: values.simSpeed,
      zoom: values.zoom,
      glow: values.glow,
      glowIntensity: values.glowIntensity,
      bloom: values.bloom,
      bloomIntensity: values.bloomIntensity,
      trackBloom: values.trackBloom,
      crt: values.crt,
      crtIntensity: values.crtStrength,
    }),
    [values],
  );

  return { controls, setControls: setValues };
}
