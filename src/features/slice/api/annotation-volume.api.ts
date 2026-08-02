import type { Readable } from "zarrita";
import { open, root } from "zarrita";
import type {
  AnnotationLevel,
  AnnotationVolume
} from "../models/annotation-level.model";

/** An OME-Zarr `coordinateTransformations` entry this feature reads. */
interface CoordinateTransformation {
  type: "scale" | "translation";
  scale?: number[];
  translation?: number[];
}

/** An OME-Zarr `multiscales[n].datasets[n]` entry. */
interface MultiscaleDataset {
  path: string;
  coordinateTransformations: CoordinateTransformation[];
}

/** An OME-Zarr `attributes.ome.multiscales[n]` entry. */
interface Multiscale {
  datasets: MultiscaleDataset[];
}

/** Fallback per-axis triple when a dataset omits a transformation. */
const ZERO_TRIPLE: [number, number, number] = [0, 0, 0];

/**
 * Open an atlas's annotation volume and describe its multiscale levels,
 * sorted finest first. Null when it can't be opened or has no usable levels.
 * @param store Zarr store to read from.
 * @param url Absolute URL of the OME-Zarr annotation volume root.
 * @param signal Abort signal for the metadata requests.
 */
export async function openAnnotationVolume(
  store: Readable,
  url: string,
  signal?: AbortSignal
): Promise<AnnotationVolume | null> {
  try {
    const group = await open(root(store), {
      kind: "group",
      ...(signal && { signal })
    });
    const multiscale = getMultiscale(group.attrs);
    if (!multiscale) return null;

    const levels: AnnotationLevel[] = [];
    for (const dataset of multiscale.datasets) {
      const array = await open(group.resolve(dataset.path), {
        kind: "array",
        ...(signal && { signal })
      });
      if (array.dtype !== "uint32" || array.shape.length !== 3) continue;

      const scale = getCoordinateTransformation(dataset, "scale");
      if (!scale) continue;

      levels.push({
        path: dataset.path,
        array,
        shapeVoxels: [array.shape[0]!, array.shape[1]!, array.shape[2]!],
        chunkShapeVoxels: [
          array.chunks[0]!,
          array.chunks[1]!,
          array.chunks[2]!
        ],
        scaleMillimeters: scale,
        translationMillimeters:
          getCoordinateTransformation(dataset, "translation") ?? ZERO_TRIPLE
      });
    }
    if (levels.length === 0) return null;

    levels.sort(
      (a, b) =>
        Math.min(...a.scaleMillimeters) - Math.min(...b.scaleMillimeters)
    );
    return { url, levels };
  } catch {
    return null;
  }
}

/**
 * Read one annotation chunk as a flat uint32 array in [ap, dv, ml] order.
 * Missing chunks come back filled with the array's fill value.
 * @param level Level to read from.
 * @param chunkCoordinates Chunk grid coordinates as [ap, dv, ml].
 * @param signal Abort signal for the request.
 */
export async function readAnnotationChunk(
  level: AnnotationLevel,
  chunkCoordinates: [number, number, number],
  signal?: AbortSignal
): Promise<Uint32Array> {
  const chunk = await level.array.getChunk(chunkCoordinates, {
    ...(signal && { signal })
  });
  return chunk.data as Uint32Array;
}

/**
 * Extract the first OME multiscale entry from a group's attributes, or null
 * when absent or malformed.
 * @param attrs Group attributes to read.
 */
function getMultiscale(attrs: Record<string, unknown>): Multiscale | null {
  const ome = attrs.ome as { multiscales?: unknown } | undefined;
  const multiscales = ome?.multiscales;
  if (!Array.isArray(multiscales) || multiscales.length === 0) return null;

  const multiscale = multiscales[0] as { datasets?: unknown };
  if (!Array.isArray(multiscale.datasets)) return null;

  return multiscale as Multiscale;
}

/**
 * Extract a dataset's per-axis scale or translation in mm, or null when
 * absent or malformed.
 * @param dataset Dataset to read.
 * @param type Transformation kind to extract.
 */
function getCoordinateTransformation(
  dataset: MultiscaleDataset,
  type: "scale" | "translation"
): [number, number, number] | null {
  const transformation = dataset.coordinateTransformations.find(
    entry => entry.type === type
  );
  const triple = transformation?.[type];
  if (!triple || triple.length !== 3) return null;
  return [triple[0]!, triple[1]!, triple[2]!];
}
