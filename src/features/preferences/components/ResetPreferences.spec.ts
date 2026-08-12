import { describe, expect, it, vi } from "vitest";
import ResetPreferences from "./ResetPreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { PERSISTED_STORES, resetPersistedStores } from "../api/reset.api";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

vi.mock("../api/reset.api", async () => {
  const actual =
    await vi.importActual<typeof import("../api/reset.api")>(
      "../api/reset.api"
    );
  return { ...actual, resetPersistedStores: vi.fn() };
});

/**
 * Mount `ResetPreferences` and stub `$q.dialog`, which the `Dialog` Quasar
 * plugin doesn't register under `mountWithQuasar`.
 * @param onOk Callback invoked when the stubbed dialog's OK handler fires.
 */
function mountReset(onOk: (confirm: () => void) => void = () => {}) {
  const wrapper = mountWithQuasar(ResetPreferences);
  const dialogSpy = vi.fn().mockReturnValue({ onOk });
  wrapper.vm.$q.dialog = dialogSpy;
  return { wrapper, dialogSpy };
}

describe("ResetPreferences", () => {
  it("renders one row per persisted store", () => {
    const { wrapper } = mountReset();

    const rows = wrapper.findAllComponents({ name: "QItem" });
    expect(rows).toHaveLength(6);
    expect(wrapper.text()).toContain(t.storeCurrentExperiment);
    expect(wrapper.text()).toContain(t.storeRecentExperiments);
    expect(wrapper.text()).toContain(t.storeProbeLibrary);
    expect(wrapper.text()).toContain(t.storeCoordinateSystemLibrary);
    expect(wrapper.text()).toContain(t.storeFavoriteAtlases);
    expect(wrapper.text()).toContain(t.storePreferences);
  });

  it("a row's trash button opens a negative-confirm dialog mentioning reloading", async () => {
    const { wrapper, dialogSpy } = mountReset();
    const rows = wrapper.findAllComponents({ name: "QItem" });
    const probeLibraryRow = rows.find(row =>
      row.text().includes(t.storeProbeLibrary)
    )!;

    await probeLibraryRow.findComponent({ name: "QBtn" }).trigger("click");

    expect(dialogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: expect.objectContaining({ color: "negative" }),
        message: expect.stringContaining("reloads")
      })
    );
  });

  it("confirming a row's trash button clears exactly that store", async () => {
    let confirm: (() => void) | undefined;
    const { wrapper } = mountReset(callback => (confirm = callback));
    const rows = wrapper.findAllComponents({ name: "QItem" });
    const probeLibraryRow = rows.find(row =>
      row.text().includes(t.storeProbeLibrary)
    )!;
    await probeLibraryRow.findComponent({ name: "QBtn" }).trigger("click");

    confirm?.();

    expect(resetPersistedStores).toHaveBeenCalledWith(
      localStorage,
      ["probe-library"],
      expect.any(Function)
    );
  });

  it("Reset Everything passes every store's key", async () => {
    let confirm: (() => void) | undefined;
    const { wrapper } = mountReset(callback => (confirm = callback));

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.resetAll))!
      .trigger("click");
    confirm?.();

    expect(resetPersistedStores).toHaveBeenCalledWith(
      localStorage,
      PERSISTED_STORES.map(store => store.key),
      expect.any(Function)
    );
  });
});
