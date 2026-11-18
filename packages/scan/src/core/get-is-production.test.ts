import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRenderer {
  version?: string;
  bundleType?: number;
  rendererPackageName?: string;
}

interface FakeRDTHook {
  renderers: Map<number, FakeRenderer>;
}

const sharedHook: FakeRDTHook = { renderers: new Map() };

vi.mock("bippy", () => {
  return {
    // Mirrors bippy's detectReactBuildType: missing version/bundleType ⇒ production.
    detectReactBuildType: (renderer: FakeRenderer) => {
      if (typeof renderer.version === "string" && (renderer.bundleType ?? 0) > 0) {
        return "development";
      }
      return "production";
    },
    getRDTHook: () => sharedHook,
    getType: () => null,
    isInstrumentationActive: () => false,
  };
});

const importFreshGetIsProduction = async () => {
  vi.resetModules();
  const mod = (await import("~core/index")) as typeof import("~core/index");
  return mod.getIsProduction;
};

beforeEach(() => {
  sharedHook.renderers.clear();
});

describe("getIsProduction", () => {
  it("returns null when no React renderer has registered yet", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    expect(getIsProduction()).toBeNull();
  });

  it("returns null for React Refresh stub renderers without version/bundleType", async () => {
    // Regression for #419: bippy's Refresh bootstrap injects `{ scheduleRefresh }`
    // with no identity fields. detectReactBuildType maps that to "production",
    // which previously made start() bail before Storybook's real React arrived.
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, {});
    expect(getIsProduction()).toBeNull();
  });

  it("returns null when version is present but bundleType is missing", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, { version: "19.0.0" });
    expect(getIsProduction()).toBeNull();
  });

  it("ignores stub renderers when an identifiable development renderer exists", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, {});
    sharedHook.renderers.set(2, { version: "19.0.0", bundleType: 1 });
    expect(getIsProduction()).toBe(false);
  });

  it("returns true when every identifiable renderer is production", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 0 });
    expect(getIsProduction()).toBe(true);
  });

  it("returns false when at least one identifiable renderer is non-production", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 0 });
    sharedHook.renderers.set(2, { version: "19.0.0", bundleType: 1 });
    expect(getIsProduction()).toBe(false);
  });

  it("does not cache `true` — a later dev renderer flips the result", async () => {
    // Regression guard for #402: the Next.js dev overlay registers a
    // production React build first, then the user's dev React arrives a
    // tick later. Caching `true` on the first call would lock us out.
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 0 });
    expect(getIsProduction()).toBe(true);

    sharedHook.renderers.set(2, { version: "19.0.0", bundleType: 1 });
    expect(getIsProduction()).toBe(false);
  });

  it("caches `false` permanently once a dev renderer has been seen", async () => {
    const getIsProduction = await importFreshGetIsProduction();
    sharedHook.renderers.set(1, { version: "19.0.0", bundleType: 1 });
    expect(getIsProduction()).toBe(false);

    sharedHook.renderers.clear();
    sharedHook.renderers.set(2, { version: "19.0.0", bundleType: 0 });
    expect(getIsProduction()).toBe(false);
  });
});
