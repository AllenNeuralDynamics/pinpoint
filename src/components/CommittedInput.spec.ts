import { describe, expect, it } from "vitest";
import CommittedInput from "./CommittedInput.vue";
import { mountWithQuasar } from "@/test/mount-helper";

const rejectBad = [(value: string) => value !== "bad" || "nope"];

/**
 * Focus, replace the field's text, and blur it -- the sequence a real user
 * produces, which `use-field`'s handlers require in this order (blur is a
 * no-op unless the field was already focused).
 */
async function editAndBlur(
  wrapper: ReturnType<typeof mountWithQuasar>,
  value: string
) {
  const native = wrapper.find("input");
  await native.trigger("focusin");
  await native.setValue(value);
  await native.trigger("focusout");
  await new Promise(resolve => setTimeout(resolve));
}

describe("CommittedInput", () => {
  it("renders the initial modelValue", () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    expect(wrapper.find("input").element.value).toBe("hello");
  });

  it("emits nothing while typing, before blur or enter", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await wrapper.find("input").trigger("focusin");
    await wrapper.find("input").setValue("world");

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("emits the new value on blur when valid", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await editAndBlur(wrapper, "world");

    expect(wrapper.emitted("update:modelValue")).toEqual([["world"]]);
  });

  it("emits the new value on Enter when valid", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });
    const native = wrapper.find("input");
    await native.trigger("focusin");
    await native.setValue("world");

    await native.trigger("keyup", { key: "Enter" });

    expect(wrapper.emitted("update:modelValue")).toEqual([["world"]]);
  });

  it("emits nothing when a rule fails", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await editAndBlur(wrapper, "bad");

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("shows the failing rule's message", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await editAndBlur(wrapper, "bad");

    expect(wrapper.find("[role='alert']").text()).toBe("nope");
  });

  it("resyncs the draft and clears the error when modelValue changes externally", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });
    await editAndBlur(wrapper, "bad");
    expect(wrapper.find("[role='alert']").text()).toBe("nope");

    // Cast: `setProps`'s generic doesn't narrow to the SFC's declared props.
    await wrapper.setProps({ modelValue: "other" } as Record<string, unknown>);

    expect(wrapper.find("input").element.value).toBe("other");
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
  });

  it("does not re-emit on a second blur with unchanged text", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await editAndBlur(wrapper, "world");
    await wrapper.setProps({ modelValue: "world" } as Record<string, unknown>);
    await editAndBlur(wrapper, "world");

    expect(wrapper.emitted("update:modelValue")).toEqual([["world"]]);
  });

  it("selects the whole value on focus", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "hello", rules: rejectBad }
    });

    await wrapper.find("input").trigger("focusin");

    const native = wrapper.find("input").element;
    expect(native.selectionStart).toBe(0);
    expect(native.selectionEnd).toBe("hello".length);
  });

  it("drags to a new value at the given step, preserving canonical decimal precision", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "5.000", rules: rejectBad, dragStep: 0.01 }
    });
    await wrapper.vm.$nextTick();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(wrapper.emitted("update:modelValue")).toEqual([["6.000"]]);
  });

  it("drags an integer-formatted value to another integer", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "5", rules: rejectBad, dragStep: 0.01 }
    });
    await wrapper.vm.$nextTick();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(wrapper.emitted("update:modelValue")).toEqual([["6"]]);
  });

  it("emits nothing from a drag gesture when dragStep is omitted", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      props: { modelValue: "5.000", rules: rejectBad }
    });
    await wrapper.vm.$nextTick();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointermove", { clientX: 100, pointerId: 1 });

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("selects the whole value on a press-and-release that never becomes a drag", async () => {
    const wrapper = mountWithQuasar(CommittedInput, {
      attachTo: document.body,
      props: { modelValue: "5.000", rules: rejectBad, dragStep: 0.01 }
    });
    await wrapper.vm.$nextTick();

    await wrapper.trigger("pointerdown", {
      clientX: 0,
      pointerId: 1,
      button: 0
    });
    await wrapper.trigger("pointerup", { pointerId: 1 });

    const native = wrapper.find("input").element;
    expect(native.selectionStart).toBe(0);
    expect(native.selectionEnd).toBe("5.000".length);
    wrapper.unmount();
  });
});
