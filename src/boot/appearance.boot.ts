import { defineBoot } from "#q-app";
import { watch } from "vue";
import { Dark } from "quasar";
import { applyAppearance } from "@/features/preferences";
import { usePreferencesStore } from "@/stores/preferences.store";

/**
 * Keep Quasar's dark mode in sync with the appearance preference.
 */
export default defineBoot(({ store }) => {
  const preferences = usePreferencesStore(store);
  watch(
    () => preferences.appearance,
    appearance => applyAppearance(Dark, appearance),
    { immediate: true }
  );
});
