import { describe, expect, it } from "vitest";
import DirectionSelect from "./DirectionSelect.vue";
import { mountWithQuasar } from "@/test/mount-helper";
import enUS from "@/i18n/en-US";

/**
 * Mount a direction select showing the given direction.
 * @param props Props to override on the mounted select.
 */
function mountSelect(props: Record<string, unknown> = {}) {
  return mountWithQuasar(DirectionSelect, {
    props: { label: "Depth", modelValue: "Anterior_to_posterior", ...props }
  });
}

describe("DirectionSelect", () => {
  it("offers all six anatomical directions in picker order", () => {
    const wrapper = mountSelect();

    expect(wrapper.findComponent({ name: "QSelect" }).props("options")).toEqual(
      [
        { label: enUS.direction.leftToRight, value: "Left_to_right" },
        { label: enUS.direction.rightToLeft, value: "Right_to_left" },
        {
          label: enUS.direction.posteriorToAnterior,
          value: "Posterior_to_anterior"
        },
        {
          label: enUS.direction.anteriorToPosterior,
          value: "Anterior_to_posterior"
        },
        {
          label: enUS.direction.inferiorToSuperior,
          value: "Inferior_to_superior"
        },
        {
          label: enUS.direction.superiorToInferior,
          value: "Superior_to_inferior"
        }
      ]
    );
  });

  it("shows the direction it is given", () => {
    const wrapper = mountSelect();

    expect(wrapper.findComponent({ name: "QSelect" }).props("modelValue")).toBe(
      "Anterior_to_posterior"
    );
  });

  it("emits the picked direction", async () => {
    const wrapper = mountSelect();

    await wrapper
      .findComponent({ name: "QSelect" })
      .vm.$emit("update:modelValue", "Left_to_right");

    expect(wrapper.emitted("update:modelValue")).toEqual([["Left_to_right"]]);
  });

  it("names itself by its label, or by an explicit accessible name", () => {
    expect(mountSelect().find("[aria-label]").attributes("aria-label")).toBe(
      "Depth"
    );
    expect(
      mountSelect({ ariaLabel: "Direction for AP" })
        .find("[aria-label]")
        .attributes("aria-label")
    ).toBe("Direction for AP");
  });
});
