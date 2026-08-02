import { FetchStore, type Readable, withByteCaching } from "zarrita";

/**
 * Build the zarr store an annotation volume is opened from: a `FetchStore`
 * with a byte cache scoped to `zarr.json` metadata.
 * @param url Annotation volume URL to open.
 */
export function createAnnotationMetadataStore(url: string): Readable {
  return withByteCaching(new FetchStore(url), {
    keyFor: path => (path.endsWith("/zarr.json") ? path : undefined)
  });
}
