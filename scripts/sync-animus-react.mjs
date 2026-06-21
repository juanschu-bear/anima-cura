import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const sourceRoot = process.env.ANIMUS_REACT_SOURCE
  ? path.resolve(process.env.ANIMUS_REACT_SOURCE)
  : path.resolve(appRoot, "../../ANIMUS/animus-git/react/src");
const targetRoot = path.resolve(appRoot, "src/vendor/animus-react");
const readmePath = path.join(targetRoot, "README.md");

const files = [
  "index.ts",
  "patientCall.ts",
  "scene.ts",
  "types.ts",
  "useAnimus.ts",
  "wakeWord.ts",
];

function assertDir(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`${label} not found: ${dir}`);
  }
}

function copyFile(name) {
  const source = path.join(sourceRoot, name);
  const target = path.join(targetRoot, name);
  fs.copyFileSync(source, target);
  return { source, target };
}

function readGitMeta() {
  const repoRoot = path.resolve(sourceRoot, "..");
  try {
    const commit = execFileSync("git", ["-C", repoRoot, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const full = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    return { commit, full };
  } catch {
    return { commit: "unknown", full: "unknown" };
  }
}

function updateReadme(commit) {
  const text = fs.readFileSync(readmePath, "utf8");
  const next = text
    .replace(/- Commit: `[^`]+`/u, `- Commit: \`${commit}\``)
    .replace(/- Vendored on: .+/u, `- Vendored on: ${new Date().toISOString().slice(0, 10)}`);
  fs.writeFileSync(readmePath, next);
}

assertDir(sourceRoot, "ANIMUS react source");
assertDir(targetRoot, "Vendored animus-react target");

for (const file of files) copyFile(file);
const meta = readGitMeta();
updateReadme(meta.commit);

process.stdout.write(
  `Synced animus-react from ${sourceRoot}\n` +
  `Source commit: ${meta.commit}\n` +
    `Core files: ${files.join(", ")}\n`,
);
