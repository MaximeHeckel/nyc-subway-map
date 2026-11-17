import { useEffect, useId, useRef, useState } from "react";
import { colors, routeOrder } from "@/data/routes";
import styles from "./RouteSelector.module.css";

interface RouteSelectorProps {
  selected: readonly string[];
  onChange: (routes: readonly string[]) => void;
}

export function RouteSelector({ selected, onChange }: RouteSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const allRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedSet = new Set(selected);
  const allSelected = routeOrder.every((route) => selectedSet.has(route));
  const summary = allSelected
    ? "All services"
    : selected.length
      ? routeOrder.filter((route) => selectedSet.has(route)).join(", ")
      : "No services";

  useEffect(() => {
    if (!open) return;

    allRef.current?.focus();

    function dismiss(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function toggleRoute(route: string) {
    const next = new Set(selected);

    if (next.has(route)) {
      next.delete(route);
    } else {
      next.add(route);
    }

    onChange(routeOrder.filter((id) => next.has(id)));
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Routes</span>
        <span className={styles.summary} title={summary}>
          {summary}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d={open ? "M3 7.5 6 4.5 9 7.5" : "M3 4.5 6 7.5 9 4.5"}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          className={styles.menu}
          role="group"
          aria-label="Select routes"
        >
          <button
            ref={allRef}
            type="button"
            role="checkbox"
            className={styles.all}
            aria-checked={
              allSelected ? true : selected.length > 0 ? "mixed" : false
            }
            onClick={() => onChange(allSelected ? [] : [...routeOrder])}
          >
            <span
              className={styles.check}
              data-checked={selected.length > 0}
              aria-hidden="true"
            >
              {allSelected ? "✓" : selected.length > 0 ? "−" : ""}
            </span>
            <span>All services</span>
          </button>
          {routeOrder.map((route) => (
            <button
              key={route}
              type="button"
              role="checkbox"
              className={styles.option}
              aria-checked={selectedSet.has(route)}
              onClick={() => toggleRoute(route)}
            >
              <span
                className={styles.check}
                data-checked={selectedSet.has(route)}
                aria-hidden="true"
              >
                {selectedSet.has(route) ? "✓" : ""}
              </span>
              <span
                className={styles.swatch}
                style={{ backgroundColor: colors[route] }}
                aria-hidden="true"
              />
              <span>{route}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
