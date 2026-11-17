# MTA GTFS snapshot

`stops.json` and `patterns.json` were derived from the MTA regular subway GTFS on November 16, 2026:
https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip

Refresh with `pnpm gtfs:refresh`, then `pnpm map:build` from the project root. The generator validates station order against the manually reviewed anchors in `src/data/station-anchors.json`. These are approximate diagram positions, not surveyed station locations.

The protobuf schemas are vendored from the sources linked by the MTA developer documentation:
- https://raw.githubusercontent.com/google/transit/master/gtfs-realtime/proto/gtfs-realtime.proto
- https://raw.githubusercontent.com/OneBusAway/onebusaway-gtfs-realtime-api/master/src/main/proto/com/google/transit/realtime/gtfs-realtime-NYCT.proto

Their copyright/license comments are retained. `schema.json` is their combined protobufjs JSON descriptor, used only on the server. Generate it with `pnpm schema:build`.
