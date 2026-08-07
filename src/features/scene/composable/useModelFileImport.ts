import { useFileDialog } from "@vueuse/core";
import { ref, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { canLoadModelFile } from "../api/model-file.api";
import { putSceneModel } from "../api/scene-model.api";
import { useBabylonRuntimeService } from "./useBabylonRuntimeService";
import { useNotify } from "@/composable/useNotify";

/** Extensions Babylon's registered built-in loaders claim. */
const MODEL_FILE_ACCEPT = ".glb,.gltf,.obj,.stl,.fbx,.babylon,.splat,.ply,.spz";

/**
 * Pick a 3D model file, validate it, and store its bytes in IndexedDB under a
 * fresh id, notifying when the file can't be imported.
 * @param onImported Called with the stored model's id and the picked file.
 */
export function useModelFileImport(
  onImported: (modelId: string, file: File) => void
): { isImporting: Ref<boolean>; open: () => void } {
  const runtime = useBabylonRuntimeService();
  const { t } = useI18n();
  const { notifyError } = useNotify();
  const { open: openDialog, onChange } = useFileDialog({
    accept: MODEL_FILE_ACCEPT,
    multiple: false,
    reset: true
  });

  const isImporting = ref(false);

  onChange(async files => {
    // `reset: true` fires a null change before opening the picker.
    const file = files?.[0];
    const engine = runtime.engine.value;
    if (!file || !engine) return;

    isImporting.value = true;
    try {
      if (!(await canLoadModelFile(engine, file))) {
        notifyError(
          t("modelFile.invalidModelFile"),
          t("modelFile.invalidModelFileCaption")
        );
        return;
      }

      const modelId = crypto.randomUUID();
      await putSceneModel(modelId, file);
      onImported(modelId, file);
    } catch {
      notifyError(
        t("modelFile.invalidModelFile"),
        t("modelFile.invalidModelFileCaption")
      );
    } finally {
      isImporting.value = false;
    }
  });

  return { isImporting, open: () => openDialog() };
}
