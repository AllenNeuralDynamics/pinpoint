import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KeyboardControls from "./KeyboardControls.vue";
import { createWrapperRegistry, mountWithQuasar } from "@/test/mount-helper";
import { makeProbe } from "@/test/fixtures";
import { useCurrentExperimentStore } from "@/stores/current-experiment.store";
import { getTerminologyRows } from "@/features/atlas";
import { buildCoordinateAxis } from "@/utils/coordinate-frame";
import type { Probe } from "@/features/probe";
import type { GizmoMode } from "@/features/scene";

// The controls read the current experiment's coordinate system, whose
// terminology rows would otherwise be fetched from the atlas source.
vi.mock("@/features/atlas/api/source.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/atlas/api/source.api")
  >("@/features/atlas/api/source.api");
  return {
    ...actual,
    getTerminologyRows: vi.fn()
  };
});

beforeEach(() => {
  vi.mocked(getTerminologyRows).mockResolvedValue([]);
});

const wrappers = createWrapperRegistry<ReturnType<typeof mountWithQuasar>>();

afterEach(() => {
  wrappers.unmountAll();
});

/** Probe every test drives, at a distinctive pose. */
function makeDrivenProbe(): Probe {
  return makeProbe({ tipPosition: [1, 2, 3], rotation: [0, 0, 0] });
}

/**
 * Mount the overlays wired to a probe and a transform gizmo.
 * @param probe Probe the keys drive, or null for none.
 * @param gizmoMode Transform gizmo the keyboard maps to.
 */
async function mountKeyboardControls(
  probe: Probe | null,
  gizmoMode: GizmoMode = "position"
) {
  const wrapper = wrappers.track(
    mountWithQuasar(KeyboardControls, { props: { probe, gizmoMode } })
  );
  // `useKeyboardControls` binds its listener through `useEventListener`'s
  // `flush: "post"` watcher, which runs after this synchronous mount returns.
  await nextTick();
  return wrapper;
}

/**
 * Dispatch a physical key press, from `window` or from a given element.
 * @param code `KeyboardEvent.code` of the pressed key.
 * @param options Modifier state and the element the press originates from.
 */
async function pressKey(
  code: string,
  options: { ctrlKey?: boolean; target?: HTMLElement } = {}
) {
  const event = new KeyboardEvent("keydown", {
    code,
    ctrlKey: options.ctrlKey ?? false,
    bubbles: true,
    cancelable: true
  });
  (options.target ?? window).dispatchEvent(event);
  await nextTick();
  return event;
}

describe("KeyboardControls", () => {
  it("shows nothing until a control key is pressed", async () => {
    const wrapper = await mountKeyboardControls(makeDrivenProbe());

    expect(wrapper.text()).toBe("");
  });

  it("moves the probe's tip and reveals the legend and the current speed", async () => {
    const probe = makeDrivenProbe();
    const wrapper = await mountKeyboardControls(probe);

    const event = await pressKey("KeyW");

    expect(probe.tipPosition).toEqual([1, 2.01, 3]);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.text()).toContain("Speed 10 µm/click");
    expect(wrapper.findAll("kbd").map(key => key.text())).toEqual([
      "W",
      "S",
      "A",
      "D",
      "Q",
      "E",
      "-",
      "+"
    ]);
    expect(wrapper.text()).toContain("AP");
    expect(wrapper.text()).toContain("ML");
    expect(wrapper.text()).toContain("SI");
  });

  it("colors each key pair by the anatomical line it drives, matching the scene's axis guides", async () => {
    const wrapper = await mountKeyboardControls(makeDrivenProbe());

    await pressKey("KeyW");

    const axisClasses = wrapper
      .findAll(".keyboard-control-legend > div")
      .map(row => row.classes().find(name => name.startsWith("axis-")));
    expect(axisClasses).toEqual([
      "axis-posteriorAnterior",
      "axis-leftRight",
      "axis-inferiorSuperior",
      "axis-speed"
    ]);
  });

  it("labels each key pair with the coordinate system's own axis name", async () => {
    const wrapper = await mountKeyboardControls(makeDrivenProbe());
    const system = useCurrentExperimentStore().globalCoordinateSystem;
    system.axes[1].positionName = "Bregma AP";

    await pressKey("KeyW");

    expect(wrapper.text()).toContain("Bregma AP");
  });

  it("keeps W moving the probe anteriorly when the global axis points posteriorly", async () => {
    const probe = makeDrivenProbe();
    await mountKeyboardControls(probe);
    const currentExperiment = useCurrentExperimentStore();
    currentExperiment.globalCoordinateSystem.axes[1] = buildCoordinateAxis(
      "Anterior_to_posterior"
    );

    await pressKey("KeyW");

    // The axis now counts anterior down, so the same anatomical move subtracts.
    expect(probe.tipPosition).toEqual([1, 1.99, 3]);
  });

  it("walks the speed ladder with - and +, stopping at its finest step", async () => {
    const probe = makeDrivenProbe();
    const wrapper = await mountKeyboardControls(probe);

    await pressKey("Equal");
    expect(wrapper.text()).toContain("Speed 100 µm/click");

    await pressKey("Minus");
    await pressKey("Minus");
    await pressKey("Minus");
    await pressKey("Minus");
    expect(wrapper.text()).toContain("Speed 0.1 µm/click");

    await pressKey("KeyD");
    expect(probe.tipPosition[0]).toBeCloseTo(0.9999, 10);
  });

  it("remaps to the rotation controls when the rotation gizmo is enabled", async () => {
    const probe = makeDrivenProbe();
    const wrapper = await mountKeyboardControls(probe, "rotation");

    await pressKey("KeyW");
    expect(probe.tipPosition).toEqual([1, 2, 3]);
    expect(wrapper.text()).toBe("");

    await pressKey("Digit3");
    expect(probe.rotation).toEqual([0, 0, -Math.PI / 12]);
    expect(wrapper.text()).toContain("Speed 15°/click");
    expect(wrapper.findAll("kbd").map(key => key.text())).toEqual([
      "1",
      "3",
      "F",
      "R",
      ",",
      ".",
      "-",
      "+"
    ]);
    expect(wrapper.text()).toContain("Yaw");
    expect(wrapper.text()).toContain("Pitch");
    expect(wrapper.text()).toContain("Roll");
  });

  it("maps no keys while the scale gizmo is enabled", async () => {
    const probe = makeDrivenProbe();
    const wrapper = await mountKeyboardControls(probe, "scale");

    await pressKey("KeyW");
    await pressKey("Equal");

    expect(probe.tipPosition).toEqual([1, 2, 3]);
    expect(wrapper.text()).toBe("");
  });

  it("ignores keys when there is no probe to drive", async () => {
    const wrapper = await mountKeyboardControls(null);

    const event = await pressKey("KeyW");

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.text()).toBe("");
  });

  it("ignores presses typed into a text field and shortcut chords", async () => {
    const input = document.createElement("input");
    document.body.append(input);
    const probe = makeDrivenProbe();
    await mountKeyboardControls(probe);

    await pressKey("KeyW", { target: input });
    await pressKey("KeyW", { ctrlKey: true });

    expect(probe.tipPosition).toEqual([1, 2, 3]);
    input.remove();
  });
});
