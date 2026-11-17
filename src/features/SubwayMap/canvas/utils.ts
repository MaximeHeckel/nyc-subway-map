export function pixelRatio() {
  return Math.min(devicePixelRatio || 1, 2);
}
