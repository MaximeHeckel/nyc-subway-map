import type { Point, RealtimeSnapshot } from "@/types/transit";
import type { SubwayOptions } from "../types";
import { CELL_SIZE, DEFAULT_OPTIONS, MAX_FRAME_DELTA } from "../constants";
import { createSubwayModel } from "../model/createSubwayModel";
import { getTrainGlyphs } from "../model/trainGlyphs";
import { createBloom } from "./effects/createBloom";
import { createCrtSurface } from "./effects/createCrtSurface";
import { createAsciiBackdrop } from "./createAsciiBackdrop";
import { createGlyphCache } from "./createGlyphCache";
import { createTrackLayer } from "./createTrackLayer";
import { createViewport } from "./createViewport";
import { bindGestures } from "./bindGestures";
import { pixelRatio } from "./utils";

/** Owns canvas resources and the render loop; React only supplies settings and data. */

export function createSubwayRenderer(
  canvas: HTMLCanvasElement,
  initialOptions: Partial<SubwayOptions> = {},
  onZoomChange: (zoom: number) => void = () => {},
) {
  const options = { ...DEFAULT_OPTIONS, ...initialOptions };
  const ctx = canvas.getContext("2d")!;
  const model = createSubwayModel(options.layout, options.route);
  const camera = createViewport();
  const glyphs = createGlyphCache();
  const tracks = createTrackLayer();
  const crtSurface = createCrtSurface();
  const bloom = createBloom();
  const asciiBackdrop = createAsciiBackdrop();

  let animationFrame = 0;
  let time = 0;
  let last = 0;
  let liveSnapshot: Partial<RealtimeSnapshot> = {};
  let liveReceivedAt = 0;

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = pixelRatio();

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    camera.fit(width, height, model.routes);
    crtSurface.resize(width, height);
    draw();
  }

  function drawTrainGlyph(
    char: string,
    point: Point,
    color: string,
    head: boolean,
  ) {
    const { scale, zoom, offsetX, offsetY, panX, panY } = camera.view;
    const intensity = options.glow ? options.glowIntensity : 0;
    // Keep geographic arrowheads readable when the finer grid fits the screen.
    const minimumHeadSize = model.density > 1 ? 6 / zoom : 0;
    const sprite = glyphs.get(
      char,
      color,
      head,
      scale,
      zoom,
      intensity,
      minimumHeadSize,
    );
    const x = offsetX + point[0] * scale - sprite.size / 2;
    const y = offsetY + point[1] * scale - sprite.size / 2;

    ctx.globalAlpha = 1;
    ctx.drawImage(sprite.image, x, y, sprite.size, sprite.size);

    if (options.bloom && options.bloomIntensity > 0) {
      bloom.add(
        sprite.emission,
        panX + x * zoom,
        panY + y * zoom,
        sprite.size * zoom,
      );
    }
  }

  function draw() {
    camera.clampPan();
    const { width, height, scale, offsetX, offsetY, zoom, panX, panY } =
      camera.view;

    if (options.bloom && options.bloomIntensity > 0) {
      bloom.begin(width, height);
    }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#080a0b";
    ctx.fillRect(0, 0, width, height);

    asciiBackdrop.draw(ctx, {
      width,
      height,
      scale,
      zoom,
      panX,
      panY,
      offsetX,
      offsetY,
      cellSize: CELL_SIZE,
      stride: model.density,
      occupied: model.occupiedCells,
      revision: model.revision,
    });

    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    tracks.draw(ctx, model, camera.view);

    if (options.bloom && options.bloomIntensity > 0) {
      bloom.addTracks(
        tracks.paths,
        ctx.lineWidth,
        zoom,
        panX,
        panY,
        tracks.revision,
        options.trackBloom,
      );
    }

    // Real trains use station updates and bounded arrival-time interpolation.
    const live = options.dataMode === "live";

    const now =
      (liveSnapshot.serverTime || Date.now() / 1000) +
      (performance.now() - liveReceivedAt) / 1000;

    for (const route of model.activeRoutes) {
      const trains = live ? route.liveTrains : route.trains;

      for (const train of trains) {
        for (const glyph of getTrainGlyphs(train, options.trainLength, now)) {
          drawTrainGlyph(
            glyph.character,
            glyph.point,
            model.phosphor[route.id],
            glyph.isHead,
          );
        }
      }
    }

    ctx.restore();

    if (options.crt) {
      // Apply scanlines across the complete image, including bright train glyphs.
      crtSurface.mask(ctx, options.crtIntensity, time, zoom);
    }

    if (options.bloom) {
      bloom.paint(ctx, options.bloomIntensity);
    }

    if (options.crt) {
      crtSurface.glass(ctx, options.crtIntensity);
    }
  }

  function frame(timestamp: number) {
    const delta = Math.min((timestamp - last) / 1000, MAX_FRAME_DELTA);
    last = timestamp;

    if (options.playing) {
      time += delta;

      if (options.dataMode === "simulation") {
        model.advance(delta, options.speed);
      }

      draw();
    }

    animationFrame = requestAnimationFrame(frame);
  }

  const unbindGestures = bindGestures(canvas, camera, draw, onZoomChange);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  camera.setZoom(options.zoom);
  draw();
  animationFrame = requestAnimationFrame(frame);

  return {
    setOptions(next: Partial<SubwayOptions>) {
      const layoutChanged =
        next.layout !== undefined && next.layout !== options.layout;
      Object.assign(options, next);

      // Build character paths and remap trains before any resize can draw.
      model.setLayout(options.layout, options.route);

      if (layoutChanged) {
        resize();
      }

      if (
        next.zoom !== undefined &&
        Math.abs(next.zoom - camera.view.zoom) > 0.00001
      ) {
        camera.setZoom(next.zoom);
      }

      draw();
    },
    setLiveData(snapshot: RealtimeSnapshot) {
      liveSnapshot = snapshot;
      liveReceivedAt = performance.now();
      const coverage = model.setLiveTrains(snapshot.trains);

      draw();

      return coverage;
    },
    destroy() {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      unbindGestures();

      crtSurface.destroy();
      bloom.destroy();
      asciiBackdrop.destroy();
      glyphs.destroy();
      tracks.destroy();
    },
  };
}

export type SubwayRenderer = ReturnType<typeof createSubwayRenderer>;
