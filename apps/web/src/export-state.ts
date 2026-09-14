import { command, computed, state } from "ccstate";
import type { ExportFormat } from "./exports.js";
import { finishStroke$, reportError$, workflow$ } from "./state.js";

const exportState$ = state({
  open: false,
  format: "csv" as ExportFormat,
  scale: "16",
  width: "2400",
  pending: false,
});
export const exportSettings$ = computed((get) => get(exportState$));
export type ExportSettings = ReturnType<typeof exportSettings$.read>;
export const openExport$ = command(({ get, set }) => {
  if (get(workflow$).page !== "edit") return;
  set(finishStroke$);
  set(reportError$, "");
  set(exportState$, { ...get(exportState$), open: true });
});
export const closeExport$ = command(({ get, set }) => {
  set(exportState$, { ...get(exportState$), open: false, pending: false });
  set(reportError$, "");
});
export const selectExportFormat$ = command(({ get, set }, format: ExportFormat) => {
  set(exportState$, { ...get(exportState$), format });
  set(reportError$, "");
});
export const changeExportSize$ = command(
  ({ get, set }, field: "scale" | "width", value: string) => {
    set(exportState$, { ...get(exportState$), [field]: value });
    set(reportError$, "");
  },
);
export const reportExportPending$ = command(({ get, set }, pending: boolean) => {
  set(exportState$, { ...get(exportState$), pending });
});
