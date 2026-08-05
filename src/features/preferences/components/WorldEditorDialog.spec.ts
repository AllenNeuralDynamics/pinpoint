import { afterEach, describe, expect, it } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import WorldEditorDialog from "./WorldEditorDialog.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

type DialogWrapper = VueWrapper<
  InstanceType<typeof WorldEditorDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(WorldEditorDialog)) as DialogWrapper
  );
}

describe("WorldEditorDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("is seamless", async () => {
    const wrapper = await mountDialog();

    expect(wrapper.findComponent({ name: "QDialog" }).props("seamless")).toBe(
      true
    );
  });

  it("renders the world controls", async () => {
    const wrapper = await mountDialog();

    expect(wrapper.findComponent({ name: "WorldPreferences" }).exists()).toBe(
      true
    );
  });

  it("emits ok when Done is clicked", async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text() === t.done)!
      .trigger("click");

    expect(wrapper.emitted("ok")).toBeTruthy();
  });
});
