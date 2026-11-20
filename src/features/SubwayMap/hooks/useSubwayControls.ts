import { useMemo, useState } from "react";
import { useDialKitController, type DialConfig } from "dialkit";
import type { SubwayOptions } from "../types";
import {
  DEFAULT_VISUAL_PRESET,
  getPresetControlValues,
  type VisualPreset,
} from "../presets";
import {
  DEFAULT_OPTIONS,
  MIN_ZOOM,
  MAX_ZOOM,
  CONTROL_PANEL_ID,
} from "../constants";

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
  visualStyle: {
    type: "select",
    default: DEFAULT_OPTIONS.visualStyle,
    options: [
      { label: "ASCII", value: "ascii" },
      { label: "Block glyphs", value: "tiles" },
    ],
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
  const [preset, setPreset] = useState<VisualPreset>(DEFAULT_VISUAL_PRESET);
  const [routes, setRoutes] = useState(DEFAULT_OPTIONS.routes);
  const { values, setValues } = useDialKitController(
    "Controls",
    controlConfig,
    {
      id: CONTROL_PANEL_ID,
    },
  );
  const controls = useMemo<SubwayOptions>(
    () => ({
      dataMode: values.data === "simulation" ? "simulation" : "live",
      layout: values.layout === "geographic" ? "geographic" : "orthogonal",
      visualStyle: values.visualStyle === "tiles" ? "tiles" : "ascii",
      routes,
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
    [values, routes],
  );

  function selectPreset(nextPreset: VisualPreset) {
    setValues(getPresetControlValues(nextPreset));
    setPreset(nextPreset);
  }

  return { controls, preset, selectPreset, setControls: setValues, setRoutes };
}
