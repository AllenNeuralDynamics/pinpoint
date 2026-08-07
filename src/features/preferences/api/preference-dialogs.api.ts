import type { QVueGlobals } from "quasar";
import PreferencesDialog from "../components/PreferencesDialog.vue";
import WorldEditorDialog from "../components/WorldEditorDialog.vue";
import type {
  PreferencesDialogResult,
  PreferencesTab
} from "../models/preferences-dialog.model";

/**
 * Open the preferences dialog on a given tab, routing its world-editor
 * request onward.
 * @param quasar Quasar instance whose dialog plugin mounts the dialog.
 * @param tab Tab the dialog opens on.
 */
export function openPreferencesDialog(
  quasar: QVueGlobals,
  tab: PreferencesTab = "general"
): void {
  quasar
    .dialog({ component: PreferencesDialog, componentProps: { tab } })
    .onOk((result?: PreferencesDialogResult) => {
      if (result === "world-editor") openWorldEditorDialog(quasar);
    });
}

/**
 * Open the seamless world editor, returning to preferences once it is done.
 * @param quasar Quasar instance whose dialog plugin mounts the dialog.
 */
function openWorldEditorDialog(quasar: QVueGlobals): void {
  quasar.dialog({ component: WorldEditorDialog }).onOk(() => {
    openPreferencesDialog(quasar, "scene");
  });
}
