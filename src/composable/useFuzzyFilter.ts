import { computed, type ComputedRef, type Ref } from "vue";
import { useFuse, type FuseOptions } from "@vueuse/integrations/useFuse";

/** Reactive result of {@link useFuzzyFilter}. */
export interface FuzzyFilter<T> {
  /** Whether `query` is currently driving the result through Fuse. */
  isSearching: Readonly<Ref<boolean>>;
  /** Fuse-ranked matches while searching, otherwise `items` through `fallback`. */
  filtered: Readonly<Ref<T[]>>;
}

/**
 * Fuzzy filter a list by a query, falling back to the unfiltered list (or a
 * transform of it) once the query is judged blank.
 * @param query Search text to filter by.
 * @param items List to filter.
 * @param fuseOptions Fuse.js options, e.g. which keys to search.
 * @param isBlank Whether a query counts as blank and disables searching.
 *   Defaults to empty-string only; pass a whitespace-trimming check to also
 *   treat a whitespace-only query as blank.
 * @param fallback Transform applied to `items` while not searching. Defaults
 *   to the list unchanged.
 */
export function useFuzzyFilter<T>(
  query: Ref<string>,
  items: Ref<T[]> | ComputedRef<T[]>,
  fuseOptions: FuseOptions<T>,
  isBlank: (query: string) => boolean = query => query === "",
  fallback: (items: T[]) => T[] = items => items
): FuzzyFilter<T> {
  const { results } = useFuse(query, items, { fuseOptions });

  const isSearching = computed(() => !isBlank(query.value));
  const filtered = computed(() =>
    isSearching.value
      ? results.value.map(result => result.item)
      : fallback(items.value)
  );

  return { isSearching, filtered };
}
