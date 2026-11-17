import type { Point } from "@/types/transit";
import type { MapViewport } from "./createViewport";

type Gesture = { center: Point; distance: number } | { point: Point };

export function bindGestures(
  canvas: HTMLCanvasElement,
  camera: MapViewport,
  draw: () => void,
  onZoomChange: (zoom: number) => void,
) {
  const controller = new AbortController();

  function listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options: AddEventListenerOptions = {},
  ) {
    canvas.addEventListener(type, handler, {
      ...options,
      signal: controller.signal,
    });
  }

  function setZoom(value: number, x: number, y: number) {
    camera.setZoom(value, x, y);
    onZoomChange(camera.view.zoom);
    draw();
  }

  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;

  function localPoint(event: MouseEvent): Point {
    const bounds = canvas.getBoundingClientRect();

    return [event.clientX - bounds.left, event.clientY - bounds.top];
  }

  function beginGesture() {
    const points = [...pointers.values()];
    gesture =
      points.length >= 2
        ? {
            center: [
              (points[0][0] + points[1][0]) / 2,
              (points[0][1] + points[1][1]) / 2,
            ],
            distance: Math.hypot(
              points[1][0] - points[0][0],
              points[1][1] - points[0][1],
            ),
          }
        : { point: points[0] };
  }
  listen("pointerdown", (event) => {
    pointers.set(event.pointerId, localPoint(event));
    canvas.setPointerCapture(event.pointerId);
    beginGesture();
  });
  listen("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) {
      return;
    }
    pointers.set(event.pointerId, localPoint(event));
    const points = [...pointers.values()];

    if (
      points.length >= 2 &&
      gesture &&
      "distance" in gesture &&
      gesture.distance
    ) {
      const center = [
        (points[0][0] + points[1][0]) / 2,
        (points[0][1] + points[1][1]) / 2,
      ];
      const distance = Math.hypot(
        points[1][0] - points[0][0],
        points[1][1] - points[0][1],
      );
      setZoom(
        (camera.view.zoom * distance) / gesture.distance,
        ...gesture.center,
      );
      camera.panBy(
        center[0] - gesture.center[0],
        center[1] - gesture.center[1],
      );
      draw();
    } else if (points.length === 1 && gesture && "point" in gesture) {
      const dx = points[0][0] - gesture.point[0];
      const dy = points[0][1] - gesture.point[1];
      camera.panBy(dx, dy);
      draw();
    }
    beginGesture();
  });

  function endPointer(event: PointerEvent) {
    pointers.delete(event.pointerId);

    if (pointers.size) {
      beginGesture();
    } else gesture = null;
  }
  listen("pointerup", endPointer);
  listen("pointercancel", endPointer);
  listen(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = localPoint(event);
      setZoom(camera.view.zoom * Math.exp(-event.deltaY * 0.002), ...point);
    },
    { passive: false },
  );

  return () => {
    controller.abort();
    pointers.clear();
    gesture = null;
  };
}
