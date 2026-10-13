/**
 * scripts/vendor-sim.ts
 *
 * Vendor the two files chapter 8 is built on from Disaggregated_Inference_Sim
 * at a pinned commit, and record which one:
 *
 *     pnpm vendor <commit> [path/to/Disaggregated_Inference_Sim]
 *
 * - `web/sim_engine.js`: the simulator's own JavaScript engine (bit-exact
 *   with its Python package, tested there and again here), which chapter 8's
 *   animation runs live in a Web Worker;
 * - `examples/results.md`: the simulator's recorded results, whose
 *   validation section (22) the chapter links and quotes.
 *
 * Each file is copied byte for byte from `git show <commit>:<path>` (never
 * from the working tree, so local edits cannot leak in) into
 * `src/lib/racks/vendor/`, and `VENDORED.json` next to them records the
 * repository, the full commit hash, its date and each file's SHA-256. The
 * commit must already be on the simulator's `origin`, so anyone can check
 * the pin. tests/unit/disagg.test.ts fails if a copy, a recorded hash or the
 * fixtures' commit disagree; CI's "Model and fixtures" job checks out the
 * simulator at that commit, compares both files and re-runs the reference.
 *
 * After vendoring, regenerate the recorded workloads and parity fixtures at
 * the same commit:
 *
 *     <sim>/.venv/bin/python scripts/disagg_reference.py <sim>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FILES = [
  { path: "web/sim_engine.js", dest: "sim_engine.js" },
  { path: "examples/results.md", dest: "results.md" },
] as const;

const ref = process.argv[2];
if (!ref) {
  console.error(
    "usage: pnpm vendor <commit> [path/to/Disaggregated_Inference_Sim]",
  );
  process.exit(2);
}
const sim = resolve(
  process.argv[3] ?? join(process.cwd(), "..", "Disaggregated_Inference_Sim"),
);
const git = (...args: string[]): string =>
  execFileSync("git", ["-C", sim, ...args], { encoding: "utf-8" }).trim();

const commit = git("rev-parse", "--verify", `${ref}^{commit}`);
const remote = git("branch", "-r", "--contains", commit);
if (!/origin\//.test(remote)) {
  console.error(`${commit} is not on origin: push it before vendoring.`);
  process.exit(1);
}
const dest = join(process.cwd(), "src", "lib", "racks", "vendor");
const files = FILES.map((f) => {
  const source = execFileSync("git", [
    "-C",
    sim,
    "show",
    `${commit}:${f.path}`,
  ]);
  writeFileSync(join(dest, f.dest), source);
  const sha256 = createHash("sha256").update(source).digest("hex");
  console.log(`vendored ${f.path} @ ${commit.slice(0, 7)} (${sha256})`);
  return { path: f.path, file: f.dest, sha256 };
});
const record = {
  repository:
    "https://github.com/BrendanJamesLynskey/Disaggregated_Inference_Sim",
  commit,
  committed: git("show", "-s", "--format=%cI", commit),
  files,
};
writeFileSync(
  join(dest, "VENDORED.json"),
  JSON.stringify(record, null, 2) + "\n",
);
