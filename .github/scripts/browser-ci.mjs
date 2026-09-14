import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function browserTestsRequired(paths) {
  const documentation =
    /^(?:README\.md|CONTRIBUTING\.md|docs\/.+\.md|\.github\/PULL_REQUEST_TEMPLATE\.md|\.github\/ISSUE_TEMPLATE\/[^/]+\.md)$/;
  return (
    paths.length === 0 || paths.some((path) => !path.endsWith(".md") || !documentation.test(path))
  );
}

export function detectBrowserChanges(eventName, event, cwd = process.cwd()) {
  const base = eventName === "pull_request" ? event.pull_request?.base?.sha : event.before;
  const head = eventName === "pull_request" ? event.pull_request?.head?.sha : event.after;
  const commit = /^(?!0{40}$)[a-f0-9]{40}$/;
  if (!["pull_request", "push"].includes(eventName) || !commit.test(base) || !commit.test(head)) {
    return { required: true, reason: "No complete commit comparison; running browser tests." };
  }
  try {
    const range = eventName === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
    // Include both old and new paths of renames, and preserve whitespace in filenames.
    const diff = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", range, "--"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const paths = diff.split("\0").filter(Boolean);
    const required = browserTestsRequired(paths);
    return {
      required,
      reason: required
        ? "Runtime, unknown, or empty changes; running browser tests."
        : `Only known documentation changed (${paths.length} files); browser tests skipped.`,
    };
  } catch {
    return { required: true, reason: "Commit comparison unavailable; running browser tests." };
  }
}

export function browserChecksPassed(needs) {
  if (needs?.changes?.result !== "success") return false;
  const required = needs.changes.outputs?.browser;
  if (required !== "true" && required !== "false") return false;
  const expected = required === "true" ? "success" : "skipped";
  return needs.e2e?.result === expected && needs.production?.result === expected;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "changes") {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const result = detectBrowserChanges(process.env.GITHUB_EVENT_NAME, event);
    appendFileSync(process.env.GITHUB_OUTPUT, `browser=${result.required}\n`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.reason}\n`);
    console.log(result.reason);
  } else if (process.argv[2] === "gate") {
    const passed = browserChecksPassed(JSON.parse(process.env.BROWSER_NEEDS));
    console.log(
      passed ? "Browser checks passed or intentionally skipped." : "Browser checks failed.",
    );
    process.exitCode = passed ? 0 : 1;
  } else {
    throw new Error("Expected changes or gate command.");
  }
}
