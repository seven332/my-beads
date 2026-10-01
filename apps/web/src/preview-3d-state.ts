import { command, computed, state } from "ccstate";
import type { PatternGrid } from "@my-beads/core";
import { editor$, finishStroke$, workflow$ } from "./state.js";

export type PreviewStatus = "loading" | "ready" | "failed";
export type PreviewMode = "board" | "fused";
export interface PreviewSession {
  id: number;
  grid: PatternGrid;
  title: string;
  beads: number;
  status: PreviewStatus;
  mode: PreviewMode;
  shadows: boolean;
  shadowsAvailable: boolean;
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
    mode: "board",
    shadows: false,
    shadowsAvailable: false,
  });
});
export const closePreview$ = command(({ set }) => set(sessionState$, null));
export const reportPreview$ = command(
  ({ get, set }, id: number, status: PreviewStatus, shadowsAvailable = false) => {
    const session = get(sessionState$);
    if (session?.id === id)
      set(sessionState$, {
        ...session,
        status,
        shadowsAvailable: status === "ready" && shadowsAvailable,
        shadows: status === "ready" && session.shadows,
      });
  },
);
export const togglePreviewShadows$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (session?.status === "ready" && session.shadowsAvailable)
    set(sessionState$, { ...session, shadows: !session.shadows });
});

export const selectPreviewMode$ = command(({ get, set }, mode: PreviewMode) => {
  const session = get(sessionState$);
  if (session?.status === "ready" && session.mode !== mode)
    set(sessionState$, { ...session, mode });
});
