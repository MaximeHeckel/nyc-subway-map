import type { GeoProjection } from "d3-geo";
import type { FeatureCollection, LineString } from "geojson";
import type {
  Point,
  RoutePath,
  SubwayOptions,
  LiveTrain,
  RealtimeSnapshot,
  StationMap,
  GtfsStops,
} from "./types";
import { geoMercator } from "d3-geo";
import { createTrainBloom } from "./trainBloom";
import { createCrtSurface } from "./crtSurface";
import { createAsciiBackdrop } from "./asciiBackdrop";
import { rasterizeSchematic } from "./schematicGrid";
import stationMapData from "@/data/station-map.json";
import gtfsStopsData from "@/data/gtfs/stops.json";
import { locateSchematicTrain, liveProgress } from "./livePositions";
import mapData from "@/data/subway.json";
import { colors, routeOrder, cleanRoutes } from "@/data/routes";

const stationMap = stationMapData as StationMap;
const gtfsStops = gtfsStopsData as unknown as GtfsStops;
interface SimulatedTrain {
  path: RoutePath;
  characters: RoutePath;
  pos: number;
  direction: number;
}
interface MappedTrain extends Omit<LiveTrain, "direction"> {
  path: RoutePath;
  characters: RoutePath;
  toIndex: number;
  fromIndex?: number;
  direction: number;
}
interface Route {
  id: string;
  lines: RoutePath[];
  paths: RoutePath[];
  cells: Map<string, Point>;
  trains: SimulatedTrain[];
  liveTrains: MappedTrain[];
  characterPaths: Map<RoutePath, RoutePath>;
}
interface AsciiCell {
  p: Point;
  colors: string[];
  chars: Set<string>;
  char?: string;
}
type Gesture = { center: Point; distance: number } | { point: Point };

/** Mount the existing Canvas 2D simulation. Returns controls and teardown for React effects/HMR. */
export function mountSubway(
  canvas: HTMLCanvasElement,
  initialOptions: Partial<SubwayOptions> = {},
  onZoomChange: (zoom: number) => void = () => {},
) {
  const options: SubwayOptions = {
    dataMode: "live",
    layout: "orthogonal",
    route: "all",
    speed: 1,
    trainLength: 1,
    glow: true,
    glowIntensity: 0.6,
    bloom: true,
    bloomIntensity: 1.5,
    trackBloom: 0.35,
    crt: true,
    crtIntensity: 0.55,
    playing: true,
    zoom: 1,
    ...initialOptions,
  };
  const ctx = canvas.getContext("2d")!;
  const data = {
    routes: structuredClone(mapData.routes).map((route): Route => ({
      id: route.id,
      lines: route.lines as RoutePath[],
      paths: [],
      cells: new Map(),
      trains: [],
      liveTrains: [],
      characterPaths: new Map(),
    })),
  };
  const controller = new AbortController();
  const crtSurface = createCrtSurface();
  const trainBloom = createTrainBloom();
  const asciiBackdrop = createAsciiBackdrop();
  let animationFrame = 0;
  let liveSnapshot: Pick<RealtimeSnapshot, "trains"> &
    Partial<RealtimeSnapshot> = { trains: [] };
  let liveReceivedAt = 0;
  const lightSprites = new Map<
    string,
    { image: HTMLCanvasElement; emission: HTMLCanvasElement; size: number }
  >();
  const trackPaths = new Map<string, Path2D>();
  let trackSettings = "";
  let spriteSettings = "";
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
  data.routes.sort(
    (a, b) => routeOrder.indexOf(a.id) - routeOrder.indexOf(b.id),
  );

  const collection = (rs: Route[]): FeatureCollection<LineString> => ({
    type: "FeatureCollection",
    features: rs.flatMap((r) =>
      r.lines.map((l) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: l },
      })),
    ),
  });
  const project = geoMercator().fitExtent(
    [
      [15, 12],
      [209, 217],
    ],
    collection(data.routes.filter((r) => r.id !== "SIR")),
  );
  const inset = geoMercator().fitExtent(
    [
      [12, 157],
      [45, 208],
    ],
    collection(data.routes.filter((r) => r.id === "SIR")),
  );
  function gridPath(points: RoutePath, projection: GeoProjection): RoutePath {
    const out: RoutePath = [];
    let last: Point | null = null;
    for (const p of points) {
      const q = projection(p)!.map(Math.round) as Point;
      if (!last) {
        out.push(q);
        last = q;
        continue;
      }
      let [x, y] = last;
      const dx = q[0] - x,
        dy = q[1] - y,
        nx = Math.abs(dx),
        ny = Math.abs(dy);
      let ix = 0,
        iy = 0;
      while (ix < nx || iy < ny) {
        if (
          ix < nx &&
          (iy === ny || (ix + 0.5) / (nx || 1) < (iy + 0.5) / (ny || 1))
        ) {
          x += Math.sign(dx);
          ix++;
        } else {
          y += Math.sign(dy);
          iy++;
        }
        out.push([x, y]);
      }
      last = q;
    }
    return out;
  }
  let layoutMode = options.layout;
  function simplifyLine(points: RoutePath, tolerance = 2.5): RoutePath {
    if (points.length < 3) return points;
    const a = points[0],
      b = points[points.length - 1],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      dd = dx * dx + dy * dy;
    let far = 0,
      index = 0;
    for (let i = 1; i < points.length - 1; i++) {
      let p = points[i],
        u = dd
          ? Math.max(
              0,
              Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / dd),
            )
          : 0;
      let d = (p[0] - a[0] - u * dx) ** 2 + (p[1] - a[1] - u * dy) ** 2;
      if (d > far) {
        far = d;
        index = i;
      }
    }
    return far > tolerance * tolerance
      ? [
          ...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1),
          ...simplifyLine(points.slice(index), tolerance),
        ]
      : [a, b];
  }
  // Deliberate corridor layout traced from the supplied transit-diagram reference.
  // Points are diagram coordinates, not longitude/latitude. Shared corridors reuse anchors.
  function cleanPath(anchors: RoutePath): RoutePath {
    const points = anchors.map<Point>((p) => [
        Math.round(p[0] / 8) + 15,
        Math.round(p[1] / 8) + 3,
      ]),
      out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        sx = Math.sign(dx),
        sy = Math.sign(dy),
        diagonal = Math.min(Math.abs(dx), Math.abs(dy));
      const corner = [b[0] - sx * diagonal, b[1] - sy * diagonal];
      let x = a[0],
        y = a[1];
      for (const end of [corner, b]) {
        const n = Math.max(Math.abs(end[0] - x), Math.abs(end[1] - y)),
          stepX = Math.sign(end[0] - x),
          stepY = Math.sign(end[1] - y);
        for (let k = 0; k < n; k++) {
          x += stepX;
          y += stepY;
          out.push([x, y]);
        }
      }
    }
    return out;
  }
  function rebuild() {
    for (const r of data.routes) {
      const projection = r.id === "SIR" ? inset : project;
      r.paths =
        layoutMode === "orthogonal"
          ? cleanRoutes[r.id].map(cleanPath)
          : r.lines.map((l) => gridPath(l, projection));
      r.cells = new Map();
      r.trains = [];
      for (const path of r.paths)
        for (const p of path) r.cells.set(p.join(","), p);
      const usable = r.paths.filter((p) => p.length >= 5),
        total = usable.reduce((n, p) => n + p.length, 0),
        count = Math.max(1, Math.round(r.cells.size / 95));
      for (let i = 0; i < count && total; i++) {
        let distance = (total * (i + 0.35)) / count,
          path = usable[0];
        for (const candidate of usable) {
          path = candidate;
          if (distance < candidate.length) break;
          distance -= candidate.length;
        }
        r.trains.push({
          path,
          characters: [],
          pos: Math.min(distance, path.length - 1),
          direction: i % 2 ? -1 : 1,
        });
      }
    }
  }
  rebuild();
  let zoom = 1,
    panX = 0,
    panY = 0;
  let chosen = options.route,
    playing = options.playing,
    time = 0,
    last = 0,
    w = 736,
    h = 765,
    scale = 1,
    ox = 0,
    oy = 0;
  function active() {
    return chosen === "all"
      ? data.routes
      : data.routes.filter((r) => r.id === chosen);
  }
  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    crtSurface.resize(w, h);
    // CSS object-fit: contain, applied to the actual route bounds.
    // All services define the frame so filtering a route does not jump the camera.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const route of data.routes)
      for (const path of route.paths)
        for (const [x, y] of path) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    const padding = Math.max(20, Math.min(w, h) * 0.055);
    const spanX = maxX - minX,
      spanY = maxY - minY;
    scale = Math.min((w - padding * 2) / spanX, (h - padding * 2) / spanY);
    ox = (w - spanX * scale) / 2 - minX * scale;
    oy = (h - spanY * scale) / 2 - minY * scale;
    clampPan();
    draw();
  }
  function clampPan() {
    panX = Math.max(w * (1 - zoom), Math.min(0, panX));
    panY = Math.max(h * (1 - zoom), Math.min(0, panY));
  }
  function setZoom(value: number, cx = w / 2, cy = h / 2, notify = true) {
    const next = Math.max(1, Math.min(5, value)),
      ratio = next / zoom;
    panX = cx - (cx - panX) * ratio;
    panY = cy - (cy - panY) * ratio;
    zoom = next;
    clampPan();
    if (notify) onZoomChange(zoom);
    draw();
  }
  const cellSize = 2;
  const phosphor = Object.fromEntries(
    Object.entries(colors).map(([id, hex]) => {
      const rgb = [1, 3, 5].map((i) =>
        Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.78 + 255 * 0.22),
      );
      return [id, `rgb(${rgb.join(",")})`];
    }),
  );
  let asciiCells: (AsciiCell & { char: string })[] = [];
  let occupiedCells = new Set<string>();
  let asciiRevision = 0;
  function characterPath(path: RoutePath): RoutePath {
    if (layoutMode === "orthogonal") return rasterizeSchematic(path, cellSize);
    // Simplify before quantization: straight diagonal runs get two endpoints,
    // never independently rounded samples on both sides of a grid boundary.
    const anchors = simplifyLine(path, 0.6).map<Point>(([x, y]) => [
      Math.round(x / cellSize),
      Math.round(y / cellSize),
    ]);
    const out: RoutePath = [];
    for (let i = 0; i < anchors.length; i++) {
      if (!i) {
        out.push(anchors[i]);
        continue;
      }
      let [x, y] = anchors[i - 1];
      const [ex, ey] = anchors[i],
        dx = Math.abs(ex - x),
        dy = -Math.abs(ey - y),
        sx = Math.sign(ex - x),
        sy = Math.sign(ey - y);
      let error = dx + dy;
      while (x !== ex || y !== ey) {
        const twice = 2 * error;
        if (twice >= dy) {
          error += dy;
          x += sx;
        }
        if (twice <= dx) {
          error += dx;
          y += sy;
        }
        if (out.at(-1)![0] !== x || out.at(-1)![1] !== y) out.push([x, y]);
      }
    }
    return out.map(([x, y]) => [x * cellSize, y * cellSize]);
  }
  function characterAt(path: RoutePath, i: number) {
    // Follow a real adjacent edge instead of averaging across a turn, which
    // could label a horizontal correction as another diagonal dash.
    const a = path[i === path.length - 1 ? Math.max(0, i - 1) : i];
    const b = path[Math.min(path.length - 1, i + 1)];
    const dx = Math.sign(b[0] - a[0]);
    const dy = Math.sign(b[1] - a[1]);
    return dx === 0 ? "|" : dy === 0 ? "-" : dx === dy ? "\\" : "/";
  }
  function arrowAt(path: RoutePath, index: number, direction: number) {
    const point = path[index];
    const ahead = path[index + direction];
    const behind = path[index - direction];
    if (!ahead && !behind) return direction > 0 ? "→" : "←";
    const dx = Math.sign(ahead ? ahead[0] - point[0] : point[0] - behind[0]);
    const dy = Math.sign(ahead ? ahead[1] - point[1] : point[1] - behind[1]);
    if (dy === 0) return dx > 0 ? "→" : "←";
    if (dx === 0) return dy > 0 ? "↓" : "↑";
    return dy > 0 ? (dx > 0 ? "↘" : "↙") : dx > 0 ? "↗" : "↖";
  }
  function updateAscii() {
    const cells = new Map<string, AsciiCell>();
    for (const r of data.routes) {
      r.characterPaths = new Map(
        r.paths.map((path) => [path, characterPath(path)]),
      );
      for (const tr of r.trains) tr.characters = r.characterPaths.get(tr.path)!;
    }
    for (const r of active())
      for (const path of r.characterPaths.values()) {
        for (let i = 0; i < path.length; i++) {
          const p = path[i],
            key = p.join(","),
            char = characterAt(path, i);
          if (!cells.has(key))
            cells.set(key, { p, colors: [], chars: new Set() });
          const entry = cells.get(key)!;
          if (!entry.colors.includes(phosphor[r.id]))
            entry.colors.push(phosphor[r.id]);
          entry.chars.add(char);
        }
      }
    occupiedCells = new Set(cells.keys());
    asciiRevision++;
    asciiCells = [...cells.values()].map((c) => ({
      ...c,
      char: c.chars.size > 1 ? "+" : [...c.chars][0],
    }));
  }
  function nearestIndex(path: RoutePath, point: Point) {
    let best = 0;
    let distance = Infinity;
    path.forEach((p, i) => {
      const d = (p[0] - point[0]) ** 2 + (p[1] - point[1]) ** 2;
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    return { index: best, distance };
  }
  function mapLiveTrains() {
    for (const route of data.routes) route.liveTrains = [];
    let unmapped = 0;
    for (const train of liveSnapshot.trains) {
      const route = data.routes.find((r) => r.id === train.routeId);
      if (!route) {
        unmapped++;
        continue;
      }
      let path: RoutePath,
        characters: RoutePath,
        toIndex: number,
        fromIndex: number | undefined,
        direction: number;
      if (layoutMode === "orthogonal") {
        const position = locateSchematicTrain(train, stationMap[route.id]);
        if (!position) {
          unmapped++;
          continue;
        }
        path = route.paths[position.pathIndex];
        characters = route.characterPaths.get(path)!;
        const at = (progress: number) =>
          nearestIndex(
            characters,
            path[Math.round(progress * (path.length - 1))],
          ).index;
        toIndex = at(position.to);
        fromIndex = position.from === undefined ? undefined : at(position.from);
        direction = position.direction;
      } else {
        const station = gtfsStops[train.stopId];
        if (!station) {
          unmapped++;
          continue;
        }
        const projection = route.id === "SIR" ? inset : project;
        const point = projection(station.p)!;
        const candidates = [...route.characterPaths].map(([p, chars]) => ({
          path: p,
          characters: chars,
          ...nearestIndex(chars, point),
        }));
        candidates.sort((a, b) => a.distance - b.distance);
        const match = candidates[0];
        if (!match || match.distance > 16) {
          unmapped++;
          continue;
        }
        path = match.path;
        characters = match.characters;
        toIndex = match.index;
        const previous = gtfsStops[train.fromStopId ?? ""];
        if (previous) {
          const from = nearestIndex(characters, projection(previous.p)!);
          if (from.distance <= 16) fromIndex = from.index;
        }
        const next = gtfsStops[train.nextStopId ?? ""];
        direction = next
          ? Math.sign(
              nearestIndex(characters, projection(next.p)!).index - toIndex,
            )
          : Math.sign(toIndex - (fromIndex ?? toIndex));
        direction ||= train.direction === "S" ? 1 : -1;
      }
      route.liveTrains.push({
        ...train,
        path,
        characters,
        toIndex,
        fromIndex,
        direction,
      });
    }
    return { mapped: liveSnapshot.trains.length - unmapped, unmapped };
  }
  function appendSegment(
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
  function drawTracks() {
    const settings = `${scale}:${ox}:${oy}:${asciiRevision}`;
    const fontSize = scale * 2.65;
    if (settings !== trackSettings) {
      trackSettings = settings;
      trackPaths.clear();
      for (const cell of asciiCells) {
        const color =
          cell.colors[
            ((cell.p[0] + cell.p[1]) / cellSize) % cell.colors.length
          ];
        if (!trackPaths.has(color)) trackPaths.set(color, new Path2D());
        appendSegment(
          trackPaths.get(color)!,
          cell.char,
          ox + cell.p[0] * scale,
          oy + cell.p[1] * scale,
          fontSize,
        );
      }
    }
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(0.75, fontSize * 0.1);
    ctx.lineCap = "butt";
    for (const [color, path] of trackPaths) {
      ctx.strokeStyle = color;
      ctx.stroke(path);
    }
  }
  function trainGlyph(char: string, p: Point, color: string, head: boolean) {
    const intensity = options.glow ? options.glowIntensity : 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resolution = Math.min(3, dpr * Math.ceil(zoom));
    const settings = `${scale}:${resolution}:${intensity}`;
    if (settings !== spriteSettings) {
      lightSprites.clear();
      spriteSettings = settings;
    }
    const key = `${char}:${color}:${head}`;
    let sprite = lightSprites.get(key);
    if (!sprite) {
      const fontSize = scale * 2.65;
      const blur = 8 * intensity;
      const size = Math.ceil(fontSize * 2 + blur * 6 + 4);
      const image = document.createElement("canvas");
      image.width = image.height = Math.ceil(size * resolution);
      const brush = image.getContext("2d")!;
      brush.scale(resolution, resolution);
      brush.textAlign = "center";
      brush.textBaseline = "middle";
      brush.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      brush.fillStyle = color;
      brush.shadowColor = color;
      brush.shadowBlur = blur * resolution;
      if (head) {
        brush.fillText(char, size / 2, size / 2);
      } else {
        brush.strokeStyle = color;
        brush.lineWidth = Math.max(0.75, fontSize * 0.1);
        brush.lineCap = "butt";
        brush.beginPath();
        appendSegment(brush, char, size / 2, size / 2, fontSize);
        brush.stroke();
      }
      const emission = document.createElement("canvas");
      emission.width = emission.height = image.width;
      const core = emission.getContext("2d")!;
      core.scale(resolution, resolution);
      core.textAlign = "center";
      core.textBaseline = "middle";
      core.font = brush.font;
      core.fillStyle = core.strokeStyle = color;
      core.lineWidth = Math.max(0.75, fontSize * 0.1);
      core.lineCap = "butt";
      if (head) core.fillText(char, size / 2, size / 2);
      else {
        core.beginPath();
        appendSegment(core, char, size / 2, size / 2, fontSize);
        core.stroke();
      }
      sprite = { image, emission, size };
      lightSprites.set(key, sprite);
    }
    const x = ox + p[0] * scale - sprite.size / 2;
    const y = oy + p[1] * scale - sprite.size / 2;
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite.image, x, y, sprite.size, sprite.size);
    if (options.bloom && options.bloomIntensity > 0) {
      trainBloom.add(
        sprite.emission,
        panX + x * zoom,
        panY + y * zoom,
        sprite.size * zoom,
      );
    }
  }

  function draw() {
    clampPan();
    if (options.bloom && options.bloomIntensity > 0) trainBloom.begin(w, h);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#080a0b";
    ctx.fillRect(0, 0, w, h);
    asciiBackdrop.draw(ctx, {
      w,
      h,
      scale,
      zoom,
      panX,
      panY,
      ox,
      oy,
      cellSize,
      occupied: occupiedCells,
      revision: asciiRevision,
    });
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    drawTracks();
    if (options.bloom && options.bloomIntensity > 0) {
      trainBloom.addTracks(
        trackPaths,
        ctx.lineWidth,
        zoom,
        panX,
        panY,
        trackSettings,
        options.trackBloom,
      );
    }
    // Real trains use station updates and bounded arrival-time interpolation.
    const live = options.dataMode === "live";
    const now =
      (liveSnapshot.serverTime || Date.now() / 1000) +
      (performance.now() - liveReceivedAt) / 1000;
    for (const r of active())
      for (const tr of live ? r.liveTrains || [] : r.trains) {
        if ("expiresAt" in tr && now >= tr.expiresAt) continue;
        const path = tr.characters,
          head = Math.round(
            "toIndex" in tr
              ? liveProgress(tr, now)
              : (tr.pos / Math.max(1, tr.path.length - 1)) * (path.length - 1),
          ),
          seen = new Set();
        for (let i = options.trainLength === 1 ? 0 : 1; i >= 0; i--) {
          // At a terminus, keep the tail in bounds without covering the head.
          let k = head - i * tr.direction;
          if (k < 0 || k >= path.length) k = head + i * tr.direction;
          k = Math.max(0, Math.min(path.length - 1, k));
          const p = path[k],
            key = p.join(",");
          if (seen.has(key)) continue;
          seen.add(key);
          const char =
            i === 0 ? arrowAt(path, k, tr.direction) : characterAt(path, k);
          trainGlyph(char, p, phosphor[r.id], i === 0);
        }
      }
    ctx.restore();
    if (options.crt) {
      // Apply scanlines across the complete image, including bright train glyphs.
      crtSurface.mask(ctx, options.crtIntensity, time);
    }
    if (options.bloom) trainBloom.paint(ctx, options.bloomIntensity);
    if (options.crt) crtSurface.glass(ctx, options.crtIntensity);
  }
  function advance(dt: number) {
    for (const r of data.routes)
      for (const tr of r.trains) {
        tr.pos += dt * options.speed * 8 * tr.direction;
        if (tr.pos >= tr.path.length - 1) {
          tr.pos = tr.path.length - 1;
          tr.direction = -1;
        }
        if (tr.pos <= 0) {
          tr.pos = 0;
          tr.direction = 1;
        }
      }
  }
  function frame(t: number) {
    let dt = Math.min((t - last) / 1000, 0.08);
    last = t;
    if (playing) {
      time += dt;
      if (options.dataMode === "simulation") advance(dt);
      draw();
    }
    animationFrame = requestAnimationFrame(frame);
  }
  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  function localPoint(e: MouseEvent): Point {
    const b = canvas.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }
  function beginGesture() {
    const a = [...pointers.values()];
    gesture =
      a.length >= 2
        ? {
            center: [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2],
            distance: Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]),
          }
        : { point: a[0] };
  }
  listen("pointerdown", (e) => {
    pointers.set(e.pointerId, localPoint(e));
    canvas.setPointerCapture(e.pointerId);
    beginGesture();
  });
  listen("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) {
      return;
    }
    pointers.set(e.pointerId, localPoint(e));
    const a = [...pointers.values()];
    if (a.length >= 2 && gesture && "distance" in gesture && gesture.distance) {
      const center = [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2],
        distance = Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
      setZoom((zoom * distance) / gesture.distance, ...gesture.center);
      panX += center[0] - gesture.center[0];
      panY += center[1] - gesture.center[1];
      clampPan();
      draw();
    } else if (a.length === 1 && gesture && "point" in gesture) {
      const dx = a[0][0] - gesture.point[0],
        dy = a[0][1] - gesture.point[1];
      panX += dx;
      panY += dy;
      clampPan();
      draw();
    }
    beginGesture();
  });
  function endPointer(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size) beginGesture();
    else gesture = null;
  }
  listen("pointerup", endPointer);
  listen("pointercancel", endPointer);
  listen(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = localPoint(e);
      setZoom(zoom * Math.exp(-e.deltaY * 0.002), ...p);
    },
    { passive: false },
  );
  updateAscii();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  animationFrame = requestAnimationFrame(frame);
  setZoom(options.zoom, w / 2, h / 2, false);
  return {
    setOptions(next: Partial<SubwayOptions>) {
      const layoutChanged =
        next.layout !== undefined && next.layout !== layoutMode;
      const routeChanged = next.route !== undefined && next.route !== chosen;
      Object.assign(options, next);
      layoutMode = options.layout;
      chosen = options.route;
      playing = options.playing;
      if (layoutChanged) rebuild();
      // Train character paths must exist before resize triggers a redraw.
      if (layoutChanged || routeChanged) {
        updateAscii();
        mapLiveTrains();
      }
      if (layoutChanged) resize();
      if (next.zoom !== undefined && Math.abs(next.zoom - zoom) > 0.00001)
        setZoom(next.zoom, w / 2, h / 2, false);
      else draw();
    },
    setLiveData(snapshot: RealtimeSnapshot) {
      liveSnapshot = snapshot;
      liveReceivedAt = performance.now();
      const coverage = mapLiveTrains();
      draw();
      return coverage;
    },
    destroy() {
      crtSurface.destroy();
      trainBloom.destroy();
      asciiBackdrop.destroy();
      lightSprites.clear();
      trackPaths.clear();
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controller.abort();
      pointers.clear();
    },
  };
}
