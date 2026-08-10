import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import axios from "axios";
import AtlasPicker from "./AtlasPicker.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useFavoriteAtlasesStore } from "@/stores/favorite-atlases.store";
import { makeAtlas } from "@/test/fixtures";
import { BUCKET_SOURCE_URLS } from "../api/source.api";

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

/** URL of the BrainGlobe bucket's atlases directory listing. */
const BRAINGLOBE_LISTING_URL =
  "https://brainglobe.s3.us-west-2.amazonaws.com/?list-type=2&prefix=atlas-rc2%2Fatlases%2F&delimiter=%2F";

/** URL of the Allen Institute bucket's atlases directory listing. */
const ALLEN_INSTITUTE_LISTING_URL =
  "https://aind-scratch-data.s3.us-west-2.amazonaws.com/?list-type=2&prefix=pinpoint-atlases%2Fatlases%2F&delimiter=%2F";

/** Root URL of the custom HTTP host used across these tests. */
const CUSTOM_SOURCE_ROOT = "http://localhost:3000";

/** URL of a custom HTTP host's atlases directory listing. */
const CUSTOM_ATLASES_URL = `${CUSTOM_SOURCE_ROOT}/brainglobe-atlasapi/atlases`;

/**
 * `QVirtualScroll` only renders the rows that fit its measured scroll
 * height, which is always 0 in happy-dom - so its default slot never runs
 * in tests. Stub it with something that renders every item's slot content
 * unconditionally, which is enough to assert on the contract without
 * needing real virtualization/scroll layout.
 */
const QVirtualScrollStub = defineComponent({
  name: "QVirtualScrollStub",
  props: ["items"],
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        (props.items as unknown[]).map((item, index) =>
          slots.default?.({ item, index })
        )
      );
  }
});

/**
 * Manifest URL for a BrainGlobe-bucket-hosted size variant directory.
 * @param directory `atlases/` directory name.
 */
function brainglobeManifestUrl(directory: string): string {
  return `${BUCKET_SOURCE_URLS.brainglobe}atlases/${directory}/3_0/manifest.json`;
}

/**
 * Manifest URL for a custom-HTTP-host size variant directory.
 * @param directory `atlases/` directory name.
 */
function customManifestUrl(directory: string): string {
  return `${CUSTOM_ATLASES_URL}/${directory}/3_0/manifest.json`;
}

/**
 * Raw manifest response body for a variant directory, carrying a link value
 * unless overridden.
 * @param overrides Fields to override on the default raw manifest.
 */
function rawManifest(
  overrides: { atlas_link?: string; species?: string } = {}
) {
  return {
    name: "allen_mouse",
    resolution: [25, 25, 25],
    shape: [528, 320, 456],
    species: "Mus musculus",
    terminology: { location: "/terminologies/allen_mouse-terminology/3_0" },
    annotation_set: {
      location: "/annotation-sets/allen_mouse-annotation/3_0"
    },
    atlas_link: "http://www.brain-map.org",
    ...overrides
  };
}

/**
 * Raw manifest response body with no `atlas_link` field at all, unlike
 * passing `atlas_link: undefined` which the source's exact-optional-property
 * types reject.
 */
function rawManifestWithoutLink(): Record<string, unknown> {
  const manifest: Record<string, unknown> = rawManifest();
  delete manifest.atlas_link;
  return manifest;
}

/**
 * Mock `axios.get` to answer a directory listing request plus any number of
 * manifest requests, keyed by URL. An unrecognized URL rejects, which also
 * asserts that no unexpected request is made. A manifest entry that is an
 * `Error` rejects that request instead of resolving it.
 * @param listingUrl URL of the directory listing request.
 * @param listingResponse Response body for the listing request.
 * @param manifestResponses Response bodies (or rejection errors), keyed by manifest URL.
 */
function mockSource(
  listingUrl: string,
  listingResponse: unknown,
  manifestResponses: Record<string, unknown> = {}
) {
  mockedGet.mockImplementation((url: string) => {
    if (url === listingUrl) return Promise.resolve({ data: listingResponse });
    if (url in manifestResponses) {
      const response = manifestResponses[url];
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve({ data: response });
    }
    return Promise.reject(new Error(`unexpected request: ${url}`));
  });
}

function mountPicker(
  modelValue: ReturnType<typeof makeAtlas> | null = null,
  pinia = createPinia()
) {
  return mountWithQuasar(AtlasPicker, {
    pinia,
    props: { modelValue, "onUpdate:modelValue": () => {} },
    global: { stubs: { QVirtualScroll: QVirtualScrollStub } }
  });
}

async function settle() {
  await flushPromises();
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
      mockSource(
        BRAINGLOBE_LISTING_URL,
        `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>atlas-rc2/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
</ListBucketResult>`,
        { [brainglobeManifestUrl("allen_mouse_25um")]: rawManifest() }
      );

      const wrapper = mountPicker();
      await settle();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Mouse");
    });

    it("loads atlases from the Allen Institute bucket when that source is toggled", async () => {
      mockSource(
        ALLEN_INSTITUTE_LISTING_URL,
        `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CommonPrefixes><Prefix>pinpoint-atlases/atlases/allen_mouse_25um/</Prefix></CommonPrefixes>
</ListBucketResult>`,
        {
          [`${BUCKET_SOURCE_URLS.allenInstitute}atlases/allen_mouse_25um/3_0/manifest.json`]:
            rawManifest()
        }
      );

      const wrapper = mountPicker();
      await wrapper
        .findComponent({ name: "QBtnToggle" })
        .vm.$emit("update:modelValue", "allenInstitute");
      await settle();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Mouse");
    });

    it("starts the custom host field empty, so switching to it fires no request", async () => {
      const wrapper = mountPicker();
      await settle();
      mockedGet.mockClear();

      await wrapper
        .findComponent({ name: "QBtnToggle" })
        .vm.$emit("update:modelValue", CUSTOM_SOURCE);
      await settle();

      const hostInput = wrapper.findComponent({ name: "QInput" });
      expect(hostInput.props("modelValue")).toBeNull();
      expect(mockedGet).not.toHaveBeenCalled();
    });

    it("shows the loading bar while a source listing is in flight, then hides it", async () => {
      const { promise: listing, resolve: resolveListing } =
        Promise.withResolvers<{ data: unknown }>();
      mockedGet.mockImplementation((url: string) =>
        url === BRAINGLOBE_LISTING_URL
          ? listing
          : Promise.reject(new Error(`unexpected request: ${url}`))
      );

      const wrapper = mountPicker();
      await flushPromises();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        true
      );
      expect(wrapper.find(".atlas-picker__results").exists()).toBe(true);

      resolveListing({
        data: `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></ListBucketResult>`
      });
      await settle();

      expect(wrapper.findComponent({ name: "QLinearProgress" }).exists()).toBe(
        false
      );
      expect(wrapper.find(".atlas-picker__results").exists()).toBe(true);
      expect(wrapper.text()).toContain("No atlases found.");
    });

    it("loads atlases from the custom HTTP host once toggled and a URL is set", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "readme.txt", type: "file" }
          ]
        },
        { [customManifestUrl("allen_mouse_25um")]: rawManifest() }
      );

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

  describe("manifest resolution", () => {
    it("renders a link button whose href is the resolved manifest's link value", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        { files: [{ name: "allen_mouse_25um", type: "folder" }] },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest({
            atlas_link: "http://www.brain-map.org"
          })
        }
      );

      const wrapper = await mountOnCustomSource();

      const linkButton = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(btn => btn.props("icon") === "link")!;
      expect(linkButton.props("href")).toBe("http://www.brain-map.org");
    });

    it("renders no link button when the manifest omits a link value, while still rendering the favorite button", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        { files: [{ name: "allen_mouse_25um", type: "folder" }] },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifestWithoutLink()
        }
      );

      const wrapper = await mountOnCustomSource();

      const buttons = wrapper.findAllComponents({ name: "QBtn" });
      expect(buttons.some(btn => btn.props("icon") === "link")).toBe(false);
      expect(buttons.some(btn => btn.props("icon") === "favorite_border")).toBe(
        true
      );
    });

    it("drops an atlas from the list when its manifest request rejects, leaving the others", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest(),
          [customManifestUrl("allen_human_500um")]: new Error("network error")
        }
      );

      const wrapper = await mountOnCustomSource();

      const items = wrapper.findAllComponents({ name: "AtlasPickerItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Mouse");
      expect(wrapper.text()).toContain("one atlas");
    });

    it("shows the empty state once the only listed atlas's manifest request rejects", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        { files: [{ name: "allen_mouse_25um", type: "folder" }] },
        {
          [customManifestUrl("allen_mouse_25um")]: new Error("network error")
        }
      );

      const wrapper = await mountOnCustomSource();

      expect(wrapper.text()).toContain("No atlases found.");
      expect(
        wrapper.findAllComponents({ name: "AtlasPickerItem" })
      ).toHaveLength(0);
    });
  });

  describe("search", () => {
    async function connectedWrapper() {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest(),
          [customManifestUrl("allen_human_500um")]: rawManifest()
        }
      );
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

    it("matches on the manifest's species, which is never rendered", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest({
            species: "Mus musculus"
          }),
          [customManifestUrl("allen_human_500um")]: rawManifest({
            species: "Homo sapiens"
          })
        }
      );
      const wrapper = await mountOnCustomSource();

      // Neither species string is on screen; species is searched, not shown.
      expect(wrapper.text()).not.toContain("Mus musculus");
      expect(wrapper.text()).not.toContain("Homo sapiens");

      const search = wrapper.findAllComponents({ name: "QInput" })[1]!;
      await search.vm.$emit("update:modelValue", "Homo sapiens");
      await wrapper.vm.$nextTick();

      const items = wrapper.findAllComponents({ name: "QItem" });
      expect(items).toHaveLength(1);
      expect(items[0]!.text()).toContain("Allen Human");
      expect(items[0]!.text()).not.toContain("Homo sapiens");
    });

    it("resolves species for atlases the virtual scroller never rendered", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest({
            species: "Mus musculus"
          }),
          [customManifestUrl("allen_human_500um")]: rawManifest({
            species: "Homo sapiens"
          })
        }
      );

      // A scroller that renders no rows at all, so no AtlasPickerItem mounts
      // and nothing requests a manifest on the row's behalf.
      const wrapper = mountWithQuasar(AtlasPicker, {
        pinia: createPinia(),
        props: { modelValue: null, "onUpdate:modelValue": () => {} },
        global: { stubs: { QVirtualScroll: { template: "<div />" } } }
      });
      await wrapper
        .findComponent({ name: "QBtnToggle" })
        .vm.$emit("update:modelValue", CUSTOM_SOURCE);
      await wrapper
        .findComponent({ name: "QInput" })
        .vm.$emit("update:modelValue", "http://localhost:3000");
      await settle();

      expect(
        wrapper.findAllComponents({ name: "AtlasPickerItem" })
      ).toHaveLength(0);
      expect(mockedGet).toHaveBeenCalledWith(
        customManifestUrl("allen_human_500um")
      );
    });
  });

  describe("favorites partitioning", () => {
    async function connectedWrapper(pinia: ReturnType<typeof createPinia>) {
      mockSource(
        CUSTOM_ATLASES_URL,
        {
          files: [
            { name: "allen_mouse_25um", type: "folder" },
            { name: "allen_human_500um", type: "folder" }
          ]
        },
        {
          [customManifestUrl("allen_mouse_25um")]: rawManifest(),
          [customManifestUrl("allen_human_500um")]: rawManifest()
        }
      );

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
        makeAtlas({ source: CUSTOM_SOURCE_ROOT, name: "allen_human" })
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

      expect(favoritesStore.favorites[CUSTOM_SOURCE_ROOT]).toContain(
        "allen_human"
      );
    });

    it("removes an atlas from favorites when its favorite button is clicked", async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const favoritesStore = useFavoriteAtlasesStore();
      favoritesStore.add(
        makeAtlas({ source: CUSTOM_SOURCE_ROOT, name: "allen_human" })
      );

      const wrapper = await connectedWrapper(pinia);

      const removeBtn = wrapper
        .findAllComponents({ name: "QBtn" })
        .find(btn => btn.props("icon") === "favorite")!;
      await removeBtn.trigger("click");

      expect(favoritesStore.favorites[CUSTOM_SOURCE_ROOT]).not.toContain(
        "allen_human"
      );
    });
  });

  describe("selection", () => {
    it("emits update:modelValue with the fully-resolved atlas", async () => {
      mockSource(
        CUSTOM_ATLASES_URL,
        { files: [{ name: "allen_mouse_25um", type: "folder" }] },
        { [customManifestUrl("allen_mouse_25um")]: rawManifest() }
      );

      const wrapper = await mountOnCustomSource();
      await wrapper.findComponent({ name: "QItem" }).trigger("click");
      await settle();

      expect(wrapper.emitted("update:modelValue")).toEqual([
        [
          {
            name: "allen_mouse",
            source: CUSTOM_SOURCE_ROOT,
            manifest: {
              terminologyLocation: "/terminologies/allen_mouse-terminology/3_0",
              annotationSetLocation:
                "/annotation-sets/allen_mouse-annotation/3_0",
              species: "Mus musculus",
              atlasLink: "http://www.brain-map.org",
              resolutions: [[0.025, 0.025, 0.025]],
              shape: [[528, 320, 456]]
            }
          }
        ]
      ]);
    });

    it("emits nothing when the clicked atlas's manifest request rejects", async () => {
      const manifestUrl = customManifestUrl("allen_mouse_25um");
      const { promise: manifestPromise, reject: rejectManifest } =
        Promise.withResolvers<never>();
      mockedGet.mockImplementation((url: string) => {
        if (url === CUSTOM_ATLASES_URL) {
          return Promise.resolve({
            data: { files: [{ name: "allen_mouse_25um", type: "folder" }] }
          });
        }
        if (url === manifestUrl) return manifestPromise;
        return Promise.reject(new Error(`unexpected request: ${url}`));
      });

      const wrapper = mountPicker();
      await wrapper
        .findComponent({ name: "QBtnToggle" })
        .vm.$emit("update:modelValue", CUSTOM_SOURCE);
      await wrapper
        .findComponent({ name: "QInput" })
        .vm.$emit("update:modelValue", "http://localhost:3000");
      // Let the listing resolve and the row mount; its manifest fetch
      // starts but is held open by `manifestPromise`.
      await flushPromises();
      await flushPromises();

      await wrapper.findComponent({ name: "QItem" }).trigger("click");
      rejectManifest(new Error("network error"));
      await settle();

      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    });
  });
});
