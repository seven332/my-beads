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
export interface ImagePreview {
  sample: SampledImage;
  mapped: MappedImage;
}
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
  preview: ImagePreview | null;
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
export const changeImageSettings$ = command(({ get, set }, options: ImageOptions) => {
  const session = get(sessionState$);
  if (session && (session.loading || session.pixels))
    set(sessionState$, { ...session, options, settingsDirty: true, error: "" });
});
export const updateImage$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (!session?.pixels) return;
  let sample: SampledImage;
  try {
    sample = sampleImage(session.pixels, session.options);
  } catch (error) {
    set(sessionState$, { ...session, settingsDirty: false, error: captureError(error) });
    return;
  }
  const sources = new Set(sample.colors.map((color) => color.hex));
  const overrides = Object.fromEntries(
    Object.entries(session.overrides).filter(([source]) => sources.has(source)),
  );
  try {
    const mapped = mapImage(sample, session.options, overrides);
    set(sessionState$, {
      ...session,
      sample,
      preview: { sample, mapped },
      settingsDirty: false,
      overrides,
      error: "",
    });
  } catch (error) {
    set(sessionState$, {
      ...session,
      sample,
      settingsDirty: false,
      overrides,
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
      preview: null,
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
          settingsDirty: false,
          error: new UiError("imageChangedLoading"),
        });
        return;
      }
      set(sessionState$, { ...session, loading: false, pixels });
      set(updateImage$);
    } catch (error) {
      signal.throwIfAborted();
      if (get(imageTokenState$) === token) {
        const session = get(sessionState$)!;
        set(sessionState$, {
          ...session,
          loading: false,
          settingsDirty: false,
          error: captureError(error),
        });
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
  set(sessionState$, { ...session, overrides });
  set(updateImage$);
});
export const applyImage$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (!session?.preview || session.loading || session.settingsDirty || session.error) return false;
  const applied = set(
    replaceIfCurrent$,
    session.revision,
    session.preview.mapped.grid,
    session.name.replace(/\.(png|webp)$/i, ""),
  );
  if (!applied) {
    set(sessionState$, { ...session, error: new UiError("imageChangedApplying") });
    return false;
  }
  set(cancelImage$);
  return true;
});
