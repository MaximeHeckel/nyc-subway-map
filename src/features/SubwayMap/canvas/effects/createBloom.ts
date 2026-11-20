/** Selective bloom: blur the combined track and train emissions on small offscreen canvases. */

export function createBloom() {
  const emissions = document.createElement("canvas");
  const tracks = document.createElement("canvas");
  const trackBrush = tracks.getContext("2d")!;
  let trackKey = "";
  const near = document.createElement("canvas");
  const wide = document.createElement("canvas");
  const light = emissions.getContext("2d")!;
  const nearBrush = near.getContext("2d")!;
  const wideBrush = wide.getContext("2d")!;
  let width = 0;
  let height = 0;

  function begin(w: number, h: number) {
    width = w;
    height = h;
    const ratio = Math.min(0.25, 512 / Math.max(w, h));
    const lowWidth = Math.max(1, Math.round(w * ratio));
    const lowHeight = Math.max(1, Math.round(h * ratio));

    if (emissions.width !== lowWidth || emissions.height !== lowHeight) {
      emissions.width = near.width = lowWidth;
      emissions.height = near.height = lowHeight;
      wide.width = Math.max(1, Math.round(lowWidth / 2));
      wide.height = Math.max(1, Math.round(lowHeight / 2));
    }
    light.setTransform(1, 0, 0, 1, 0, 0);
    light.clearRect(0, 0, lowWidth, lowHeight);
    light.setTransform(lowWidth / w, 0, 0, lowHeight / h, 0, 0);
    light.globalCompositeOperation = "lighter";
  }

  return {
    begin,
    addTracks(
      paths: ReadonlyMap<string, Path2D>,
      lineWidth: number,
      zoom: number,
      panX: number,
      panY: number,
      revision: string,
      strength: number,
      filled = false,
    ) {
      if (strength <= 0) {
        return;
      }

      const key = `${revision}:${width}:${height}:${zoom}:${panX}:${panY}:${lineWidth}:${strength}:${filled}`;

      if (key !== trackKey) {
        trackKey = key;
        tracks.width = emissions.width;
        tracks.height = emissions.height;
        trackBrush.setTransform(
          tracks.width / width,
          0,
          0,
          tracks.height / height,
          0,
          0,
        );
        trackBrush.translate(panX, panY);
        trackBrush.scale(zoom, zoom);
        trackBrush.globalAlpha = strength;
        trackBrush.lineWidth = lineWidth;
        trackBrush.lineCap = "butt";

        for (const [color, path] of paths) {
          if (filled) {
            trackBrush.fillStyle = color;
            trackBrush.fill(path);
          } else {
            trackBrush.strokeStyle = color;
            trackBrush.stroke(path);
          }
        }
      }

      // Static tracks are rasterized only when the view or control changes.
      light.save();
      light.setTransform(1, 0, 0, 1, 0, 0);
      light.drawImage(tracks, 0, 0);
      light.restore();
    },
    add(image: HTMLCanvasElement, x: number, y: number, size: number) {
      light.drawImage(image, x, y, size, size);
    },
    paint(ctx: CanvasRenderingContext2D, intensity: number) {
      if (!width || !height || intensity <= 0) {
        return;
      }
      // Blur the small emission buffers, never the full-resolution map.
      nearBrush.clearRect(0, 0, near.width, near.height);
      nearBrush.filter = "blur(1.25px)";
      nearBrush.drawImage(emissions, 0, 0);
      nearBrush.filter = "none";
      wideBrush.clearRect(0, 0, wide.width, wide.height);
      wideBrush.filter = "blur(2.5px)";
      wideBrush.drawImage(emissions, 0, 0, wide.width, wide.height);
      wideBrush.filter = "none";

      ctx.save();
      ctx.setTransform(
        ctx.canvas.width / width,
        0,
        0,
        ctx.canvas.height / height,
        0,
        0,
      );
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowBlur = 0;

      for (const [image, weight] of [
        [near, 1],
        [wide, 0.65],
      ] as const) {
        for (let gain = intensity * weight; gain > 0; gain -= 1) {
          ctx.globalAlpha = Math.min(1, gain);
          ctx.drawImage(image, 0, 0, width, height);
        }
      }
      ctx.restore();
    },
    destroy() {
      tracks.width =
        tracks.height =
        emissions.width =
        emissions.height =
        near.width =
        near.height =
        wide.width =
        wide.height =
          1;
    },
  };
}
