import { useEffect, useMemo, useRef, useState } from "react";
import { DialRoot, useDialKitController, type DialConfig } from "dialkit";
import type { RealtimeSnapshot, SubwayOptions } from "@/lib/types";
import { mountSubway } from "@/lib/subwayCanvas";
import { routeOrder } from "@/data/routes";
import styles from "./SubwayMap.module.css";

const controlConfig = {
  data: {
    type: "select",
    default: "live",
    options: [
      { label: "Live MTA", value: "live" },
      { label: "Simulation", value: "simulation" },
    ],
  },
  layout: {
    type: "select",
    default: "orthogonal",
    options: [
      { label: "Schematic", value: "orthogonal" },
      { label: "Geographic", value: "geographic" },
    ],
  },
  route: {
    type: "select",
    default: "all",
    options: [{ label: "All services", value: "all" }, ...routeOrder],
  },
  trainLength: {
    type: "select",
    default: "1",
    options: [
      { label: "1 character (arrow)", value: "1" },
      { label: "2 characters", value: "2" },
    ],
  },
  playing: true as boolean,
  simSpeed: [1, 0.25, 3, 0.25],
  zoom: [1, 1, 5, 0.01],
  glow: true as boolean,
  glowIntensity: [0.6, 0, 4, 0.1],
  bloom: true as boolean,
  bloomIntensity: [1.5, 0, 3, 0.1],
  trackBloom: [0.35, 0, 1, 0.05],
  crt: true as boolean,
  crtStrength: [0.55, 0, 1.5, 0.05],
} satisfies DialConfig;

export default function SubwayMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof mountSubway> | null>(null);
  const snapshotRef = useRef<RealtimeSnapshot | null>(null);
  const [trainCount, setTrainCount] = useState("Waiting…");
  const { values, setValues } = useDialKitController(
    "Controls",
    controlConfig,
    {
      id: "ny-subway",
    },
  );
  const controls = useMemo<SubwayOptions>(
    () => ({
      dataMode: values.data === "simulation" ? "simulation" : "live",
      layout: values.layout === "geographic" ? "geographic" : "orthogonal",
      route: values.route,
      trainLength: values.trainLength === "2" ? 2 : 1,
      playing: values.playing,
      speed: values.simSpeed,
      zoom: values.zoom,
      glow: values.glow,
      glowIntensity: values.glowIntensity,
      bloom: values.bloom,
      bloomIntensity: values.bloomIntensity,
      trackBloom: values.trackBloom,
      crt: values.crt,
      crtIntensity: values.crtStrength,
    }),
    [values],
  );
  const controlsRef = useRef(controls);
  const setControlsRef = useRef(setValues);
  controlsRef.current = controls;
  setControlsRef.current = setValues;

  // Replace the animation loop when HMR updates the imperative renderer.
  useEffect(() => {
    if (!canvasRef.current) return;
    const options = { ...controlsRef.current };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      options.playing = false;
      setControlsRef.current({ playing: false });
    }
    const renderer = mountSubway(canvasRef.current, options, (zoom) => {
      setControlsRef.current({ zoom });
    });
    rendererRef.current = renderer;
    if (snapshotRef.current) renderer.setLiveData(snapshotRef.current);
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [mountSubway]);

  useEffect(() => {
    rendererRef.current?.setOptions(controls);
  }, [controls]);

  useEffect(() => {
    if (controls.dataMode !== "live") {
      setTrainCount("Simulated");
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    async function poll() {
      request = new AbortController();
      const controller = request;
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/trains", {
          signal: request.signal,
          cache: "no-store",
        });
        const snapshot: RealtimeSnapshot = await response.json();
        if (disposed) return;
        if (!Array.isArray(snapshot.trains) || !snapshot.serverTime)
          throw Error("Invalid feed response");
        snapshotRef.current = snapshot;
        const coverage = rendererRef.current?.setLiveData(snapshot);
        const unmapped = coverage?.unmapped || 0;
        setTrainCount(
          `${coverage?.mapped || 0}${unmapped ? ` (${unmapped} off-map)` : ""}`,
        );
      } catch (error) {
        if (!disposed) setTrainCount("Last known · expires after 2m");
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(poll, 15000);
      }
    }
    poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
    };
  }, [controls.dataMode]);

  return (
    <main className={styles.root}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={`Colored ASCII NYC subway map with ${controls.dataMode === "live" ? "live MTA trains at estimated positions" : "simulated trains"}. Use the DialKit controls or pinch to zoom; drag to pan.`}
      />
      <aside className={styles.controls} aria-label="Map controls">
        <DialRoot
          mode="inline"
          theme="dark"
          versions="menu"
          productionEnabled
        />
        <dl className={styles.trainInfo} aria-label="Train count">
          <div>
            <dt>Trains</dt>
            <dd>{trainCount}</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}
