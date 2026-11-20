import type { SubwayOptions } from "./types";

type VisualSettings = Pick<
  SubwayOptions,
  | "visualStyle"
  | "trainLength"
  | "glow"
  | "glowIntensity"
  | "bloom"
  | "bloomIntensity"
  | "trackBloom"
  | "crt"
  | "crtIntensity"
>;

export type VisualPreset = "preset1" | "preset2";

export const DEFAULT_VISUAL_PRESET: VisualPreset = "preset2";

export const VISUAL_PRESETS = {
  preset1: {
    visualStyle: "ascii",
    trainLength: 1,
    glow: true,
    glowIntensity: 0.6,
    bloom: true,
    bloomIntensity: 1.5,
    trackBloom: 0.35,
    crt: true,
    crtIntensity: 0.25,
  },
  preset2: {
    visualStyle: "tiles",
    trainLength: 1,
    glow: false,
    glowIntensity: 0.6,
    bloom: true,
    bloomIntensity: 1.5,
    trackBloom: 0.15,
    crt: true,
    crtIntensity: 0.35,
  },
} as const satisfies Record<VisualPreset, VisualSettings>;

export const PRESET_OPTIONS = [
  { label: "Preset 1 · ASCII", value: "preset1" },
  { label: "Preset 2 · Glyphs", value: "preset2" },
];

/** Copy defaults into the editable controls; edits never change the preset. */
export function getPresetControlValues(preset: VisualPreset) {
  const { trainLength, crtIntensity, ...settings } = VISUAL_PRESETS[preset];

  return {
    ...settings,
    trainLength: String(trainLength),
    crtStrength: crtIntensity,
  };
}
