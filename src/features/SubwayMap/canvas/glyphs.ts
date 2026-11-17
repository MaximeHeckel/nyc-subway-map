export function appendSegment(
  target: CanvasPath,
  char: string,
  x: number,
  y: number,
  fontSize: number,
) {
  if (char === "+") {
    appendSegment(target, "-", x, y, fontSize);
    appendSegment(target, "|", x, y, fontSize);
    return;
  }

  const angle =
    char === "|"
      ? Math.PI / 2
      : char === "/"
        ? -Math.PI / 4
        : char === "\\"
          ? Math.PI / 4
          : 0;
  const halfLength = fontSize * 0.25;
  const dx = Math.cos(angle) * halfLength;
  const dy = Math.sin(angle) * halfLength;
  target.moveTo(x - dx, y - dy);
  target.lineTo(x + dx, y + dy);
}

export function glyphFont(size: number) {
  return `bold ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}

export function strokeWidth(fontSize: number) {
  return Math.max(0.75, fontSize * 0.1);
}
