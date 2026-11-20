import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createFrameScheduler } from "../src/features/SubwayMap/canvas/createFrameScheduler";
import { createGlyphCache } from "../src/features/SubwayMap/canvas/createGlyphCache";

function stubGlobal(t: TestContext, name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });

  t.after(() => {
    if (previous) {
      Object.defineProperty(globalThis, name, previous);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  });
}

function fakeFrames(t: TestContext) {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  stubGlobal(t, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++id, callback);
    return id;
  });
  stubGlobal(t, "cancelAnimationFrame", (handle: number) =>
    callbacks.delete(handle),
  );

  return {
    callbacks,
    tick(timestamp: number) {
      const batch = [...callbacks.values()];
      callbacks.clear();
      batch.forEach((callback) => callback(timestamp));
    },
  };
}

test("gesture, control and feed invalidations share one frame, including when paused", (t) => {
  const frames = fakeFrames(t);
  const deltas: number[] = [];
  const scheduler = createFrameScheduler((delta) => deltas.push(delta));

  for (let event = 0; event < 100; event++) scheduler.requestRender();
  assert.equal(frames.callbacks.size, 1);
  assert.equal(deltas.length, 0);
  frames.tick(0);
  assert.deepEqual(deltas, [0]);
  assert.equal(frames.callbacks.size, 0);

  scheduler.setAnimating(true);
  for (let event = 0; event < 100; event++) scheduler.requestRender();
  frames.tick(1000);
  frames.tick(1016);
  assert.deepEqual(deltas, [0, 0, 0.016]);
  assert.equal(frames.callbacks.size, 1);

  scheduler.setAnimating(false);
  scheduler.requestRender();
  frames.tick(1032);
  assert.equal(deltas.at(-1), 0);
  assert.equal(frames.callbacks.size, 0);

  scheduler.setAnimating(true);
  frames.tick(60000);
  assert.equal(
    deltas.at(-1),
    0,
    "resuming must not advance by the paused duration",
  );
  scheduler.destroy();
  scheduler.requestRender();
  scheduler.setAnimating(false);
  assert.equal(frames.callbacks.size, 0);
});

function fakeCanvas(t: TestContext) {
  let creations = 0;
  const noop = () => {};
  stubGlobal(t, "devicePixelRatio", 2);
  stubGlobal(t, "document", {
    createElement() {
      creations++;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          scale: noop,
          fillText: noop,
          beginPath: noop,
          moveTo: noop,
          lineTo: noop,
          stroke: noop,
          rect: noop,
          fill: noop,
        }),
      };
    },
  });
  return {
    get creations() {
      return creations;
    },
  };
}

test("continuous geographic zoom reuses sprite buckets and does not invalidate tails", (t) => {
  const canvas = fakeCanvas(t);
  const cache = createGlyphCache();
  const getHead = (zoom: number) =>
    cache.get("→", "red", true, 1, zoom, 0.6, 6 / zoom);
  const first = getHead(2);
  const tail = cache.get("-", "red", false, 1, 2, 0.6, 3);

  assert.equal(getHead(2.01), first);
  assert.equal(cache.get("-", "red", false, 1, 4, 0.6, 1.5), tail);

  for (let step = 0; step <= 400; step++) getHead(1 + step / 100);
  assert.ok(
    canvas.creations < 40,
    `created ${canvas.creations} canvases for 401 zoom values`,
  );
  const creations = canvas.creations;
  for (let step = 400; step >= 0; step--) getHead(1 + step / 100);
  assert.equal(
    canvas.creations,
    creations,
    "reverse zoom should reuse its prior buckets",
  );
  assert.equal(
    getHead(3),
    getHead(4),
    "inactive minimum size must not affect the key",
  );

  cache.destroy();
  assert.notEqual(getHead(2), first);
});

test("sprite cache retains recent entries and evicts old zoom/color variants", (t) => {
  fakeCanvas(t);
  const cache = createGlyphCache();
  const get = (color: string) => cache.get("→", color, true, 1, 2, 0.6);
  const oldest = get("oldest");
  const recent = get("recent");

  for (let i = 0; i < 300; i++) {
    get(`color-${i}`);
    assert.equal(get("recent"), recent);
  }

  assert.notEqual(get("oldest"), oldest);
  assert.notEqual(cache.get("→", "recent", true, 1, 2, 0.8), recent);
});

test("switching visual styles uses distinct sprites and reuses them on return", (t) => {
  const canvas = fakeCanvas(t);
  const cache = createGlyphCache();
  const get = (style: "ascii" | "tiles", head: boolean) =>
    cache.get(head ? "↗" : "/", "red", head, 2, 3, 0.6, 0, style);
  const asciiHead = get("ascii", true);
  const asciiTail = get("ascii", false);
  const tileHead = get("tiles", true);
  const tileTail = get("tiles", false);

  assert.notEqual(tileHead, asciiHead);
  assert.notEqual(tileTail, asciiTail);

  const creations = canvas.creations;

  for (let i = 0; i < 20; i++) {
    assert.equal(get("ascii", true), asciiHead);
    assert.equal(get("ascii", false), asciiTail);
    assert.equal(get("tiles", true), tileHead);
    assert.equal(get("tiles", false), tileTail);
  }

  assert.equal(canvas.creations, creations);
});

test("same-color train tails retain their route texture without duplicating arrow sprites", (t) => {
  fakeCanvas(t);
  const cache = createGlyphCache();
  const striped = cache.get(
    "-",
    "blue",
    false,
    2,
    3,
    0.6,
    0,
    "tiles",
    "horizontal",
  );
  const checked = cache.get(
    "-",
    "blue",
    false,
    2,
    3,
    0.6,
    0,
    "tiles",
    "checker",
  );

  assert.notEqual(striped, checked);
  assert.equal(
    cache.get("-", "blue", false, 2, 3, 0.6, 0, "tiles", "horizontal"),
    striped,
  );
  assert.equal(
    cache.get("→", "blue", true, 2, 3, 0.6, 0, "tiles", "horizontal"),
    cache.get("→", "blue", true, 2, 3, 0.6, 0, "tiles", "checker"),
  );
});
