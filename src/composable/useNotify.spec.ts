import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useNotify } from "./useNotify";
import { mountWithQuasar } from "@/test/mount-helper";

const Harness = defineComponent({
  setup() {
    return useNotify();
  },
  template: "<div></div>"
});

describe("useNotify", () => {
  it("notifyError sends a negative, error-icon toast", () => {
    const wrapper = mountWithQuasar(Harness);
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    wrapper.vm.notifyError("message", "caption");

    expect(notifySpy).toHaveBeenCalledWith({
      message: "message",
      caption: "caption",
      color: "negative",
      icon: "error"
    });
    wrapper.unmount();
  });

  it("notifyWarning sends a warning-colored, warning-icon toast", () => {
    const wrapper = mountWithQuasar(Harness);
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    wrapper.vm.notifyWarning("message", "caption");

    expect(notifySpy).toHaveBeenCalledWith({
      message: "message",
      caption: "caption",
      color: "warning",
      icon: "warning"
    });
    wrapper.unmount();
  });

  it("notifySuccess sends a positive, check-icon toast", () => {
    const wrapper = mountWithQuasar(Harness);
    const notifySpy = vi.spyOn(wrapper.vm.$q, "notify");

    wrapper.vm.notifySuccess("message", "caption");

    expect(notifySpy).toHaveBeenCalledWith({
      message: "message",
      caption: "caption",
      color: "positive",
      icon: "check_circle"
    });
    wrapper.unmount();
  });
});
