/**
 * Runs the vendored simulator engine off the main thread, so the page stays
 * responsive while 1,500 requests are simulated. Receives `{ id, rows, cfg }`
 * and replies `{ id, run }` or `{ id, error }`: only plain data crosses back
 * (the summary and each request's timestamps).
 */
import "./worker-global";

import { runRack, type EngineConfig, type Row } from "@/lib/racks/disagg";

type Req = { id: number; rows: Row[]; cfg: EngineConfig };

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, rows, cfg } = e.data;
  try {
    self.postMessage({ id, run: runRack(cfg, rows) });
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
