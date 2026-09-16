import { UiError, errorText, captureError } from "./errors.js";
import { translation$ } from "./locale.js";
import { command, computed, state } from "ccstate";
import {
  BeadError,
  imageGridSize,
  type RgbaImage,
  type ImageConversionOptions,
  type SampledImage,
  type MappedImage,
} from "@my-beads/core";
import type { ImageConverter } from "./image-worker.js";
import { documentRevision$, replaceIfCurrent$ } from "./state.js";

export interface ImageOptions extends ImageConversionOptions {
  lockAspect: boolean;
}
export interface ImagePreview {
  sample: SampledImage;
  mapped: MappedImage;
}
export interface ImageSession {
  id: number;
  version: number;
  name: string;
  revision: number;
  loading: boolean;
  settingsDirty: boolean;
  dimensionsEdited: boolean;
  mappingQuery: string;
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
export const filterImageMappings$ = command(({ get, set }, mappingQuery: string) => {
  const session = get(sessionState$);
  if (session) set(sessionState$, { ...session, mappingQuery });
});
export const changeImageSettings$ = command(({ get, set }, options: ImageOptions) => {
  const session = get(sessionState$);
  if (session && (session.loading || session.pixels))
    set(sessionState$, {
      ...session,
      options,
      version: session.version + 1,
      settingsDirty: true,
      dimensionsEdited:
        session.dimensionsEdited ||
        options.columns !== session.options.columns ||
        options.rows !== session.options.rows,
      error: "",
    });
});
export const updateImage$ = command(
  async ({ get, set }, convert: ImageConverter, signal: AbortSignal) => {
    signal.throwIfAborted();
    const session = get(sessionState$);
    if (!session?.pixels) return;
    const version = session.version + 1;
    set(sessionState$, { ...session, version, settingsDirty: true, error: "" });
    try {
      const result = await convert(
        { pixels: session.pixels, options: session.options, overrides: session.overrides },
        signal,
      );
      signal.throwIfAborted();
      const current = get(sessionState$);
      if (!current || current.id !== session.id || current.version !== version) return;
      if (get(documentRevision$) !== session.revision) {
        set(sessionState$, {
          ...current,
          settingsDirty: false,
          error: new UiError("imageChangedApplying"),
        });
        return;
      }
      set(sessionState$, {
        ...current,
        sample: result.sample ?? current.sample,
        preview:
          result.sample && result.mapped
            ? { sample: result.sample, mapped: result.mapped }
            : current.preview,
        overrides: result.overrides,
        settingsDirty: false,
        error: result.error
          ? new BeadError(result.error.code, result.error.message, result.error.values)
          : "",
      });
    } catch (error) {
      signal.throwIfAborted();
      const current = get(sessionState$);
      if (current?.id === session.id && current.version === version)
        set(sessionState$, { ...current, settingsDirty: false, error: captureError(error) });
    }
  },
);
export interface ImageSource {
  name: string;
  read(signal: AbortSignal): Promise<RgbaImage>;
}
export const loadImage$ = command(
  async ({ get, set }, source: ImageSource, signal: AbortSignal) => {
    signal.throwIfAborted();
    const token = get(imageTokenState$) + 1;
    const revision = get(documentRevision$);
    set(imageTokenState$, token);
    set(sessionState$, {
      id: token,
      version: 0,
      name: source.name,
      revision,
      loading: true,
      settingsDirty: true,
      dimensionsEdited: false,
      mappingQuery: "",
      error: "",
      pixels: null,
      options: {
        columns: 50,
        rows: 50,
        alpha: 128,
        includeNeutral: false,
        unique: false,
        mode: "image",
        maxColors: 24,
        lockAspect: true,
      },
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
      set(sessionState$, {
        ...session,
        loading: false,
        pixels,
        options: session.dimensionsEdited
          ? session.options
          : { ...session.options, ...imageGridSize(pixels.width, pixels.height) },
      });
      return token;
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
  set(sessionState$, {
    ...session,
    overrides,
    version: session.version + 1,
    settingsDirty: true,
    error: "",
  });
});
export const applyImage$ = command(({ get, set }) => {
  const session = get(sessionState$);
  if (!session?.preview || session.loading || session.settingsDirty || session.error) return false;
  const applied = set(
    replaceIfCurrent$,
    session.revision,
    session.preview.mapped.grid,
    session.name.replace(/\.(png|webp|jpe?g)$/i, ""),
  );
  if (!applied) {
    set(sessionState$, { ...session, error: new UiError("imageChangedApplying") });
    return false;
  }
  set(cancelImage$);
  return true;
});
