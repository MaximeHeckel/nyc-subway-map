/** Refresh the compact station/pattern snapshot from the official regular GTFS. */
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { parse } from "csv-parse/sync";
import type { GtfsStops, GtfsPatterns } from "../src/lib/types";

const source = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";

async function main() {
  const filename = process.argv[2];
  let archive: Uint8Array;
  if (filename) {
    archive = await readFile(filename);
  } else {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`GTFS download failed: ${response.status}`);
    archive = new Uint8Array(await response.arrayBuffer());
  }
  const bundle = unzipSync(archive, {
    filter: ({ name }) =>
      ["stops.txt", "trips.txt", "stop_times.txt"].includes(name),
  });
  function rows<T>(name: string): T[] {
    if (!bundle[name]) throw new Error(`Missing ${name} in GTFS archive`);
    return parse(Buffer.from(bundle[name]), {
      columns: true,
      bom: true,
      skip_empty_lines: true,
    });
  }
  const stops: GtfsStops = {};
  for (const stop of rows<{
    stop_id: string;
    stop_name: string;
    stop_lon: string;
    stop_lat: string;
    location_type: string;
  }>("stops.txt")) {
    if (stop.location_type === "1")
      stops[stop.stop_id] = {
        name: stop.stop_name,
        p: [Number(stop.stop_lon), Number(stop.stop_lat)],
      };
  }
  const trips = new Map(
    rows<{ trip_id: string; route_id: string; direction_id: string }>(
      "trips.txt",
    ).map((trip) => [trip.trip_id, trip]),
  );
  const tripStops = new Map<string, { sequence: number; stop: string }[]>();
  for (const row of rows<{
    trip_id: string;
    stop_sequence: string;
    stop_id: string;
  }>("stop_times.txt")) {
    if (trips.get(row.trip_id)?.direction_id !== "0") continue;
    const sequence = tripStops.get(row.trip_id) ?? [];
    sequence.push({
      sequence: Number(row.stop_sequence),
      stop: row.stop_id.slice(0, -1),
    });
    tripStops.set(row.trip_id, sequence);
  }
  const counts = new Map<string, Map<string, number>>();
  for (const [id, sequence] of tripStops) {
    const route = trips.get(id)!.route_id;
    const key = JSON.stringify(
      sequence.sort((a, b) => a.sequence - b.sequence).map((item) => item.stop),
    );
    const patterns = counts.get(route) ?? new Map<string, number>();
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
    counts.set(route, patterns);
  }
  const patterns: GtfsPatterns = Object.fromEntries(
    [...counts].map(([route, sequences]) => [
      route,
      [...sequences]
        .sort((a, b) => b[1] - a[1])
        .map(([sequence, count]) => ({
          stops: JSON.parse(sequence) as string[],
          count,
        })),
    ]),
  );
  for (const [name, data] of Object.entries({ stops, patterns })) {
    await writeFile(
      new URL(`../src/data/gtfs/${name}.json`, import.meta.url),
      JSON.stringify(data),
    );
  }
  console.log(
    `Refreshed ${Object.keys(stops).length} stations and ${Object.keys(patterns).length} route pattern sets from ${filename ?? source}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
