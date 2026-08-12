import {
  getExperimentModelIds,
  type Experiment,
  type SceneModelFile,
  unzipExperiment,
  zipExperiment
} from "@/features/experiment";
import { getSceneModel, putSceneModel } from "@/features/scene";

/** An experiment recovered from a synced archive. */
export interface RestoredArchive {
  experiment: Experiment;
}

/**
 * Zip an experiment together with every scene model file it references that is
 * still held locally.
 * @param experiment Experiment to archive.
 */
export async function buildExperimentArchive(
  experiment: Experiment
): Promise<Uint8Array> {
  const models = new Map<string, SceneModelFile>();
  for (const id of getExperimentModelIds(experiment)) {
    const modelFile = await getSceneModel(id);
    if (!modelFile) continue;
    models.set(id, {
      fileName: modelFile.name,
      bytes: new Uint8Array(await modelFile.arrayBuffer())
    });
  }

  return zipExperiment(experiment, models);
}

/**
 * Read an experiment archive back, writing its model files to local storage,
 * or null when the bytes aren't a well-formed archive.
 * @param archiveBytes Zipped experiment archive.
 */
export async function restoreExperimentArchive(
  archiveBytes: Uint8Array
): Promise<RestoredArchive | null> {
  let archive: ReturnType<typeof unzipExperiment>;
  try {
    archive = unzipExperiment(archiveBytes);
  } catch {
    return null;
  }
  if (!archive) return null;

  for (const [id, { fileName, bytes }] of archive.models) {
    await putSceneModel(id, new File([bytes.slice()], fileName));
  }

  return { experiment: archive.experiment };
}
