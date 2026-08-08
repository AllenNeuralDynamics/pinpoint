import type { QVueGlobals } from "quasar";
import PreferencesDialog from "../components/PreferencesDialog.vue";
import type { PreferencesTab } from "../models/preferences-dialog.model";

/**
 * Open the preferences dialog on a given tab.
 * @param quasar Quasar instance whose dialog plugin mounts the dialog.
 * @param tab Tab the dialog opens on.
 */
export function openPreferencesDialog(
  quasar: QVueGlobals,
  tab: PreferencesTab = "general"
): void {
  quasar.dialog({ component: PreferencesDialog, componentProps: { tab } });
}
