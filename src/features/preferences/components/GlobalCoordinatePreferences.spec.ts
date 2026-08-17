import { beforeEach, describe, expect, it, vi } from "vitest";
import { toRaw } from "vue";
import GlobalCoordinatePreferences from "./GlobalCoordinatePreferences.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import { isGlobalCoordinateSystem } from "@/utils/coordinate-frame";
import enUS from "@/i18n/en-US";

const t = enUS.preferences;

// `useCurrentExperimentStore`'s `terminologyRows` is a `computedAsync` and
// fetches on store creation -- mock the leaf module (not the
// `@/features/atlas` barrel) or mounting triggers real network calls.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

describe("GlobalCoordinatePreferences", () => {
  beforeEach(() => {
    vi.mocked(getTerminologyRows).mockResolvedValue([]);
  });

  it("names the current system and derives its handedness", () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);

    expect(wrapper.text()).toContain(`RAS (${t.handednessRight})`);
  });

  it("renames the system and flips its handedness when an axis is reversed", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("pickDirection", 0, "Right_to_left");
    await wrapper.vm.$nextTick();

    expect(store.globalCoordinateSystem.axes[0].direction).toBe(
      "Right_to_left"
    );
    expect(wrapper.text()).toContain(`LAS (${t.handednessLeft})`);
  });

  it("hands its old direction to the parallel axis instead of going invalid", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("pickDirection", 0, "Superior_to_inferior");

    expect(
      store.globalCoordinateSystem.axes.map(axis => axis.direction)
    ).toEqual([
      "Superior_to_inferior",
      "Posterior_to_anterior",
      "Left_to_right"
    ]);
    expect(isGlobalCoordinateSystem(store.globalCoordinateSystem)).toBe(true);
  });

  it("re-expresses the experiment's coordinates in the new axes", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();
    store.referenceCoordinate[0] = 1;
    store.referenceCoordinate[1] = 2;
    store.referenceCoordinate[2] = 3;

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("pickDirection", 0, "Superior_to_inferior");

    // Slot 0 now runs superior to inferior, so it holds -3, and the
    // left-to-right value it used to hold moved to slot 2.
    expect(store.referenceCoordinate).toEqual([-3, 2, 1]);
  });

  it("never edits the experiment's own system object in place", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();
    const previous = store.globalCoordinateSystem;
    const snapshot = structuredClone(toRaw(previous));

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("pickDirection", 0, "Superior_to_inferior");

    expect(previous).toEqual(snapshot);
    expect(store.globalCoordinateSystem).not.toBe(previous);
  });

  it("writes a position name and a rotation name onto the named axis", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();
    const list = wrapper.findComponent({ name: "GlobalAxisList" });

    await list.vm.$emit("renamePosition", 1, "Bregma AP");
    await list.vm.$emit("renameRotation", 2, "Spin");

    expect(store.globalCoordinateSystem.axes[1].positionName).toBe("Bregma AP");
    expect(store.globalCoordinateSystem.axes[2].rotationName).toBe("Spin");
  });

  it("reorders the position inputs when a row is dragged", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("move", 0, 2);

    expect(store.globalCoordinateSystem.positionDisplayOrder).toEqual([
      1, 2, 0
    ]);
    expect(store.globalCoordinateSystem.rotationDisplayOrder).toEqual([
      0, 1, 2
    ]);
  });

  it("reorders the rotation inputs on their own, labelled by each axis", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);
    const store = useCurrentExperimentStore();
    const orderList = wrapper.findComponent({ name: "AxisOrderList" });
    expect(orderList.props("labels")).toEqual([
      enUS.axis.pitch,
      enUS.axis.roll,
      enUS.axis.yaw
    ]);

    await orderList.vm.$emit("move", 2, 0);

    expect(store.globalCoordinateSystem.rotationDisplayOrder).toEqual([
      2, 0, 1
    ]);
    expect(store.globalCoordinateSystem.positionDisplayOrder).toEqual([
      0, 1, 2
    ]);
  });

  it("labels the rotation order by a user name once one is set", async () => {
    const wrapper = mountWithQuasar(GlobalCoordinatePreferences);

    await wrapper
      .findComponent({ name: "GlobalAxisList" })
      .vm.$emit("renameRotation", 0, "Tilt");
    await wrapper.vm.$nextTick();

    expect(
      wrapper.findComponent({ name: "AxisOrderList" }).props("labels")
    ).toEqual(["Tilt", enUS.axis.roll, enUS.axis.yaw]);
  });
});
