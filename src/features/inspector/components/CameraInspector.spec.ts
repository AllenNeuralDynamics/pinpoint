import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CameraInspector from "./CameraInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { getTerminologyRows } from "@/features/atlas";
import { addCameraPose, copyCameraPose } from "@/features/experiment";
import { makeCameraPose } from "@/test/fixtures";
import { millimetersToPositionUnit, radiansToRotationUnit } from "@/utils/math";
import enUS from "@/i18n/en-US";

const t = enUS.cameraInspector;

// `useCurrentExperimentStore`'s `terminologyRows` is `computedAsync`,
// fetching from this module whenever the store is created -- mock the leaf
// module (not the `@/features/atlas` barrel) or mounting triggers a real
// network request. Mirrors the mocking approach in Inspector.spec.ts.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

function mountInspector() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCurrentExperimentStore(pinia);
  const preferences = usePreferencesStore(pinia);

  const wrapper = mountWithQuasar(CameraInspector, { pinia });
  return { wrapper, store, preferences };
}

function fieldByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `CommittedInput` requires in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await new Promise(resolve => setTimeout(resolve));
}

describe("CameraInspector", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("renders exactly one projection toggle, starting at 'perspective'", () => {
    const { wrapper } = mountInspector();

    const toggle = wrapper.findAllComponents({ name: "QBtnToggle" });
    expect(toggle).toHaveLength(1);
    expect(toggle[0]!.props("modelValue")).toBe("perspective");
  });

  it("selecting Orthographic on the toggle writes 'orthographic' to the preferences store", async () => {
    const { wrapper, preferences } = mountInspector();

    await wrapper
      .findComponent({ name: "QBtnToggle" })
      .vm.$emit("update:modelValue", "orthographic");

    expect(preferences.cameraProjection).toBe("orthographic");
  });

  it("seeds the six fields from the live camera pose, in the preferences store's units and precision", () => {
    const { wrapper, store, preferences } = mountInspector();
    const pose = store.experiment.cameraPose;

    expect(fieldByLabel(wrapper, t.alpha).props("modelValue")).toBe(
      radiansToRotationUnit(pose.alpha, preferences.rotationUnit).toFixed(
        preferences.decimalPrecision
      )
    );
    expect(fieldByLabel(wrapper, t.beta).props("modelValue")).toBe(
      radiansToRotationUnit(pose.beta, preferences.rotationUnit).toFixed(
        preferences.decimalPrecision
      )
    );
    expect(fieldByLabel(wrapper, t.radius).props("modelValue")).toBe(
      millimetersToPositionUnit(pose.radius, preferences.positionUnit).toFixed(
        preferences.decimalPrecision
      )
    );
    expect(fieldByLabel(wrapper, enUS.axis.ap).props("modelValue")).toBe(
      millimetersToPositionUnit(
        pose.target[0],
        preferences.positionUnit
      ).toFixed(preferences.decimalPrecision)
    );
    expect(fieldByLabel(wrapper, enUS.axis.dv).props("modelValue")).toBe(
      millimetersToPositionUnit(
        pose.target[1],
        preferences.positionUnit
      ).toFixed(preferences.decimalPrecision)
    );
    expect(fieldByLabel(wrapper, enUS.axis.ml).props("modelValue")).toBe(
      millimetersToPositionUnit(
        pose.target[2],
        preferences.positionUnit
      ).toFixed(preferences.decimalPrecision)
    );
  });

  it("editing Alpha writes the converted radians onto the live camera pose", async () => {
    const { wrapper, store } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.alpha), "0");

    expect(store.experiment.cameraPose.alpha).toBe(0);
  });

  it("editing target AP writes the converted millimeters onto the camera pose's target", async () => {
    const { wrapper, store } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, enUS.axis.ap), "2");

    expect(store.experiment.cameraPose.target[0]).toBe(2);
  });

  it("shows the empty hint when there are no saved poses", () => {
    const { wrapper } = mountInspector();

    expect(wrapper.text()).toContain(t.noPoses);
  });

  it("appends exactly one pose with the typed name and the live orbit and target on Save Pose", async () => {
    const { wrapper, store } = mountInspector();
    const pose = store.experiment.cameraPose;
    await editAndBlur(fieldByLabel(wrapper, t.poseName), "Dorsal");

    const saveButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.savePose))!;
    await saveButton.trigger("click");

    expect(store.experiment.cameraPoses).toHaveLength(1);
    const [saved] = store.experiment.cameraPoses;
    expect(saved!.name).toBe("Dorsal");
    expect(saved!.alpha).toBe(pose.alpha);
    expect(saved!.beta).toBe(pose.beta);
    expect(saved!.radius).toBe(pose.radius);
    expect(saved!.target).toEqual(pose.target);
  });

  it("does not render a Copy from Current button", () => {
    const { wrapper } = mountInspector();

    expect(wrapper.text()).not.toContain("Copy from Current");
  });

  it("moves the live camera pose to a saved pose's orbit and target when its row is clicked, leaving the library untouched", async () => {
    const { wrapper, store } = mountInspector();
    const saved = copyCameraPose(
      makeCameraPose({ alpha: 4, beta: 5, radius: 6, target: [7, 8, 9] }),
      "Dorsal"
    );
    addCameraPose(store.experiment, saved);
    await wrapper.vm.$nextTick();

    await wrapper.find(".pose-list .q-item").trigger("click");

    const pose = store.experiment.cameraPose;
    expect(pose.alpha).toBe(4);
    expect(pose.beta).toBe(5);
    expect(pose.radius).toBe(6);
    expect(pose.target).toEqual([7, 8, 9]);
    expect(store.experiment.cameraPoses).toEqual([saved]);
  });

  it("removes only the clicked pose's delete button", async () => {
    const { wrapper, store } = mountInspector();
    addCameraPose(
      store.experiment,
      copyCameraPose(makeCameraPose({ alpha: 4 }), "Dorsal")
    );
    addCameraPose(
      store.experiment,
      copyCameraPose(makeCameraPose({ alpha: 7 }), "Ventral")
    );
    await wrapper.vm.$nextTick();

    const deleteButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.props("icon") === "delete")!;
    await deleteButton.trigger("click");

    expect(store.experiment.cameraPoses.map(pose => pose.name)).toEqual([
      "Ventral"
    ]);
  });

  it("reorders poses when row 0's handle is dragged onto row 2", async () => {
    const { wrapper, store } = mountInspector();
    addCameraPose(
      store.experiment,
      copyCameraPose(makeCameraPose({ alpha: 1 }), "A")
    );
    addCameraPose(
      store.experiment,
      copyCameraPose(makeCameraPose({ alpha: 2 }), "B")
    );
    addCameraPose(
      store.experiment,
      copyCameraPose(makeCameraPose({ alpha: 3 }), "C")
    );
    await wrapper.vm.$nextTick();

    const items = wrapper.findAllComponents({ name: "QItem" });
    await items[0]!.find(".pose-row__handle").trigger("dragstart");
    await items[2]!.trigger("dragover");
    await items[2]!.trigger("drop");

    expect(store.experiment.cameraPoses.map(pose => pose.name)).toEqual([
      "B",
      "C",
      "A"
    ]);
  });
});
