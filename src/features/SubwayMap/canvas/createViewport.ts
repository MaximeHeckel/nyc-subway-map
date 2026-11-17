import type { Route, Viewport } from "../types";
import { MIN_ZOOM, MAX_ZOOM } from "../constants";

export function createViewport() {
  const view: Viewport = {
    width: 736,
    height: 765,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    zoom: MIN_ZOOM,
    panX: 0,
    panY: 0,
  };

  function clampPan() {
    view.panX = Math.max(view.width * (1 - view.zoom), Math.min(0, view.panX));
    view.panY = Math.max(view.height * (1 - view.zoom), Math.min(0, view.panY));
  }

  function fit(width: number, height: number, routes: Route[]) {
    view.width = width;
    view.height = height;

    // Frame all services so filtering a route never jumps the camera.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const route of routes) {
      for (const path of route.paths) {
        for (const [x, y] of path) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    const padding = Math.max(20, Math.min(width, height) * 0.055);
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    view.scale = Math.min(
      (width - padding * 2) / spanX,
      (height - padding * 2) / spanY,
    );
    view.offsetX = (width - spanX * view.scale) / 2 - minX * view.scale;
    view.offsetY = (height - spanY * view.scale) / 2 - minY * view.scale;
    clampPan();
  }

  function setZoom(value: number, x = view.width / 2, y = view.height / 2) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    const ratio = next / view.zoom;

    view.panX = x - (x - view.panX) * ratio;
    view.panY = y - (y - view.panY) * ratio;
    view.zoom = next;
    clampPan();
  }

  function panBy(x: number, y: number) {
    view.panX += x;
    view.panY += y;
    clampPan();
  }

  return { view, fit, setZoom, panBy, clampPan };
}

export type MapViewport = ReturnType<typeof createViewport>;
