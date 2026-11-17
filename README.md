# NY Subway

Next.js **Pages Router** + React + strict TypeScript, CSS Modules, and the original Canvas 2D ASCII/CRT renderer. No App Router, React Server Components, Tailwind, or external CDN dependencies.

## Run

Use Node.js 22 or newer and pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Next development mode includes Fast Refresh/HMR for React, TypeScript and CSS Modules.

For a production build:

```sh
pnpm build
pnpm start
```

To use another port: `pnpm dev --port 3001` or `pnpm start --port 3001`.

## Iterate

- `src/components/SubwayMap.tsx` — DialKit controls and Canvas mounting.
- `src/components/SubwayMap.module.css` — full-screen canvas sizing.
- `src/lib/subwayCanvas.ts` — Canvas 2D drawing, ASCII rasterization, train simulation, CRT, zoom/pan. The renderer exposes `setOptions` and `destroy` for cleanup for animation frames, resize observers, and native event listeners, including during Fast Refresh and React Strict Mode.
- `src/lib/asciiBackdrop.ts` — cached punctuation aligned to unoccupied route-grid cells.
- `src/lib/trainBloom.ts` — selective track and train bloom using two low-resolution blur layers.
- `src/lib/crtSurface.ts` — cached screen-space phosphor slots, scanlines, and rounded glass shading.
- `src/data/routes.ts` — route colors and authored schematic corridors.
- `src/data/subway.json` — bundled MTA geographic route and station data.
- `src/pages/index.tsx` — home page.
- `src/pages/api/health.ts` — working Pages Router API endpoint at `/api/health`.

The canvas fills the viewport and fits the complete map at 1× without stretching. DialKit contains all controls, including glow intensity, a separate Bloom toggle/intensity, and CRT strength. The phosphor texture and glass stay fixed to the screen; horizontal scanline spacing scales with map zoom, from 1.5 pixels at 1× to four pixels at 5×, and shades the complete image, including bright trains. The fine lines scroll upward, alongside a brighter soft band that sweeps upward across the display every 12 seconds; both pause with Playing. The textures are cached and regenerated only on resize; animation translates the cached strips. It preserves 35% idle opacity, bright live or simulated trains, single-width ASCII diagonals, schematic/geographic layouts, route filtering, CRT/glow toggles, pause/speed, and zoom from 1× to 5×. Drag to pan, scroll or pinch to zoom.

## Real-time trains

`GET /api/trains` fetches all eight official MTA subway GTFS-Realtime feeds. No API key is required. The server decodes protobuf, combines vehicle/trip records, filters unassigned/future/stale observations, caches each feed for 15 seconds, and coalesces concurrent requests. Upstream requests time out after 8 seconds. Partial failures preserve recent observations with a stale flag; all feeds failing produces HTTP 503. Observations expire after two minutes. There is no automatic fallback to simulated data.

The client polls every 15 seconds. **Live MTA** is the default in DialKit; **Simulation** remains available for local visual work. The speed slider affects simulation only. Mapped/off-map train counts are shown below the DialKit controls.

Trains default to a single directional arrowhead (`→`, `←`, `↑`, `↓`, or a diagonal arrow) with an optional second-character track-aligned tail stroke, for example `-→` or `←-`. Track dashes and train tails share the same fixed-length stroke geometry in every orientation; inactive tracks are batched into cached paths by color. Glowing glyphs are cached as small images to avoid repeating blur operations for hundreds of active trains every frame. Bloom separately collects sharp train emissions, blurs them at two small resolutions, and adds the halos over the map. Its largest buffer is capped at 512 pixels on the longest side; tracks feed the same blur passes at 35% emission strength by default, adjustable with Track Bloom (zero disables it). Track emissions are cached until the view, routes, or strength changes. Glow and Bloom can be toggled independently.

### Position accuracy

MTA subway feeds report station-relative status and predicted stop times, not continuous GPS coordinates. A newly seen train is placed at its reported/approaching station. Once we observe its target station change, we interpolate from the previous station to the next predicted arrival, then hold there until the next update. Stopped trains stay at their reported station. This is estimated movement, not measured movement between stations.

The schematic uses service-specific station IDs, ordered GTFS stop patterns, and manually placed terminal/hub anchors. Intermediate stations are interpolated along each diagram corridor using geographic distance. Express trips use their actual reported stop IDs; stations shared by several services retain separate track positions. A train's next/previous stop selects its Rockaway branch. Unsupported detours/branches are omitted and counted as off-map rather than placed on the wrong corridor. The current diagram is still a simplified prototype; it does not depict every service variation. Geographic mode uses station coordinates snapped to the matching service's geographic route geometry.

### Iterate and validate

- `src/pages/api/trains.ts` — Pages Router endpoint.
- `src/lib/server/mta.ts` — feed decoding, caching, normalization and observed transitions.
- `src/lib/livePositions.ts` — branch selection and bounded interpolation.
- `src/data/station-anchors.json` — editable service-specific schematic anchors.
- `pnpm map:build` — regenerate station positions after anchor edits.
- `pnpm gtfs:refresh` — refresh bundled static station/pattern data from MTA.
- `pnpm schema:build` — regenerate the decoder descriptor from vendored schemas.
- `pnpm typecheck` — strict type checking for the app, scripts, and tests.
- `pnpm test` — feed and mapping regression tests.

MTA resources: https://www.mta.info/developers and https://api.mta.info/

## Data

Geographic routes: https://data.ny.gov/Transportation/MTA-Subway-Service-Lines/s692-irgq

Stations: https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f

The schematic is manually simplified from the user-supplied subway diagram. The geographic data is bundled; live mode additionally requests MTA real-time feeds through the local API.
