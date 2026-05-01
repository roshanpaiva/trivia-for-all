import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitize,
  loadDisplayName,
  saveDisplayName,
  loadGroupName,
  saveGroupName,
  MAX_LENGTH,
} from "@/lib/displayName";

// Some jsdom builds ship a hollow `window.localStorage`. Install a Map-backed
// shim so the round-trip tests don't depend on jsdom's Storage internals.
const installFakeStorage = () => {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  Object.defineProperty(window, "localStorage", { value: fake, configurable: true });
};

describe("displayName.sanitize", () => {
  it("trims and clamps to 30 chars", () => {
    expect(sanitize("  Alex  ")).toBe("Alex");
    expect(sanitize("x".repeat(50))).toHaveLength(MAX_LENGTH);
  });
  it("returns null for empty / whitespace / non-strings", () => {
    expect(sanitize("")).toBeNull();
    expect(sanitize("   ")).toBeNull();
    expect(sanitize(null)).toBeNull();
    expect(sanitize(undefined)).toBeNull();
  });
});

describe("displayName localStorage round-trip", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("save then load returns the same value", () => {
    saveDisplayName("Alex");
    expect(loadDisplayName()).toBe("Alex");
  });

  it("save with whitespace trims before persisting", () => {
    saveDisplayName("  Sam  ");
    expect(loadDisplayName()).toBe("Sam");
  });

  it("save(null) removes the key", () => {
    saveDisplayName("Alex");
    saveDisplayName(null);
    expect(loadDisplayName()).toBeNull();
  });

  it("loadDisplayName returns null when nothing is saved", () => {
    expect(loadDisplayName()).toBeNull();
  });
});

describe("groupName localStorage round-trip (separate slot from solo)", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("save then load returns the same value", () => {
    saveGroupName("The Smiths");
    expect(loadGroupName()).toBe("The Smiths");
  });

  it("solo and party slots are independent — setting one does not affect the other", () => {
    // The whole point of this fix: solo "Alex" carries no signal into party.
    saveDisplayName("Alex");
    saveGroupName("The Smiths");
    expect(loadDisplayName()).toBe("Alex");
    expect(loadGroupName()).toBe("The Smiths");

    // Clearing the group name doesn't touch the solo name.
    saveGroupName(null);
    expect(loadGroupName()).toBeNull();
    expect(loadDisplayName()).toBe("Alex");
  });

  it("save(null) removes the group key", () => {
    saveGroupName("Crew");
    saveGroupName(null);
    expect(loadGroupName()).toBeNull();
  });

  it("loadGroupName returns null when nothing is saved", () => {
    expect(loadGroupName()).toBeNull();
  });
});
