import { useEffect, useRef, useState } from "react";
import type { RealtimeSnapshot } from "@/types/transit";
import type { SubwayOptions, TrainCoverage } from "../types";
import { POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS } from "../constants";

export function useRealtimeTrains(
  dataMode: SubwayOptions["dataMode"],
  receive: (snapshot: RealtimeSnapshot) => TrainCoverage | undefined,
) {
  const [trainCount, setTrainCount] = useState("Waiting…");
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  useEffect(() => {
    if (dataMode !== "live") {
      setTrainCount("Simulated");
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    async function poll() {
      request = new AbortController();
      const controller = request;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch("/api/trains", {
          signal: request.signal,
          cache: "no-store",
        });
        const snapshot: RealtimeSnapshot = await response.json();

        if (disposed) {
          return;
        }

        if (!Array.isArray(snapshot.trains) || !snapshot.serverTime)
          throw Error("Invalid feed response");
        const coverage = receiveRef.current(snapshot);
        const unmapped = coverage?.unmapped || 0;
        setTrainCount(
          `${coverage?.mapped || 0}${unmapped ? ` (${unmapped} off-map)` : ""}`,
        );
      } catch {
        if (!disposed) {
          setTrainCount("Last known · expires after 2m");
        }
      } finally {
        clearTimeout(timeout);

        if (!disposed) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }
    poll();

    return () => {
      disposed = true;
      clearTimeout(timer);
      request?.abort();
    };
  }, [dataMode]);

  return trainCount;
}
