import { expect, it } from "vitest";
import {
  createDrafts,
  decodeDraft,
  draftText,
  DRAFT_KEY,
  type DraftStatus,
  type DraftStorage,
} from "../src/drafts.js";
import { translator } from "../src/i18n/index.js";

const saved = JSON.stringify({ version: 1, title: "Saved", grid: [["H7", null]] });
it("validates draft versions, grids and palette codes before recovery", () => {
  expect(decodeDraft(saved)).toEqual({ title: "Saved", grid: [["H7", null]] });
  for (const raw of [
    "{",
    "null",
    JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 1, title: "Bad", grid: [["H7"], []] }),
    JSON.stringify({ version: 1, title: "Bad", grid: [["#000000"]] }),
    JSON.stringify({ version: 1, title: "Bad", grid: [] }),
    JSON.stringify({ version: 1, title: "Bad", grid: [Array(257).fill(null)] }),
    " ".repeat(1_000_001),
  ]) {
    expect(() => decodeDraft(raw)).toThrow();
  }
});
it("coalesces committed snapshots and skips unchanged initial state", async () => {
  const values = new Map<string, string>(),
    statuses: DraftStatus[] = [];
  let writes = 0;
  const adapter = createDrafts(
    () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes++;
        values.set(key, value);
      },
    }),
    (status) => statuses.push(status),
  );
  expect(adapter.load()).toBeNull();
  const initial = { grid: [[null]], title: "Blank" };
  adapter.observe(initial);
  await Promise.resolve();
  expect(writes).toBe(0);
  adapter.observe({ ...initial });
  await Promise.resolve();
  expect(writes).toBe(0);
  adapter.observe({ grid: [["H7"]], title: "First" });
  adapter.observe({ grid: [["H2"]], title: "Latest" });
  await Promise.resolve();
  expect(writes).toBe(1);
  expect(decodeDraft(values.get(DRAFT_KEY)!)).toEqual({ title: "Latest", grid: [["H2"]] });
  expect(statuses.at(-1)?.error).toBe(false);
  adapter.observe({ grid: [["H5"]], title: "Disposed" });
  adapter.dispose();
  await Promise.resolve();
  expect(writes).toBe(1);
});
it("keeps unsupported and corrupt bytes until an explicit replacement", async () => {
  for (const raw of ["broken", JSON.stringify({ version: 99 })]) {
    let value = raw;
    const statuses: DraftStatus[] = [];
    const adapter = createDrafts(
      () => ({
        getItem: () => value,
        setItem: (_key, next) => {
          value = next;
        },
      }),
      (status) => statuses.push(status),
    );
    expect(adapter.load()).toBeNull();
    adapter.observe({ grid: [[null]], title: "Initial" });
    const edited = { grid: [["H7"]], title: "Edit" };
    adapter.observe(edited);
    await Promise.resolve();
    expect(value).toBe(raw);
    expect(statuses.at(-1)?.action).toBe("replace");
    adapter.retry(edited);
    expect(decodeDraft(value)).toEqual(edited);
    adapter.dispose();
  }
});
it("preserves the old draft on quota failure and supports explicit retry", async () => {
  let value = saved,
    full = true;
  const statuses: DraftStatus[] = [];
  const storage: DraftStorage = {
    getItem: () => value,
    setItem: (_key, next) => {
      if (full) throw new Error("Quota");
      value = next;
    },
  };
  const adapter = createDrafts(
    () => storage,
    (status) => statuses.push(status),
  );
  const restored = adapter.load()!;
  adapter.observe(restored);
  const edited = { grid: [["H5"]], title: "Edited" };
  adapter.observe(edited);
  await Promise.resolve();
  expect(value).toBe(saved);
  expect(statuses.at(-1)?.action).toBe("retry");
  full = false;
  adapter.retry(edited);
  expect(decodeDraft(value)).toEqual(edited);
  adapter.dispose();
});
it("handles unavailable storage and flushes pending work synchronously", () => {
  const statuses: DraftStatus[] = [];
  const unavailable = createDrafts(
    () => {
      throw new Error("Denied");
    },
    (status) => statuses.push(status),
  );
  expect(unavailable.load()).toBeNull();
  expect(draftText(statuses.at(-1)!, translator("en-US"))).toContain("Denied");
  unavailable.dispose();
  let value: string | null = null;
  const adapter = createDrafts(
    () => ({
      getItem: () => value,
      setItem: (_key, next) => {
        value = next;
      },
    }),
    () => {},
  );
  adapter.load();
  adapter.observe({ grid: [[null]], title: "Blank" });
  adapter.observe({ grid: [["H7"]], title: "Final" });
  adapter.flush();
  adapter.dispose();
  expect(decodeDraft(value!)).toEqual({ title: "Final", grid: [["H7"]] });
});
