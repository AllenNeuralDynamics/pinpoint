import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { mountWithQuasar } from "@/test/mount-helper";
import type { AtlasAxes } from "./useAtlasAxes";
import { useAtlasAxes } from "./useAtlasAxes";
import { usePreferencesStore } from "@/stores/preferences.store";

/**
 * Mount a throwaway component so `useAtlasAxes`' `useI18n` call has a real
 * component setup context, backed by the app's actual en-US messages and a
 * fresh Pinia instance.
 */
function mountAtlasAxes(): AtlasAxes {
  let axes!: AtlasAxes;
  mountWithQuasar(
    defineComponent({
      setup() {
        axes = useAtlasAxes();
        return () => null;
      }
    })
  );
  return axes;
}

describe("useAtlasAxes", () => {
  describe("positionDefaultNames", () => {
    it("labels the position triple AP, DV, ML", () => {
      expect(mountAtlasAxes().positionDefaultNames.value).toEqual([
        "AP",
        "DV",
        "ML"
      ]);
    });
  });

  describe("rotationDefaultNames", () => {
    it("labels the rotation triple Roll, Yaw, Pitch", () => {
      expect(mountAtlasAxes().rotationDefaultNames.value).toEqual([
        "Roll",
        "Yaw",
        "Pitch"
      ]);
    });
  });

  describe("position", () => {
    it("returns the built-in labels in identity order by default", () => {
      expect(mountAtlasAxes().position.value).toEqual([
        { axis: 0, label: "AP" },
        { axis: 1, label: "DV" },
        { axis: 2, label: "ML" }
      ]);
    });

    it("reflects the preference store's order and names reactively", () => {
      const axes = mountAtlasAxes();
      const preferences = usePreferencesStore();

      preferences.positionAxisOrder = [2, 1, 0];
      preferences.positionAxisNames = ["Bregma AP", "", ""];

      expect(axes.position.value).toEqual([
        { axis: 2, label: "ML" },
        { axis: 1, label: "DV" },
        { axis: 0, label: "Bregma AP" }
      ]);
    });
  });

  describe("rotation", () => {
    it("returns the built-in labels in identity order by default", () => {
      expect(mountAtlasAxes().rotation.value).toEqual([
        { axis: 0, label: "Roll" },
        { axis: 1, label: "Yaw" },
        { axis: 2, label: "Pitch" }
      ]);
    });
  });
});
