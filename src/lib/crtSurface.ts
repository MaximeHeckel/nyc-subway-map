/** Cached screen-space textures with fine scanline motion and a soft refresh band. */
export function createCrtSurface() {
  const mask = document.createElement("canvas");
  const glass = document.createElement("canvas");
  const scanlines = document.createElement("canvas");
  const band = document.createElement("canvas");
  const pitch = 4;
  const referenceZoom = 5;
  band.width = 1;
  band.height = 256;
  const bandBrush = band.getContext("2d")!;
  const bandGradient = bandBrush.createLinearGradient(0, 0, 0, band.height);
  for (let i = 0; i <= 16; i++) {
    const alpha = Math.sin((i / 16) * Math.PI) ** 2;
    bandGradient.addColorStop(i / 16, `rgba(205, 220, 212, ${alpha})`);
  }
  bandBrush.fillStyle = bandGradient;
  bandBrush.fillRect(0, 0, 1, band.height);
  let width = 0;
  let height = 0;

  function resize(w: number, h: number) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    // The phosphor mask and glass stay in screen space.
    mask.width = glass.width = Math.max(1, Math.ceil(w));
    mask.height = glass.height = Math.max(1, Math.ceil(h));
    const texture = mask.getContext("2d")!;
    const tile = document.createElement("canvas");
    tile.width = 6;
    tile.height = 12;
    const phosphor = tile.getContext("2d")!;

    // Staggered RGB phosphor slots, separated by the shadow mask.
    const colors = [
      "rgba(255,88,68,.045)",
      "rgba(95,255,155,.04)",
      "rgba(90,135,255,.05)",
    ];
    for (let row = 0; row < 4; row++) {
      for (let channel = 0; channel < 3; channel++) {
        const x = (channel * 2 + row * 3) % 6;
        phosphor.fillStyle = colors[channel];
        phosphor.fillRect(x, row * 3 + 0.25, 1, 2);
        phosphor.fillStyle = "rgba(0,0,0,.08)";
        phosphor.fillRect(x + 1, row * 3, 0.5, 3);
      }
    }
    texture.fillStyle = texture.createPattern(tile, "repeat")!;
    texture.fillRect(0, 0, w, h);

    // Cover the viewport even when compressed to 1/referenceZoom at minimum zoom.
    // One extra period keeps the moving strip seamless at both edges.
    scanlines.width = 1;
    scanlines.height = Math.ceil(h * referenceZoom) + pitch;
    const lines = scanlines.getContext("2d")!;
    const lineTile = document.createElement("canvas");
    lineTile.width = 1;
    lineTile.height = pitch;
    const lineBrush = lineTile.getContext("2d")!;
    const scanline = lineBrush.createLinearGradient(0, 0, 0, pitch);
    scanline.addColorStop(0, "rgba(0,0,0,.70)");
    scanline.addColorStop(0.18, "rgba(0,0,0,.60)");
    scanline.addColorStop(0.38, "rgba(0,0,0,.10)");
    scanline.addColorStop(0.55, "rgba(0,0,0,0)");
    scanline.addColorStop(0.8, "rgba(0,0,0,0)");
    scanline.addColorStop(1, "rgba(0,0,0,.70)");
    lineBrush.fillStyle = scanline;
    lineBrush.fillRect(0, 0, 1, pitch);
    lines.fillStyle = lines.createPattern(lineTile, "repeat")!;
    lines.fillRect(0, 0, 1, scanlines.height);

    const surface = glass.getContext("2d")!;
    // Elliptical falloff follows the screen's proportions on wide and tall windows.
    surface.save();
    surface.translate(w / 2, h / 2);
    surface.scale(w / 2, h / 2);
    const vignette = surface.createRadialGradient(0, -0.08, 0.18, 0, 0, 1.36);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.55, "rgba(0,0,0,.035)");
    vignette.addColorStop(0.82, "rgba(0,0,0,.28)");
    vignette.addColorStop(1, "rgba(0,0,0,.78)");
    surface.fillStyle = vignette;
    surface.fillRect(-1, -1, 2, 2);
    surface.restore();

    const inset = 7;
    const radius = Math.min(30, w * 0.035, h * 0.035);
    // Rounded dark edge and a restrained reflection suggest curved glass.
    surface.beginPath();
    surface.rect(0, 0, w, h);
    surface.roundRect(
      inset,
      inset,
      Math.max(1, w - inset * 2),
      Math.max(1, h - inset * 2),
      radius,
    );
    surface.fillStyle = "#030506";
    surface.fill("evenodd");
    const reflection = surface.createLinearGradient(0, 0, w * 0.6, h);
    reflection.addColorStop(0, "rgba(180,214,220,.12)");
    reflection.addColorStop(0.25, "rgba(140,190,200,.025)");
    reflection.addColorStop(0.65, "rgba(140,190,200,0)");
    reflection.addColorStop(1, "rgba(110,165,190,.045)");
    surface.strokeStyle = reflection;
    surface.lineWidth = 1;
    surface.stroke();
  }

  function paint(
    ctx: CanvasRenderingContext2D,
    image: HTMLCanvasElement,
    opacity: number,
    offsetY = 0,
    drawHeight = height,
    blend: GlobalCompositeOperation = "source-over",
  ) {
    if (!width || !height || opacity <= 0) return;
    ctx.save();
    // Ignore the map's zoom/pan; this texture belongs to the screen itself.
    ctx.setTransform(
      ctx.canvas.width / width,
      0,
      0,
      ctx.canvas.height / height,
      0,
      0,
    );
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.globalCompositeOperation = blend;
    ctx.shadowBlur = 0;
    if (image === scanlines) {
      // Average the fine raster when it becomes smaller than a screen pixel.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
    }
    ctx.drawImage(image, 0, offsetY, width, drawHeight);
    ctx.restore();
  }

  return {
    resize,
    mask(
      ctx: CanvasRenderingContext2D,
      opacity: number,
      seconds: number,
      zoom: number,
    ) {
      paint(ctx, mask, opacity);
      const bandHeight = height * 0.22;
      const bandY = height - ((seconds / 12 + 0.3) % 1) * (height + bandHeight);
      paint(ctx, band, opacity * 0.12, bandY, bandHeight, "screen");
      // Move the fine raster independently of the phosphor grid and broad band.
      const rasterPitch =
        1.5 + ((zoom - 1) / (referenceZoom - 1)) * (pitch - 1.5);
      const rasterScale = rasterPitch / pitch;
      const offset = -((seconds * 8) % pitch) * rasterScale;
      // Give the fine raster more contrast at low overall CRT strength.
      paint(
        ctx,
        scanlines,
        opacity * 2,
        offset,
        scanlines.height * rasterScale,
      );
    },
    glass: (ctx: CanvasRenderingContext2D, opacity: number) =>
      paint(ctx, glass, opacity),
    destroy() {
      mask.width = mask.height = glass.width = glass.height = 1;
      scanlines.width = scanlines.height = band.width = band.height = 1;
    },
  };
}
