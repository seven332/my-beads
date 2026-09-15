import { UiError, errorText, captureError } from "./errors.js";
import { translation$ } from "./locale.js";
import { command, computed, state } from "ccstate";
import {
  sampleImage,
  mapImage,
  type RgbaImage,
  type SamplingOptions,
  type MatchOptions,
  type SampledImage,
  type MappedImage,
} from "@my-beads/core";
import { documentRevision$, editor$, replaceIfCurrent$ } from "./state.js";

export interface ImageOptions extends SamplingOptions, Omit<MatchOptions, "series"> {}
export interface ImageSession {
  id: number;
  name: string;
  revision: number;
  loading: boolean;
  settingsDirty: boolean;
  error: string;
  pixels: RgbaImage | null;
  options: ImageOptions;
  sample: SampledImage | null;
  mapped: MappedImage | null;
  overrides: Readonly<Record<string, string>>;
}
type ImageSessionState = Omit<ImageSession, "error"> & { error: Error | "" };
const sessionState$ = state<ImageSessionState | null>(null);
const imageTokenState$ = state(0);
export const imageSession$ = computed((get) => {
  const session = get(sessionState$);
  return session ? { ...session, error: errorText(session.error, get(translation$)) } : null;
});
export const cancelImage$ = command(({ get, set }) => {
  set(imageTokenState$, get(imageTokenState$) + 1);
  set(sessionState$, null);
});
export const changeImageSettings$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (session && !session.settingsDirty) set(sessionState$, { ...session, settingsDirty: true });
});
export const updateImage$ = command(({ get, set }, options: ImageOptions) => {
  const session = get(sessionState$);
  if (!session?.pixels) return;
  try {
    const sample = sampleImage(session.pixels, options);
    const mapped = mapImage(sample, options);
    set(sessionState$, {
      ...session,
      options,
      sample,
      mapped,
      settingsDirty: false,
      overrides: {},
      error: "",
    });
  } catch (error) {
    set(sessionState$, {
      ...session,
      options,
      sample: null,
      mapped: null,
      settingsDirty: true,
      overrides: {},
      error: captureError(error),
    });
  }
});
export interface ImageSource {
  name: string;
  read(signal: AbortSignal): Promise<RgbaImage>;
}
export const loadImage$ = command(
  async ({ get, set }, source: ImageSource, signal: AbortSignal) => {
    signal.throwIfAborted();
    const token = get(imageTokenState$) + 1;
    const revision = get(documentRevision$);
    const grid = get(editor$).document.grid;
    const options: ImageOptions = {
      columns: grid[0].length,
      rows: grid.length,
      alpha: 128,
      includeNeutral: false,
      unique: false,
    };
    set(imageTokenState$, token);
    set(sessionState$, {
      id: token,
      name: source.name,
      revision,
      loading: true,
      settingsDirty: false,
      error: "",
      pixels: null,
      options,
      sample: null,
      mapped: null,
      overrides: {},
    });
    try {
      const pixels = await source.read(signal);
      signal.throwIfAborted();
      if (get(imageTokenState$) !== token) return;
      const session = get(sessionState$)!;
      if (get(documentRevision$) !== revision) {
        set(sessionState$, {
          ...session,
          loading: false,
          error: new UiError("imageChangedLoading"),
        });
        return;
      }
      set(sessionState$, { ...session, loading: false, pixels });
      set(updateImage$, options);
      if (session.settingsDirty) set(changeImageSettings$);
    } catch (error) {
      signal.throwIfAborted();
      if (get(imageTokenState$) === token) {
        const session = get(sessionState$)!;
        set(sessionState$, { ...session, loading: false, error: captureError(error) });
      }
    }
  },
);
export const overrideImage$ = command(({ get, set }, source: string, code: string) => {
  const session = get(sessionState$);
  if (!session?.sample) return;
  const overrides = { ...session.overrides };
  if (code) overrides[source] = code;
  else delete overrides[source];
  try {
    const mapped = mapImage(session.sample, session.options, overrides);
    set(sessionState$, { ...session, overrides, mapped, error: "" });
  } catch (error) {
    set(sessionState$, { ...session, overrides, error: captureError(error) });
  }
});
export const applyImage$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (!session?.mapped || session.loading || session.settingsDirty || session.error) return false;
  const applied = set(
    replaceIfCurrent$,
    session.revision,
    session.mapped.grid,
    session.name.replace(/\.(png|webp)$/i, ""),
  );
  if (!applied) {
    set(sessionState$, { ...session, error: new UiError("imageChangedApplying") });
    return false;
  }
  set(cancelImage$);
  return true;
});
