import { afterEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import RecentExperimentsDialog from "./RecentExperimentsDialog.vue";
import RecentExperimentsList from "./RecentExperimentsList.vue";
import {
  createWrapperRegistry,
  mountDialogWithQuasar
} from "@/test/mount-helper";

// RecentExperimentsList creates the current-experiment store, whose
// `terminologyRows` is `computedAsync` and fetches on store creation, so
// mounting would trigger real network calls otherwise. Mock the leaf
// module, not the `@/features/atlas` barrel.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return { ...actual, getTerminologyRows: vi.fn() };
});

type DialogWrapper = VueWrapper<
  InstanceType<typeof RecentExperimentsDialog> & { show(): void }
>;

const wrappers = createWrapperRegistry<DialogWrapper>();

async function mountDialog(): Promise<DialogWrapper> {
  return wrappers.track(
    (await mountDialogWithQuasar(RecentExperimentsDialog)) as DialogWrapper
  );
}

describe("RecentExperimentsDialog", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("renders the recent experiments list", async () => {
    const wrapper = await mountDialog();

    expect(wrapper.findComponent(RecentExperimentsList).exists()).toBe(true);
  });

  it("closes itself when the close button is clicked", async () => {
    const wrapper = await mountDialog();

    await wrapper.findComponent({ name: "QBtn" }).trigger("click");

    expect(wrapper.emitted("ok")).toBeTruthy();
  });

  it("closes itself when the list emits opened", async () => {
    const wrapper = await mountDialog();

    wrapper.findComponent(RecentExperimentsList).vm.$emit("opened");
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("ok")).toBeTruthy();
  });
});
