import { describe, expect, it, vi } from "vitest";
import { createAnnotationMetadataStore } from "./annotation-store.api";

describe("createAnnotationMetadataStore", () => {
  it("builds a store for the given URL", () => {
    const store = createAnnotationMetadataStore("http://example.com/atlas");
    expect(store).toBeDefined();
  });

  it("caches zarr.json metadata reads", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(new Uint8Array([1]), { status: 200 })
      );

    const store = createAnnotationMetadataStore("http://example.com/atlas");
    await store.get("/zarr.json");
    await store.get("/zarr.json");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("does not cache non-metadata reads", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(new Uint8Array([1]), { status: 200 })
      );

    const store = createAnnotationMetadataStore("http://example.com/atlas");
    await store.get("/s0/c/0/0/0");
    await store.get("/s0/c/0/0/0");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });
});
