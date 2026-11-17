import { useEffect, useRef } from "react";
import type { RealtimeSnapshot } from "@/types/transit";
import type { SubwayOptions } from "../types";
import {
  createSubwayRenderer,
  type SubwayRenderer,
} from "../canvas/createRenderer";

export function useSubwayRenderer(
  controls: SubwayOptions,
  setControls: (values: { zoom?: number; playing?: boolean }) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SubwayRenderer | null>(null);
  const snapshotRef = useRef<RealtimeSnapshot | null>(null);
  const controlsRef = useRef(controls);
  const setControlsRef = useRef(setControls);
  controlsRef.current = controls;
  setControlsRef.current = setControls;

  // Replace the animation loop when HMR updates the imperative renderer.
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const options = { ...controlsRef.current };

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      options.playing = false;
      setControlsRef.current({ playing: false });
    }

    const renderer = createSubwayRenderer(
      canvasRef.current,
      options,
      (zoom) => {
        setControlsRef.current({ zoom });
      },
    );
    rendererRef.current = renderer;

    if (snapshotRef.current) {
      renderer.setLiveData(snapshotRef.current);
    }

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [createSubwayRenderer]);

  useEffect(() => {
    rendererRef.current?.setOptions(controls);
  }, [controls]);

  function receiveSnapshot(snapshot: RealtimeSnapshot) {
    snapshotRef.current = snapshot;

    return rendererRef.current?.setLiveData(snapshot);
  }

  return { canvasRef, receiveSnapshot };
}
