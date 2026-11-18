import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRenderer {
  version?: string;
  bundleType?: number;
}

interface FakeRDTHook {
  renderers: Map<number, FakeRenderer>;
}

const sharedHook: FakeRDTHook = { renderers: new Map() };
const onActiveListeners = new Set<() => void>();
const initReactScanInstrumentation = vi.fn();

vi.stubGlobal("window", {
  ...globalThis,
  self: globalThis,
  top: globalThis,
  document: {
    createElement: () => ({
      attachShadow: () => ({ appendChild: () => undefined }),
      appendChild: () => undefined,
      style: {},
      setAttribute: () => undefined,
      remove: () => undefined,
    }),
    documentElement: { appendChild: () => undefined },
    createTreeWalker: () => undefined,
  },
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  __REACT_SCAN_EXTENSION__: undefined,
});

vi.mock("bippy", () => {
  return {
    detectReactBuildType: (renderer: FakeRenderer) => {
      if (typeof renderer.version === "string" && (renderer.bundleType ?? 0) > 0) {
        return "development";
      }
      return "production";
    },
    getRDTHook: (onActive?: () => void) => {
      if (onActive) {
        onActiveListeners.add(onActive);
      }
      return sharedHook;
    },
    getType: () => null,
    isInstrumentationActive: () => false,
  };
});

vi.mock("src/new-outlines", () => ({
  initReactScanInstrumentation: (...args: unknown[]) => initReactScanInstrumentation(...args),
}));

vi.mock("~web/utils/check-react-grab-version", () => ({
  checkReactGrabVersion: () => undefined,
}));

vi.mock("~web/utils/helpers", () => ({
  readLocalStorage: () => null,
  saveLocalStorage: () => undefined,
}));

vi.mock("~web/toolbar", () => ({
  createToolbar: () => ({ remove: () => undefined }),
}));

vi.mock("~web/assets/css/styles.css", () => ({
  default: "",
}));

vi.mock("./notifications/event-tracking", () => ({
  startTimingTracking: () => () => undefined,
}));

vi.mock("./notifications/outline-overlay", () => ({
  createHighlightCanvas: () => () => undefined,
}));

const importFreshStart = async () => {
  vi.resetModules();
  initReactScanInstrumentation.mockClear();
  onActiveListeners.clear();
  const mod = (await import("~core/index")) as typeof import("~core/index");
  return mod;
};

beforeEach(() => {
  sharedHook.renderers.clear();
  onActiveListeners.clear();
  initReactScanInstrumentation.mockClear();
});

describe("start production gate (#419)", () => {
  it("does not bail when only an unidentifiable Refresh stub is registered", async () => {
    sharedHook.renderers.set(1, {});
    const { start, ReactScanInternals } = await importFreshStart();
    ReactScanInternals.options.value = {
      ...ReactScanInternals.options.value,
      dangerouslyForceRunInProduction: false,
    };

    start();

    expect(initReactScanInstrumentation).toHaveBeenCalledTimes(1);
  });

  it("bails for identifiable production renderers but retries when a dev renderer arrives", async () => {
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 0 });
    const { start, ReactScanInternals } = await importFreshStart();
    ReactScanInternals.options.value = {
      ...ReactScanInternals.options.value,
      dangerouslyForceRunInProduction: false,
    };

    start();
    expect(initReactScanInstrumentation).not.toHaveBeenCalled();
    expect(onActiveListeners.size).toBeGreaterThan(0);

    sharedHook.renderers.set(2, { version: "19.0.0", bundleType: 1 });
    for (const listener of onActiveListeners) {
      listener();
    }

    expect(initReactScanInstrumentation).toHaveBeenCalledTimes(1);
  });

  it("starts immediately when dangerouslyForceRunInProduction is set", async () => {
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 0 });
    const { start, ReactScanInternals } = await importFreshStart();
    ReactScanInternals.options.value = {
      ...ReactScanInternals.options.value,
      dangerouslyForceRunInProduction: true,
    };

    start();

    expect(initReactScanInstrumentation).toHaveBeenCalledTimes(1);
  });
});
