/** Cached screen-space texture. No blur, pixel readback, or animated noise. */
export function createCrtSurface() {
  const mask = document.createElement("canvas");
  const glass = document.createElement("canvas");
  let width = 0;
  let height = 0;

  function resize(w: number, h: number) {
    if (w === width && h === height) return;
    width = w;
    height = h;
    // CSS-pixel textures keep their pitch through map zoom and bound cache memory.
    mask.width = glass.width = Math.max(1, Math.ceil(w));
    mask.height = glass.height = Math.max(1, Math.ceil(h));
    const texture = mask.getContext("2d")!;
    const tile = document.createElement("canvas");
    tile.width = 6;
    tile.height = 6;
    const phosphor = tile.getContext("2d")!;

    // Staggered RGB phosphor slots, separated by the shadow mask.
    const colors = [
      "rgba(255,88,68,.045)",
      "rgba(95,255,155,.04)",
      "rgba(90,135,255,.05)",
    ];
    for (let row = 0; row < 2; row++) {
      for (let channel = 0; channel < 3; channel++) {
        const x = (channel * 2 + row * 3) % 6;
        phosphor.fillStyle = colors[channel];
        phosphor.fillRect(x, row * 3 + 0.25, 1, 2);
        phosphor.fillStyle = "rgba(0,0,0,.08)";
        phosphor.fillRect(x + 1, row * 3, 0.5, 3);
      }
    }
    for (let row = 0; row < 2; row++) {
      const y = row * 3;
      const scanline = phosphor.createLinearGradient(0, y, 0, y + 3);
      scanline.addColorStop(0, "rgba(0,0,0,.40)");
      scanline.addColorStop(0.3, "rgba(0,0,0,.22)");
      scanline.addColorStop(0.58, "rgba(0,0,0,0)");
      scanline.addColorStop(1, "rgba(0,0,0,.05)");
      phosphor.fillStyle = scanline;
      phosphor.fillRect(0, y, 6, 3);
    }
    texture.fillStyle = texture.createPattern(tile, "repeat")!;
    texture.fillRect(0, 0, w, h);

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
    ctx.shadowBlur = 0;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
  }

  return {
    resize,
    mask: (ctx: CanvasRenderingContext2D, opacity: number) =>
      paint(ctx, mask, opacity),
    glass: (ctx: CanvasRenderingContext2D, opacity: number) =>
      paint(ctx, glass, opacity),
    destroy() {
      mask.width = mask.height = glass.width = glass.height = 1;
    },
  };
}
