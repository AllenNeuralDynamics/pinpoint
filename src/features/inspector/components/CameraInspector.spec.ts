import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { ArcRotateCamera } from "@babylonjs/core";
import CameraInspector from "./CameraInspector.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { usePreferencesStore } from "@/stores/preferences.store";
import { BabylonRuntimeServiceKey } from "@/services/babylon-runtime.service";
import { getTerminologyRows } from "@/features/atlas";
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

/**
 * Build a bare camera stub -- alpha/beta/radius plus a separately spied
 * `interpolateTo` -- cast to `ArcRotateCamera`, the same stub shape
 * `SceneCanvas.spec.ts` uses. `interpolateTo` is returned alongside the
 * camera rather than read off it, since asserting on a real class's own
 * method reference trips the unbound-method lint rule.
 */
function makeCameraStub() {
  const interpolateTo = vi.fn();
  const camera = {
    alpha: 1,
    beta: 2,
    radius: 3,
    interpolateTo
  } as unknown as ArcRotateCamera;
  return { camera, interpolateTo };
}

function mountInspector({ camera, interpolateTo } = makeCameraStub()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCurrentExperimentStore(pinia);
  const preferences = usePreferencesStore(pinia);

  const wrapper = mountWithQuasar(CameraInspector, {
    pinia,
    global: {
      provide: {
        [BabylonRuntimeServiceKey as symbol]: {
          camera: shallowRef(camera)
        }
      }
    }
  });
  return { wrapper, store, preferences, camera, interpolateTo };
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

  it("seeds the three numeric fields from the camera, converted to the preferences store's units, on mount", async () => {
    const { wrapper, preferences } = mountInspector();
    await wrapper.vm.$nextTick();

    expect(fieldByLabel(wrapper, t.alpha).props("modelValue")).toBe(
      radiansToRotationUnit(1, preferences.rotationUnit).toFixed(
        preferences.decimalPrecision
      )
    );
    expect(fieldByLabel(wrapper, t.beta).props("modelValue")).toBe(
      radiansToRotationUnit(2, preferences.rotationUnit).toFixed(
        preferences.decimalPrecision
      )
    );
    expect(fieldByLabel(wrapper, t.radius).props("modelValue")).toBe(
      millimetersToPositionUnit(3, preferences.positionUnit).toFixed(
        preferences.decimalPrecision
      )
    );
  });

  it("displays alpha/beta/radius in the preferences store's units and decimal precision", async () => {
    const { wrapper, preferences } = mountInspector();
    preferences.rotationUnit = "radian";
    preferences.positionUnit = "micrometer";
    preferences.decimalPrecision = 1;
    await wrapper.vm.$nextTick();

    const alpha = fieldByLabel(wrapper, t.alpha);
    expect(alpha.props("modelValue")).toBe("1.0");
    expect(alpha.props("suffix")).toBe(enUS.units.radian);
    const radius = fieldByLabel(wrapper, t.radius);
    expect(radius.props("modelValue")).toBe("3000.0");
    expect(radius.props("suffix")).toBe(enUS.units.micrometer);
  });

  it("copies the live camera's orbit into the draft when Copy from Current is clicked, without moving the camera", async () => {
    const { wrapper, camera, interpolateTo } = mountInspector();
    await wrapper.vm.$nextTick();
    camera.alpha = 4;
    camera.beta = 5;
    camera.radius = 6;

    const copyButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.copyFromCurrent))!;
    await copyButton.trigger("click");
    await wrapper.vm.$nextTick();

    expect(fieldByLabel(wrapper, t.radius).props("modelValue")).toBe(
      millimetersToPositionUnit(6, "millimeter").toFixed(3)
    );
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("shows the empty hint when there are no saved poses", () => {
    const { wrapper } = mountInspector();

    expect(wrapper.text()).toContain(t.noPoses);
  });

  it("appends exactly one pose with the typed name and the drafted orbit on Save Pose", async () => {
    const { wrapper, store, camera, interpolateTo } = mountInspector();
    await editAndBlur(fieldByLabel(wrapper, t.poseName), "Dorsal");
    await editAndBlur(fieldByLabel(wrapper, t.radius), "9");

    const saveButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.text().includes(t.savePose))!;
    await saveButton.trigger("click");

    expect(store.experiment.cameraPoses).toHaveLength(1);
    const [pose] = store.experiment.cameraPoses;
    expect(pose!.name).toBe("Dorsal");
    expect(pose!.alpha).toBe(camera.alpha);
    expect(pose!.beta).toBe(camera.beta);
    expect(pose!.radius).toBe(9);
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("does not move the camera when a numeric field is edited and blurred", async () => {
    const { wrapper, interpolateTo } = mountInspector();

    await editAndBlur(fieldByLabel(wrapper, t.radius), "42");

    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("moves the camera to a pose's orbit when its row is clicked", async () => {
    const { wrapper, store, interpolateTo } = mountInspector();
    store.experiment.cameraPoses = [
      { id: "a", name: "Dorsal", alpha: 4, beta: 5, radius: 6 }
    ];
    await wrapper.vm.$nextTick();

    await wrapper.find(".pose-list .q-item").trigger("click");

    expect(interpolateTo).toHaveBeenCalledWith(4, 5, 6);
  });

  it("removes only the clicked pose's delete button and leaves the camera untouched", async () => {
    const { wrapper, store, interpolateTo } = mountInspector();
    store.experiment.cameraPoses = [
      { id: "a", name: "Dorsal", alpha: 4, beta: 5, radius: 6 },
      { id: "b", name: "Ventral", alpha: 7, beta: 8, radius: 9 }
    ];
    await wrapper.vm.$nextTick();

    const deleteButton = wrapper
      .findAllComponents({ name: "QBtn" })
      .find(button => button.props("icon") === "delete")!;
    await deleteButton.trigger("click");

    expect(store.experiment.cameraPoses.map(pose => pose.id)).toEqual(["b"]);
    expect(interpolateTo).not.toHaveBeenCalled();
  });

  it("reorders poses when row 0's handle is dragged onto row 2", async () => {
    const { wrapper, store } = mountInspector();
    store.experiment.cameraPoses = [
      { id: "a", name: "A", alpha: 1, beta: 0, radius: 0 },
      { id: "b", name: "B", alpha: 2, beta: 0, radius: 0 },
      { id: "c", name: "C", alpha: 3, beta: 0, radius: 0 }
    ];
    await wrapper.vm.$nextTick();

    const items = wrapper.findAllComponents({ name: "QItem" });
    await items[0]!.find(".pose-row__handle").trigger("dragstart");
    await items[2]!.trigger("dragover");
    await items[2]!.trigger("drop");

    expect(store.experiment.cameraPoses.map(pose => pose.id)).toEqual([
      "b",
      "c",
      "a"
    ]);
  });
});
