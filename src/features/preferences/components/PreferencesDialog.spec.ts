import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentMountingOptions, VueWrapper } from "@vue/test-utils";
import PreferencesDialog from "./PreferencesDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import { getTerminologyRows } from "@/features/atlas";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

// `useCurrentExperimentStore`'s `terminologyRows` is a `computedAsync` and
// fetches on store creation -- mock the leaf module (not the
// `@/features/atlas` barrel) or mounting the scene tab triggers real network
// calls.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof PreferencesDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(
  options: ComponentMountingOptions<typeof PreferencesDialog> = {}
): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(PreferencesDialog, options)) as DialogWrapper
  );
}

describe("PreferencesDialog", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  afterEach(() => {
    wrappers.unmountAll();
  });

  it("renders the title and the five tabs", async () => {
    const wrapper = await mountDialog();

    expect(document.body.textContent).toContain(t.title);
    const tabs: NodeListOf<Element> = wrapper
      .findComponent({ name: "QTabs" })
      .element.querySelectorAll(".q-tab__label");
    expect(Array.from(tabs).map(tab => tab.textContent)).toEqual([
      t.general,
      t.scene,
      t.probe,
      t.export,
      t.reset
    ]);
  });

  it("shows the general panel by default", async () => {
    const wrapper = await mountDialog();

    expect(wrapper.findComponent({ name: "GeneralPreferences" }).exists()).toBe(
      true
    );
  });

  it("opens on the tab given by the tab prop", async () => {
    const wrapper = await mountDialog({ props: { tab: "reset" } });

    expect(wrapper.findComponent({ name: "ResetPreferences" }).exists()).toBe(
      true
    );
  });

  it("still switches tabs when opened with a tab prop", async () => {
    const wrapper = await mountDialog({ props: { tab: "scene" } });

    await wrapper
      .findComponent({ name: "QTabs" })
      .vm.$emit("update:modelValue", "probe");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ProbePreferences" }).exists()).toBe(
      true
    );
  });

  it("switching to the probe tab shows the probe panel", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findComponent({ name: "QTabs" })
      .vm.$emit("update:modelValue", "probe");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ProbePreferences" }).exists()).toBe(
      true
    );
  });

  it("switching to the export tab shows the export panel", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findComponent({ name: "QTabs" })
      .vm.$emit("update:modelValue", "export");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ExportPreferences" }).exists()).toBe(
      true
    );
  });

  it("switching to the probe tab shows the probe panel", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findComponent({ name: "QTabs" })
      .vm.$emit("update:modelValue", "probe");
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "ProbePreferences" }).exists()).toBe(
      true
    );
  });

  it("emits ok when Close is clicked", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.close)!
      .trigger("click");

    expect(wrapper.emitted("ok")).toEqual([[undefined]]);
  });

  it("emits ok when the scene panel's Edit in Inspector button is clicked", async () => {
    const wrapper = await mountDialog({ props: { tab: "scene" } });

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.editInInspector)!
      .trigger("click");

    expect(wrapper.emitted("ok")).toEqual([[undefined]]);
  });
});
