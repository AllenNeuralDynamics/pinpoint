import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { QInput } from "quasar";
import {
  isNumberDragActive,
  useNumberDrag,
  type NumberDragOrigin
} from "./useNumberDrag";
import { createWrapperRegistry, mountWithQuasar } from "@/test/mount-helper";

const wrappers = createWrapperRegistry<ReturnType<typeof mountWithQuasar>>();

/**
 * Mount a host `QInput` wired to `useNumberDrag`, driven by a scripted drag
 * origin and recording every written value.
 * @param options Overrides for the host's drag origin and initial disable state.
 */
async function mountDragHost(
  options: {
    getDragOrigin?: () => NumberDragOrigin | null;
    disable?: boolean;
  } = {}
) {
  const {
    getDragOrigin = () => ({ value: value.value, step: 0.01 }),
    disable = false
  } = options;
  const value = ref(1);
  const Host = defineComponent({
    setup() {
      const field = ref<QInput | null>(null);
      useNumberDrag(() => field.value, {
        getDragOrigin,
        setValue: next => (value.value = next)
      });
      return { field, value };
    },
    render() {
      return h(QInput, {
        ref: "field",
        modelValue: String(this.value),
        disable
      });
    }
  });
  const wrapper = wrappers.track(
    mountWithQuasar(Host, { attachTo: document.body })
  );
  // `useNumberDrag`'s listeners bind via `useEventListener`'s `flush: "post"`
  // watcher, which runs after this synchronous mount returns.
  await nextTick();
  return { wrapper, value };
}

/**
 * Dispatch a real `PointerEvent` on an element, so `defaultPrevented` and
 * pointer capture reflect what a genuine drag would produce.
 * @param element Element to dispatch on.
 * @param type Pointer event type.
 * @param init Event fields to set.
 */
function firePointerEvent(
  element: Element,
  type: string,
  init: PointerEventInit
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init
  });
  element.dispatchEvent(event);
  return event;
}

describe("useNumberDrag", () => {
  afterEach(() => {
    wrappers.unmountAll();
  });

  it("writes the value 100 px of rightward drag maps to at the given step", async () => {
    const { wrapper, value } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(value.value).toBe(2);
  });

  it("writes the value 100 px of leftward drag maps to", async () => {
    const { wrapper, value } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: -100, pointerId: 1 });

    expect(value.value).toBe(0);
  });

  it("writes nothing before the drag threshold is crossed", async () => {
    const { wrapper, value } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 2, pointerId: 1 });

    expect(value.value).toBe(1);
  });

  it("focuses the native input on release when the press never crossed the drag threshold", async () => {
    const { wrapper } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 2, pointerId: 1 });
    await wrapper.trigger("pointerup", { pointerId: 1 });

    expect(wrapper.find("input").element).toBe(document.activeElement);
  });

  it("leaves focus alone on release once the press became a drag", async () => {
    const { wrapper } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
    await wrapper.trigger("pointerup", { pointerId: 1 });

    expect(wrapper.find("input").element).not.toBe(document.activeElement);
  });

  it("refuses the drag without suppressing the click when getDragOrigin returns null", async () => {
    const { wrapper, value } = await mountDragHost({
      getDragOrigin: () => null
    });

    const event = firePointerEvent(wrapper.element, "pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(event.defaultPrevented).toBe(false);
    expect(value.value).toBe(1);
  });

  it("refuses the drag on a disabled field", async () => {
    const { wrapper, value } = await mountDragHost({ disable: true });

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(value.value).toBe(1);
  });

  it("refuses the drag when the field already holds focus", async () => {
    const { wrapper, value } = await mountDragHost();
    wrapper.find("input").element.focus();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(value.value).toBe(1);
  });

  it("stops writing once the press is cancelled", async () => {
    const { wrapper, value } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
    await wrapper.trigger("pointercancel", { pointerId: 1 });
    await wrapper.trigger("pointermove", { clientX: 200, pointerId: 1 });

    expect(value.value).toBe(2);
  });

  it("marks the body as dragging only while a drag is in progress", async () => {
    const { wrapper } = await mountDragHost();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
    expect(document.body.classList.contains("drag-number--active")).toBe(true);

    await wrapper.trigger("pointerup", { pointerId: 1 });
    expect(document.body.classList.contains("drag-number--active")).toBe(false);
  });

  describe("isNumberDragActive", () => {
    it("is false before any drag, stays false below the threshold, and toggles true/false around a drag", async () => {
      const { wrapper } = await mountDragHost();
      expect(isNumberDragActive.value).toBe(false);

      await wrapper.trigger("pointerdown", {
        clientX: 0,
        pointerId: 1,
        button: 0
      });
      await wrapper.trigger("pointermove", { clientX: 2, pointerId: 1 });
      expect(isNumberDragActive.value).toBe(false);

      await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
      expect(isNumberDragActive.value).toBe(true);

      await wrapper.trigger("pointerup", { pointerId: 1 });
      expect(isNumberDragActive.value).toBe(false);
    });

    it("clears after a pointercancel", async () => {
      const { wrapper } = await mountDragHost();

      await wrapper.trigger("pointerdown", {
        clientX: 0,
        pointerId: 1,
        button: 0
      });
      await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
      expect(isNumberDragActive.value).toBe(true);

      await wrapper.trigger("pointercancel", { pointerId: 1 });
      expect(isNumberDragActive.value).toBe(false);
    });

    it("clears when the host unmounts mid-drag", async () => {
      const { wrapper } = await mountDragHost();

      await wrapper.trigger("pointerdown", {
        clientX: 0,
        pointerId: 1,
        button: 0
      });
      await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });
      expect(isNumberDragActive.value).toBe(true);

      wrapper.unmount();
      expect(isNumberDragActive.value).toBe(false);
    });
  });
});
