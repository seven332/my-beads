// jsdom has no media-query engine. Browser tests exercise actual OS theme changes.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (media: string) => Object.assign(new EventTarget(), { matches: false, media }),
});
