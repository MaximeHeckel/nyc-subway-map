import { FONT_SCALE } from "../constants";
import { appendSegment, glyphFont, strokeWidth } from "./glyphs";
import { pixelRatio } from "./utils";

export function createGlyphCache() {
  const lightSprites = new Map<
    string,
    { image: HTMLCanvasElement; emission: HTMLCanvasElement; size: number }
  >();
  let spriteSettings = "";

  function get(
    char: string,
    color: string,
    head: boolean,
    scale: number,
    zoom: number,
    glowIntensity: number,
  ) {
    const intensity = glowIntensity;
    const dpr = pixelRatio();
    const resolution = Math.min(3, dpr * Math.ceil(zoom));
    const settings = `${scale}:${resolution}:${intensity}`;

    if (settings !== spriteSettings) {
      lightSprites.clear();
      spriteSettings = settings;
    }

    const key = `${char}:${color}:${head}`;
    let sprite = lightSprites.get(key);

    if (!sprite) {
      const fontSize = scale * FONT_SCALE;
      const blur = 8 * intensity;
      const size = Math.ceil(fontSize * 2 + blur * 6 + 4);
      function renderGlyph(shadowBlur: number) {
        const image = document.createElement("canvas");
        image.width = image.height = Math.ceil(size * resolution);

        const brush = image.getContext("2d")!;
        brush.scale(resolution, resolution);
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        brush.font = glyphFont(fontSize);
        brush.fillStyle = brush.strokeStyle = color;
        brush.shadowColor = color;
        brush.shadowBlur = shadowBlur * resolution;
        brush.lineWidth = strokeWidth(fontSize);
        brush.lineCap = "butt";

        if (head) {
          brush.fillText(char, size / 2, size / 2);
        } else {
          brush.beginPath();
          appendSegment(brush, char, size / 2, size / 2, fontSize);
          brush.stroke();
        }

        return image;
      }

      const image = renderGlyph(blur);
      const emission = renderGlyph(0);
      sprite = { image, emission, size };
      lightSprites.set(key, sprite);
    }

    return sprite;
  }

  return { get, destroy: () => lightSprites.clear() };
}
