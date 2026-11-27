"use client";

import { useCallback, useEffect, useState } from "react";

interface WatchControlsProps {
  root: string | null;
  busy: boolean;
  onTick: () => Promise<void>;
}

export default function WatchControls({ root, busy, onTick }: WatchControlsProps) {
  const [intervalSec, setIntervalSec] = useState(10);
  const [watching, setWatching] = useState(false);
  const [lastTick, setLastTick] = useState<number | null>(null);

  const tick = useCallback(async () => {
    setLastTick(Date.now());
    await onTick();
  }, [onTick]);

  // If no root is scanned yet, effective watching is off: derive it instead
  // of syncing state in an effect (avoids cascading renders).
  const active = watching && !!root;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (!busy) void tick();
    }, Math.max(3, intervalSec) * 1000);
    return () => window.clearInterval(id);
  }, [active, busy, intervalSec, tick]);

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      {active && <span className="inline-block size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
      <label className="flex items-center gap-1">
        watch
        <input
          type="checkbox"
          checked={watching}
          disabled={!root}
          onChange={(e) => {
            if (e.target.checked) void tick();
            setWatching(e.target.checked);
          }}
          className="accent-emerald-600"
        />
      </label>
      <select
        value={intervalSec}
        onChange={(e) => setIntervalSec(Number(e.target.value))}
        disabled={!watching}
        className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value={5}>5s</option>
        <option value={10}>10s</option>
        <option value={30}>30s</option>
        <option value={60}>60s</option>
      </select>
      {lastTick && <span className="text-xs">last tick {new Date(lastTick).toLocaleTimeString()}</span>}
      {watching && !root && (
        <span className="text-xs text-zinc-400">scan a path first</span>
      )}
    </div>
  );
}
