import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import axios from "axios";
import AtlasPicker from "./AtlasPicker.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { makeAtlas } from "@/test/fixtures";

vi.mock("axios");

// axios.get is only ever passed to vi.mocked() to retrieve its mock, never
// called unbound.
// oxlint-disable-next-line typescript/unbound-method
const mockedGet = vi.mocked(axios.get);

/**
 * Value mirroring the component's internal `SourceToggle` union. Not
 * exported by the component, so the literal is duplicated here to drive
 * `QBtnToggle`.
 */
const CUSTOM_SOURCE = "custom";

function mountPicker(
  modelValue: ReturnType<typeof makeAtlas> | null = null,
  pinia = createPinia()
) {
  return mountWithQuasar(AtlasPicker, {
    pinia,
    props: { modelValue, "onUpdate:modelValue": () => {} }
  });
}

async function settle() {
  await flushPromises();
  await flushPromises();
}

/**
 * Mounts, then switches to the Custom HTTP host source and enters a URL, so
 * atlases are loaded via `listAtlasesHTTP` against a predictable mocked
 * response instead of the real BrainGlobe S3 bucket.
 */
async function mountOnCustomSource() {
  const wrapper = mountPicker();
  await wrapper
    .findComponent({ name: "QBtnToggle" })
    .vm.$emit("update:modelValue", CUSTOM_SOURCE);
  await wrapper
    .findComponent({ name: "QInput" })
    .vm.$emit("update:modelValue", "http://localhost:3000");
  await settle();
  return wrapper;
}

describe("AtlasPicker", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedGet.mockReset();
  });

  describe("source loading", () => {
    it("auto-loads atlases from the BrainGlobe source by default", async () => {
      mockedGet.mockResolvedValue({
        data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
</ListBucketResult>`
      });

      const wrapper = mountPicker();
      await settle();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Mouse");
    });

    it("loads atlases from the custom HTTP host once toggled and a URL is set", async () => {
      mockedGet.mockResolvedValue({
        data: {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "readme.txt", type: "file" }
          ]
        }
      });

      const wrapper = await mountOnCustomSource();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Mouse");
    });

    it("shows the empty state when the source returns no atlases", async () => {
      mockedGet.mockResolvedValue({ data: null });

      const wrapper = await mountOnCustomSource();

      expect(wrapper.text()).toContain("No atlases found.");
      expect(wrapper.findAllComponents({ name: "QItem" })).toHaveLength(0);
    });

    it("shows the empty state when the request throws", async () => {
      mockedGet.mockRejectedValue(new Error("network error"));

      const wrapper = await mountOnCustomSource();

      expect(wrapper.text()).toContain("No atlases found.");
      expect(wrapper.findAllComponents({ name: "QItem" })).toHaveLength(0);
    });
  });

  describe("search", () => {
    async function connectedWrapper() {
      mockedGet.mockResolvedValue({
        data: {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        }
      });
      return mountOnCustomSource();
    }

    it("narrows the list to fuzzy matches of the search query", async () => {
      const wrapper = await connectedWrapper();

      const search = wrapper.findAllComponents({ name: "QInput" })[1]!;
      await search.vm.$emit("update:modelValue", "human");
      await wrapper.vm.$nextTick();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Human");
    });
  });

  describe("favorites partitioning", () => {
    async function connectedWrapper(pinia: ReturnType<typeof createPinia>) {
      mockedGet.mockResolvedValue({
        data: {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        }
      });

      const wrapper = mountPicker(null, pinia);
      await wrapper
        .findComponent({ name: "QBtnToggle" })
        .vm.$emit("update:modelValue", CUSTOM_SOURCE);
      await wrapper
        .findComponent({ name: "QInput" })
        .vm.$emit("update:modelValue", "http://localhost:3000");
      await settle();
      return wrapper;
    }

    it("renders favorited atlases separately from the rest", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const favoritesStore = useFavoriteAtlasesStore();
      favoritesStore.add(
        makeAtlas({ source: "http://localhost:3000", name: "allen_human" })
      );

      const wrapper = await connectedWrapper(pinia);

      const items = wrapper.findAllComponents({ name: "QItem" });
      // Favorites render first: allen_human (favorite) then allen_mouse.
      expect(items.map(i => i.text())).toEqual([
        expect.stringContaining("Allen Human"),
        expect.stringContaining("Allen Mouse")
      ]);
    });

    it("adds an atlas to favorites when its favorite_border button is clicked", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = await connectedWrapper(pinia);
      const favoritesStore = useFavoriteAtlasesStore();

      const addBtn = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(btn => btn.props("icon") === "favorite_border")!;
      await addBtn.trigger("click");

      expect(favoritesStore.favorites["http://localhost:3000"]).toContain(
        "allen_human"
      );
    });

    it("removes an atlas from favorites when its favorite button is clicked", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const favoritesStore = useFavoriteAtlasesStore();
      favoritesStore.add(
        makeAtlas({ source: "http://localhost:3000", name: "allen_human" })
      );

      const wrapper = await connectedWrapper(pinia);

      const removeBtn = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(btn => btn.props("icon") === "favorite")!;
      await removeBtn.trigger("click");

      expect(favoritesStore.favorites["http://localhost:3000"]).not.toContain(
        "allen_human"
      );
    });
  });

  describe("selection", () => {
    it("emits update:modelValue with the clicked atlas", async () => {
      mockedGet.mockResolvedValue({
        data: { files: [{ name: "allen_mouse_25um", type: "folder" }] }
      });

      const wrapper = await mountOnCustomSource();
      await wrapper.findComponent({ name: "QItem" }).trigger("click");

      expect(wrapper.emitted("update:modelValue")).toEqual([
        [{ name: "allen_mouse", source: "http://localhost:3000" }]
      ]);
    });
  });
});
