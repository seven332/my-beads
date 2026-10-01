import { expect, it, vi } from "vitest";
import { createPreviewController, type PreviewLoader } from "../src/preview-3d-controller.js";
import type { PreviewSession, PreviewStatus } from "../src/preview-3d-state.js";

const session: PreviewSession = {
  id: 1,
  grid: [["H7"]],
  title: "Preview",
  beads: 1,
  status: "loading",
  mode: "board",
  shadows: false,
  shadowsAvailable: false,
};
const renderer = () => ({
  theme: vi.fn(),
  action: vi.fn(),
  destroy: vi.fn(),
  shadows: vi.fn(),
  mode: vi.fn(),
  shadowsAvailable: true,
});

it("rejects late loading and notifications, disposes on close, and uses the latest theme", async () => {
  const report = vi.fn();
  let resolve!: (module: Awaited<ReturnType<PreviewLoader>>) => void;
  const load = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<PreviewLoader>>>((done) => {
        resolve = done;
      }),
  );
  const controller = createPreviewController(report, load);
  const canvas = document.createElement("canvas");
  controller.sync(canvas, session, "light");
  await Promise.resolve();
  controller.sync(undefined, null, "light");
  const mount = vi.fn(renderer);
  resolve({ mountPreview3D: mount });
  let status!: (value: PreviewStatus) => void;
  const live = renderer();
  load.mockImplementation(async () => ({
    mountPreview3D: vi.fn((_canvas, _grid, theme, notify) => {
      expect(theme).toBe("dark");
      status = notify;
      notify("ready");
      return live;
    }),
  }));
  controller.sync(canvas, { ...session, id: 2 }, "light");
  controller.sync(canvas, { ...session, id: 2 }, "dark");
  await vi.waitFor(() => expect(report).toHaveBeenCalledWith(2, "ready", true));
  // Wait for the reopened renderer to settle before checking the old module;
  // an immediate negative assertion could pass before its continuation ran.
  expect(mount).not.toHaveBeenCalled();
  controller.action("left");
  expect(live.action).toHaveBeenCalledWith("left");
  controller.sync(canvas, { ...session, id: 2 }, "light");
  expect(live.theme).toHaveBeenCalledWith("light");
  controller.sync(
    canvas,
    { ...session, id: 2, status: "ready", shadows: true, shadowsAvailable: true },
    "light",
  );
  expect(live.shadows).toHaveBeenCalledWith(true);
  controller.sync(canvas, { ...session, id: 2, status: "ready", mode: "fused" }, "light");
  expect(live.mode).toHaveBeenLastCalledWith("fused");
  expect(live.destroy).not.toHaveBeenCalled();
  const modeCalls = live.mode.mock.calls.length;
  controller.sync(canvas, { ...session, id: 2, status: "ready", mode: "fused" }, "light");
  expect(live.mode).toHaveBeenCalledTimes(modeCalls);
  controller.destroy();
  controller.destroy();
  expect(live.destroy).toHaveBeenCalledOnce();
  status("failed");
  await Promise.resolve();
  expect(report.mock.calls.some((call) => call[0] === 2 && call[1] === "failed")).toBe(false);
});

it("reports import/init failures and releases a renderer after context failure", async () => {
  for (const load of [
    () => Promise.reject(new Error("offline")),
    async () => ({
      mountPreview3D: () => {
        throw new Error("no GPU");
      },
    }),
  ]) {
    const report = vi.fn();
    const controller = createPreviewController(report, load);
    controller.sync(document.createElement("canvas"), session, "light");
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(1, "failed", undefined));
    controller.destroy();
  }
  const report = vi.fn();
  const live = renderer();
  let status!: (value: PreviewStatus) => void;
  const controller = createPreviewController(report, async () => ({
    mountPreview3D: (_canvas, _grid, _theme, notify) => {
      status = notify;
      return live;
    },
  }));
  controller.sync(document.createElement("canvas"), session, "light");
  await vi.waitFor(() => expect(status).toBeTypeOf("function"));
  status("failed");
  await vi.waitFor(() => expect(live.destroy).toHaveBeenCalledOnce());
  controller.destroy();
  expect(live.destroy).toHaveBeenCalledOnce();
});
