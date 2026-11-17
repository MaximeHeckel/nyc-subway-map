// Regenerate after changing station anchors or refreshing the GTFS snapshot.
import type {
  Point,
  StationMap,
  GtfsStops,
  GtfsPatterns,
} from "../src/lib/types";
import fs from "node:fs";
import { cleanRoutes } from "../src/data/routes.ts";
const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const anchors = read<Record<string, [string, number, number][][]>>(
  "../src/data/station-anchors.json",
);
const patterns = read<GtfsPatterns>("../src/data/gtfs/patterns.json");
const stops = read<GtfsStops>("../src/data/gtfs/stops.json");
const aliases: Record<string, string> = {
  ST: "GS",
  SF: "FS",
  SR: "H",
  SIR: "SI",
};
const output: StationMap = {};
const distance = (a: Point, b: Point) =>
  Math.hypot((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180), a[1] - b[1]);
for (const [route, branches] of Object.entries(anchors)) {
  output[route] = branches.map((marks, pathIndex) => {
    // Use actual ordered stop patterns, not proximity to another service's tracks.
    const candidates = patterns[aliases[route] || route].flatMap(
      ({ stops: seq }) => [seq, [...seq].reverse()],
    );
    const candidate = candidates
      .filter((seq) =>
        marks.every(
          ([id], i) =>
            seq.includes(id) &&
            (!i || seq.indexOf(id) > seq.indexOf(marks[i - 1][0])),
        ),
      )
      .sort((a, b) => b.length - a.length)[0];
    if (!candidate)
      throw Error(`No GTFS pattern matches ${route} branch ${pathIndex}`);
    const seq = candidate.slice(
      candidate.indexOf(marks[0][0]),
      candidate.indexOf(marks.at(-1)![0]) + 1,
    );
    // Match cleanPath's 8-way grid stepping so positions stay on the drawn track.
    const points = cleanRoutes[route][pathIndex].map(([x, y]) => [
      Math.round(x / 8) + 15,
      Math.round(y / 8) + 3,
    ]);
    const path = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        sx = Math.sign(b[0] - a[0]),
        sy = Math.sign(b[1] - a[1]);
      const diagonal = Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      let [x, y] = a;
      for (const end of [[b[0] - sx * diagonal, b[1] - sy * diagonal], b]) {
        const n = Math.max(Math.abs(end[0] - x), Math.abs(end[1] - y)),
          dx = Math.sign(end[0] - x),
          dy = Math.sign(end[1] - y);
        for (let k = 0; k < n; k++) {
          x += dx;
          y += dy;
          path.push([x, y]);
        }
      }
    }
    const placed = marks.map(([id, x, y]) => {
      const target = [Math.round(x / 8) + 15, Math.round(y / 8) + 3];
      let index = 0;
      path.forEach((p, i) => {
        if (
          Math.hypot(p[0] - target[0], p[1] - target[1]) <
          Math.hypot(path[index][0] - target[0], path[index][1] - target[1])
        )
          index = i;
      });
      return { id, index };
    });
    const mapped: Record<string, number> = {};
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1],
        b = placed[i];
      if (b.index <= a.index)
        throw Error(`Non-monotonic anchors: ${route} ${a.id} ${b.id}`);
      const section = seq.slice(seq.indexOf(a.id), seq.indexOf(b.id) + 1);
      const cumulative = [0];
      for (let j = 1; j < section.length; j++)
        cumulative.push(
          cumulative.at(-1)! +
            distance(stops[section[j - 1]].p, stops[section[j]].p),
        );
      section.forEach((id, j) => {
        mapped[id] = +(
          (a.index +
            ((b.index - a.index) * cumulative[j]) / cumulative.at(-1)!) /
          (path.length - 1)
        ).toFixed(6);
      });
    }
    const northDirection = patterns[aliases[route] || route].some(
      (p) =>
        p.stops.indexOf(seq[0]) >= 0 &&
        p.stops.indexOf(seq.at(-1)!) > p.stops.indexOf(seq[0]),
    )
      ? 1
      : -1;
    return { stops: mapped, order: seq, northDirection };
  });
}
fs.writeFileSync(
  new URL("../src/data/station-map.json", import.meta.url),
  JSON.stringify(output),
);
console.log(
  `Mapped ${Object.keys(output).length} services, ${Object.values(output)
    .flat()
    .reduce(
      (n, b) => n + b.order.length,
      0,
    )} service-specific station positions.`,
);
