import { Fragment, useState, useSyncExternalStore } from "react";
import { ControlRenderer, DialStore, Folder, PresetManager } from "dialkit";
import { CONTROL_PANEL_ID } from "./constants";
import { RouteSelector } from "./RouteSelector";

interface MapControlsProps {
  routes: readonly string[];
  onRoutesChange: (routes: readonly string[]) => void;
}

const subscribe = (listener: () => void) =>
  DialStore.subscribe(CONTROL_PANEL_ID, listener);
const getValues = () => DialStore.getValues(CONTROL_PANEL_ID);
const serverValues = {};

/** Compose DialKit's controls so the custom multi-select shares the same panel. */
export function MapControls({ routes, onRoutesChange }: MapControlsProps) {
  const values = useSyncExternalStore(subscribe, getValues, () => serverValues);
  const [copyStatus, setCopyStatus] = useState("Copy parameters");
  const panel = DialStore.getPanel(CONTROL_PANEL_ID);

  if (!panel) return null;

  async function copyParameters() {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ ...values, routes }, null, 2),
      );
      setCopyStatus("Parameters copied");
    } catch {
      setCopyStatus("Unable to copy parameters");
    }
  }

  return (
    <div className="dialkit-root" data-mode="inline" data-theme="dark">
      <div className="dialkit-panel" data-mode="inline">
        <div className="dialkit-panel-wrapper">
          <Folder
            title={panel.name}
            isRoot
            inline
            open
            toolbar={
              <>
                <PresetManager
                  panelId={CONTROL_PANEL_ID}
                  presets={DialStore.getPresets(CONTROL_PANEL_ID)}
                  activePresetId={DialStore.getActivePresetId(CONTROL_PANEL_ID)}
                />
                <button
                  type="button"
                  className="dialkit-toolbar-add dialkit-toolbar-primary"
                  aria-label={copyStatus}
                  title={copyStatus}
                  onClick={copyParameters}
                  onBlur={() => setCopyStatus("Copy parameters")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="8" y="3" width="8" height="4" rx="1" />
                    <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                  </svg>
                </button>
              </>
            }
          >
            {panel.controls.map((control) => (
              <Fragment key={control.path}>
                <ControlRenderer
                  panelId={CONTROL_PANEL_ID}
                  controls={[control]}
                  values={values}
                />
                {control.path === "layout" && (
                  <RouteSelector selected={routes} onChange={onRoutesChange} />
                )}
              </Fragment>
            ))}
          </Folder>
        </div>
      </div>
    </div>
  );
}
