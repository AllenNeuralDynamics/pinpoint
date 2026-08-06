import { afterEach, describe, expect, it } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import PreferencesDialog from "./PreferencesDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

type DialogWrapper = VueWrapper<
  InstanceType<typeof PreferencesDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(PreferencesDialog)) as DialogWrapper
  );
}

describe("PreferencesDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("renders the title and the four tabs", async () => {
    const wrapper = await mountDialog();

    expect(document.body.textContent).toContain(t.title);
    const tabs: NodeListOf<Element> = wrapper
      .findComponent({ name: "QTabs" })
      .element.querySelectorAll(".q-tab__label");
    expect(Array.from(tabs).map(tab => tab.textContent)).toEqual([
      t.scene,
      t.probe,
      t.export,
      t.reset
    ]);
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

  it("emits ok with world-editor when Open Editor is clicked", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.openEditor)!
      .trigger("click");

    expect(wrapper.emitted("ok")).toEqual([["world-editor"]]);
  });
});
