/**
 * Sync the backend's captured demo showcase into src/fixtures/showcase.json.
 *
 * Why a build-time copy rather than a fetch
 * -----------------------------------------
 * The showcase is what a visitor without an API key sees, so it is the first
 * thing on the critical path. Importing it as a module means zero network calls,
 * it survives a cold or unreachable Space, and it can be prerendered. The
 * trade-off is that this copy can drift from the backend, which is what this
 * script exists to prevent -- run it whenever the capture is regenerated.
 *
 * This is deliberately NOT wired into `npm run build`: the build must not depend
 * on a sibling checkout being present, or CI and Docker builds break. The
 * fixture is committed; refresh it explicitly, like `icons:generate`.
 *
 * Usage
 * -----
 *   npm run showcase:sync                      # from ../InerviewAst (default)
 *   npm run showcase:sync -- --from ../backend  # from another checkout
 *   npm run showcase:sync -- --url https://intvmate-interview-assistant.hf.space
 *                                              # from a running deploy
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const OUT_PATH = resolve(REPO_ROOT, "src/fixtures/showcase.json");

const DEFAULT_BACKEND_DIR = resolve(REPO_ROOT, "../InerviewAst");
const BACKEND_RELATIVE_PATH = "app/data/demo_showcase.json";

const REQUIRED_SECTIONS = ["copilot", "mirror", "code", "practice"];

/**
 * Kept in step with `_FAILURE_MARKERS` in the backend's app/routers/demo.py.
 * A capture that recorded a provider error must never reach the landing page:
 * presenting it as product output is worse than showing nothing.
 */
const FAILURE_MARKERS = [
  "couldn't be parsed",
  "could not be generated",
  "Invalid API Key",
  "Error code:",
  "Please retry",
];

function parseArgs(argv) {
  const args = { from: null, url: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--from") args.from = argv[i + 1];
    if (argv[i] === "--url") args.url = argv[i + 1];
  }
  return args;
}

async function loadRaw({ from, url }) {
  if (url) {
    const endpoint = `${url.replace(/\/$/, "")}/api/demo/showcase`;
    process.stdout.write(`fetching ${endpoint}\n`);
    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(
        `${endpoint} returned ${res.status}. A 503 means the deploy is missing ` +
          `app/data/demo_showcase.json — check it was committed.`
      );
    }
    return await res.text();
  }

  const dir = from ? resolve(process.cwd(), from) : DEFAULT_BACKEND_DIR;
  const path = resolve(dir, BACKEND_RELATIVE_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `no showcase at ${path}\n` +
        `       pass --from <backend-checkout> or --url <deployed-base-url>.\n` +
        `       to (re)generate it: python scripts/capture_demo.py (in the backend repo)`
    );
  }
  process.stdout.write(`reading ${path}\n`);
  return readFileSync(path, "utf8");
}

/** Every reason this payload must not be shipped, not just the first. */
function validate(raw) {
  const problems = [];
  const blob = raw.toLowerCase();

  for (const marker of FAILURE_MARKERS) {
    if (blob.includes(marker.toLowerCase())) {
      problems.push(`contains captured failure text ${JSON.stringify(marker)}`);
    }
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    problems.push(`is not valid JSON: ${err.message}`);
    return { problems, data: null };
  }

  const missing = REQUIRED_SECTIONS.filter((k) => !(k in data));
  if (missing.length) problems.push(`is missing sections: ${missing.join(", ")}`);

  // The exclusion rule is the whole reason the practice section is worth
  // showing. If no answer demonstrates it, the fixture has lost its point even
  // though nothing technically errored.
  const perAnswer = data?.practice?.per_answer ?? [];
  const showsExclusion = perAnswer.some(
    (a) =>
      Array.isArray(a?.measured_dimensions) &&
      a.measured_dimensions.length === 1 &&
      a.measured_dimensions[0] === "correctness"
  );
  if (!showsExclusion) {
    problems.push(
      "no answer demonstrates dimension exclusion (expected the coding answer " +
        "to measure correctness only)"
    );
  }

  return { problems, data };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let raw;
  try {
    raw = await loadRaw(args);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 2;
  }

  const { problems } = validate(raw);
  if (problems.length) {
    process.stderr.write("\nrefusing to write — the showcase is not shippable:\n");
    for (const problem of problems) process.stderr.write(`  - it ${problem}\n`);
    process.stderr.write(`\n${OUT_PATH} left unchanged.\n`);
    return 1;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  // Re-serialise so the committed fixture has stable formatting regardless of
  // how the backend wrote it, keeping diffs readable.
  writeFileSync(OUT_PATH, `${JSON.stringify(JSON.parse(raw), null, 2)}\n`, "utf8");

  const kb = (Buffer.byteLength(raw, "utf8") / 1024).toFixed(1);
  process.stdout.write(`wrote src/fixtures/showcase.json (${kb}KB)\n`);
  if (Number(kb) > 22) {
    process.stdout.write(
      `warning: over the 22KB budget in STRATAX_LANDING_EXPERIENCE_DESIGN.md §5.3\n`
    );
  }
  return 0;
}

process.exit(await main());
