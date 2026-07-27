import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: function matchMedia(query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function addListener() {},
      removeListener: function removeListener() {},
      addEventListener: function addEventListener() {},
      removeEventListener: function removeEventListener() {},
      dispatchEvent: function dispatchEvent() {
        return false;
      },
    };
  },
});

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver;
