import fs from "node:fs";
import protobuf from "protobufjs";
const root = protobuf.parse(
  fs.readFileSync(
    new URL("../src/data/gtfs/gtfs-realtime.proto", import.meta.url),
    "utf8",
  ),
).root;
protobuf.parse(
  fs
    .readFileSync(
      new URL("../src/data/gtfs/nyct.proto", import.meta.url),
      "utf8",
    )
    .replace(/^import .*;$/m, ""),
  root,
);
root.resolveAll();
fs.writeFileSync(
  new URL("../src/data/gtfs/schema.json", import.meta.url),
  JSON.stringify(root.toJSON()),
);
