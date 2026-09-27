import { command, computed, state } from "ccstate";
import type { PatternGrid } from "@my-beads/core";
import { editor$, finishStroke$, workflow$ } from "./state.js";

export type PreviewStatus = "loading" | "ready" | "failed";
export interface PreviewSession {
  id: number;
  grid: PatternGrid;
  title: string;
  beads: number;
  status: PreviewStatus;
}
const sessionState$ = state<PreviewSession | null>(null);
const sequence$ = state(0);
export const previewSession$ = computed((get) => get(sessionState$));

export const openPreview$ = command(({ get, set }) => {
  if (get(workflow$).page !== "edit" || get(sessionState$)) return;
  set(finishStroke$);
  const model = get(editor$);
  const id = get(sequence$) + 1;
  set(sequence$, id);
  set(sessionState$, {
    id,
    grid: model.document.grid,
    title: model.title,
    beads: model.beads,
    status: "loading",
  });
});
export const closePreview$ = command(({ set }) => set(sessionState$, null));
export const reportPreview$ = command(({ get, set }, id: number, status: PreviewStatus) => {
  const session = get(sessionState$);
  if (session?.id === id && session.status !== status) set(sessionState$, { ...session, status });
});
