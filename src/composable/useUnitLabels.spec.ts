import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { UnitLabels } from "./useUnitLabels";
import { useUnitLabels } from "./useUnitLabels";

/**
 * Mount a throwaway component so `useUnitLabels`' `useI18n` call has a real
 * component setup context, backed by the app's actual en-US messages.
 */
function mountUnitLabels(): UnitLabels {
  let labels!: UnitLabels;
  mountWithQuasar(
    defineComponent({
      setup() {
        labels = useUnitLabels();
        return () => null;
      }
    })
  );
  return labels;
}

describe("useUnitLabels", () => {
  describe("position", () => {
    it("labels micrometer as µm", () => {
      expect(mountUnitLabels().position("micrometer")).toBe("µm");
    });

    it("labels inch as in", () => {
      expect(mountUnitLabels().position("inch")).toBe("in");
    });
  });

  describe("rotation", () => {
    it("labels degree as °", () => {
      expect(mountUnitLabels().rotation("degree")).toBe("°");
    });

    it("labels radian as rad", () => {
      expect(mountUnitLabels().rotation("radian")).toBe("rad");
    });
  });
});
