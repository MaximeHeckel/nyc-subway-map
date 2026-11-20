import { MapControls } from "./MapControls";
import { useState } from "react";
import { useSubwayControls } from "./hooks/useSubwayControls";
import { useSubwayRenderer } from "./hooks/useSubwayRenderer";
import { useRealtimeTrains } from "./hooks/useRealtimeTrains";
import styles from "./SubwayMap.module.css";

export default function SubwayMap() {
  const [controlsOpen, setControlsOpen] = useState(true);
  const { controls, preset, selectPreset, setControls, setRoutes } =
    useSubwayControls();
  const { canvasRef, receiveSnapshot } = useSubwayRenderer(
    controls,
    setControls,
  );
  const trainCount = useRealtimeTrains(controls.dataMode, receiveSnapshot);

  return (
    <main className={styles.root}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={`Colored ${controls.visualStyle === "tiles" ? "block glyph" : "ASCII"} NYC subway map with ${controls.dataMode === "live" ? "live MTA trains at estimated positions" : "simulated trains"}. Use the DialKit controls or pinch to zoom; drag to pan.`}
      />
      <aside
        className={styles.controls}
        data-collapsed={!controlsOpen}
        aria-label="Map controls"
      >
        <button
          type="button"
          className={styles.collapseButton}
          aria-label={
            controlsOpen ? "Collapse map controls" : "Expand map controls"
          }
          aria-expanded={controlsOpen}
          aria-controls="subway-controls-content"
          onClick={() => setControlsOpen((open) => !open)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d={controlsOpen ? "M4 10 8 6l4 4" : "M4 6l4 4 4-4"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div id="subway-controls-content" hidden={!controlsOpen}>
          <MapControls
            preset={preset}
            onPresetChange={selectPreset}
            routes={controls.routes}
            onRoutesChange={setRoutes}
          />
          <dl className={styles.trainInfo} aria-label="Train count">
            <div>
              <dt>Trains</dt>
              <dd>{trainCount}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </main>
  );
}
