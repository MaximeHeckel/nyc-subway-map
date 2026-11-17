import { MAX_FRAME_DELTA } from "../constants";

/** Coalesces every invalidation into one render per animation frame. */
export function createFrameScheduler(render: (delta: number) => void) {
  let pendingFrame: number | null = null;
  let lastTimestamp: number | null = null;
  let animating = false;
  let disposed = false;

  function requestRender() {
    if (disposed || pendingFrame !== null) {
      return;
    }

    pendingFrame = requestAnimationFrame(frame);
  }

  function frame(timestamp: number) {
    pendingFrame = null;

    if (disposed) {
      return;
    }

    const delta =
      animating && lastTimestamp !== null
        ? Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_DELTA)
        : 0;
    lastTimestamp = animating ? timestamp : null;

    render(delta);

    if (animating) {
      requestRender();
    }
  }

  return {
    requestRender,
    setAnimating(value: boolean) {
      if (value === animating) {
        return;
      }

      animating = value;
      lastTimestamp = null;
      requestRender();
    },
    destroy() {
      disposed = true;

      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
      }
    },
  };
}
