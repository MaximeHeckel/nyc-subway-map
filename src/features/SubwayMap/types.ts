import type { LiveTrain, RoutePath, Point } from "@/types/transit";

export interface SubwayOptions {
  dataMode: "live" | "simulation";
  layout: "orthogonal" | "geographic";
  routes: readonly string[];
  speed: number;
  trainLength: 1 | 2;
  glow: boolean;
  glowIntensity: number;
  bloom: boolean;
  bloomIntensity: number;
  trackBloom: number;
  crt: boolean;
  crtIntensity: number;
  playing: boolean;
  zoom: number;
}

export interface SimulatedTrain {
  path: RoutePath;
  characters: RoutePath;
  pos: number;
  direction: number;
}

export interface MappedTrain extends Omit<LiveTrain, "direction"> {
  path: RoutePath;
  characters: RoutePath;
  toIndex: number;
  fromIndex?: number;
  direction: number;
}

export interface Route {
  id: string;
  lines: RoutePath[];
  paths: RoutePath[];
  cells: Map<string, Point>;
  trains: SimulatedTrain[];
  liveTrains: MappedTrain[];
  characterPaths: Map<RoutePath, RoutePath>;
}

export interface AsciiCell {
  point: Point;
  colors: string[];
  chars: Set<string>;
  char?: string;
}

export interface Viewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface TrainCoverage {
  mapped: number;
  unmapped: number;
}
