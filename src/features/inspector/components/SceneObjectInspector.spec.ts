import { describe, expect, it, vi } from "vitest";
import type { VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SceneObjectInspector from "./SceneObjectInspector.vue";
import { flushMicrotasks, mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { makeSceneObject } from "@/test/fixtures";
import enUS from "@/i18n/en-US";

// `useCurrentExperimentStore`'s `manifest`/`terminologyRows` are
// `computedAsync` and fetch on store creation -- mock the leaf module (not
// the `@/features/atlas` barrel) or mounting triggers real network calls.
// Mirrors the mocking approach in `ProbeInspector.spec.ts`.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn().mockResolvedValue([])
  };
});

const t = enUS.sceneObjectInspector;
const axis = enUS.axis;

function fieldByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents({ name: "QInput" })
    .find(field => field.props("label") === label)!;
}

function buttonByLabel(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAll("button")
    .find(button => button.attributes("aria-label") === label)!;
}

/**
 * Focus, replace a field's text, and blur it -- the sequence a real user
 * produces, which `use-field`'s handlers require in this order.
 */
async function editAndBlur(field: VueWrapper, value: string) {
  const native = field.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await flushMicrotasks();
}

function mountInspector(sceneObject = makeSceneObject()) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useCurrentExperimentStore(pinia);
  store.experiment.sceneObjects = [sceneObject];

  const wrapper = mountWithQuasar(SceneObjectInspector, {
    pinia,
    props: { sceneObject: store.experiment.sceneObjects[0]! }
  });
  return { wrapper, store, sceneObject: store.experiment.sceneObjects[0]! };
}

describe("SceneObjectInspector", () => {
  it("commits the trimmed name on blur", async () => {
    const { wrapper, sceneObject } = mountInspector(
      makeSceneObject({ name: "A" })
    );

    await editAndBlur(fieldByLabel(wrapper, t.name), "  Renamed  ");

    expect(sceneObject.name).toBe("Renamed");
  });

  it("writes AP into position[0] converted from the active position unit", async () => {
    const { wrapper, sceneObject } = mountInspector(
      makeSceneObject({ position: [0, 0, 0] })
    );

    await editAndBlur(fieldByLabel(wrapper, axis.ap), "-2.5");

    expect(sceneObject.position[0]).toBeCloseTo(-2.5, 6);
  });

  it("toggles lock on lock button click", async () => {
    const { wrapper, sceneObject } = mountInspector(
      makeSceneObject({ lock: false })
    );

    await buttonByLabel(wrapper, t.lock).trigger("click");

    expect(sceneObject.lock).toBe(true);
  });

  it("duplicates the scene object on duplicate click", async () => {
    const { wrapper, store } = mountInspector(makeSceneObject({ name: "A" }));

    await buttonByLabel(wrapper, t.copy).trigger("click");

    expect(store.experiment.sceneObjects).toHaveLength(2);
    expect(store.experiment.sceneObjects[1]!.name).toBe("A - copy");
    expect(store.experiment.sceneObjects[1]!.id).not.toBe(
      store.experiment.sceneObjects[0]!.id
    );
    expect(store.experiment.sceneObjects[1]!.modelId).toBe(
      store.experiment.sceneObjects[0]!.modelId
    );
  });

  it("disables the position/rotation/scale fields while locked, leaving the name field editable", () => {
    const { wrapper } = mountInspector(makeSceneObject({ lock: true }));

    for (const label of [
      axis.ap,
      axis.dv,
      axis.ml,
      axis.roll,
      axis.yaw,
      axis.pitch,
      axis.z,
      axis.y,
      axis.x
    ]) {
      expect(fieldByLabel(wrapper, label).props("disable")).toBe(true);
    }
    expect(fieldByLabel(wrapper, t.name).props("disable")).toBeFalsy();
  });

  it("writes the scale row into scale[0] (Z) and scale[2] (X), not transposed", async () => {
    const { wrapper, sceneObject } = mountInspector(
      makeSceneObject({ scale: [1, 1, 1] })
    );

    await editAndBlur(fieldByLabel(wrapper, axis.z), "2");
    expect(sceneObject.scale[0]).toBeCloseTo(2, 6);

    await editAndBlur(fieldByLabel(wrapper, axis.x), "3");
    expect(sceneObject.scale[2]).toBeCloseTo(3, 6);
  });

  it("toggles collidable when the collision detection toggle changes", async () => {
    const { wrapper, sceneObject } = mountInspector(
      makeSceneObject({ collidable: true })
    );

    await wrapper.findComponent({ name: "QToggle" }).setValue(false);

    expect(sceneObject.collidable).toBe(false);
  });
});
