"use client";

/**
 * Load the recorded requests and run a rack configuration on them in a Web
 * Worker (off the main thread; inline as a fallback). One shared worker
 * runs the simulations in order. Adapted from the companion sites' runner.
 */
import {
  runRack,
  type EngineConfig,
  type Row,
  type Run,
} from "@/lib/racks/disagg";

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (r: Run) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./sim.worker.ts", import.meta.url));
    worker.onmessage = (
      e: MessageEvent<{ id: number; run?: Run; error?: string }>,
    ) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.run) w.resolve(e.data.run);
      else w.reject(new Error(e.data.error ?? "simulation failed"));
    };
  } catch {
    worker = null; // no workers: run on the main thread below
  }
  return worker;
}

export function simulate(rows: Row[], cfg: EngineConfig): Promise<Run> {
  const w = getWorker();
  if (w) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, rows, cfg });
    });
  }
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(runRack(cfg, rows));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }, 0),
  );
}

let rowsPromise: Promise<Row[]> | null = null;

/** The requests exactly as the reference generated them. */
export function loadRows(): Promise<Row[]> {
  if (!rowsPromise) {
    rowsPromise = fetch("/racks/disagg/workload.json")
      .then((r) => {
        if (!r.ok) throw new Error(`workload: HTTP ${r.status}`);
        return r.json() as Promise<{ rows: Row[] }>;
      })
      .then((d) => d.rows);
    rowsPromise.catch(() => {
      rowsPromise = null;
    });
  }
  return rowsPromise;
}
