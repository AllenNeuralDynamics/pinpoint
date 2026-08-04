import { describe, expect, it } from "vitest";
import { computed, ref } from "vue";
import { useFuzzyFilter } from "./useFuzzyFilter";

interface Fruit {
  name: string;
}

const FRUITS: Fruit[] = [
  { name: "apple" },
  { name: "banana" },
  { name: "cherry" }
];

describe("useFuzzyFilter", () => {
  it("passes the unfiltered list through while the query is blank", () => {
    const query = ref("");
    const items = ref(FRUITS);

    const { isSearching, filtered } = useFuzzyFilter(query, items, {
      keys: ["name"]
    });

    expect(isSearching.value).toBe(false);
    expect(filtered.value).toEqual(FRUITS);
  });

  it("ranks matches once the query is non-blank", () => {
    const query = ref("");
    const items = ref(FRUITS);

    const { isSearching, filtered } = useFuzzyFilter(query, items, {
      keys: ["name"]
    });
    query.value = "aple";

    expect(isSearching.value).toBe(true);
    expect(filtered.value.map(fruit => fruit.name)).toContain("apple");
    expect(filtered.value.map(fruit => fruit.name)).not.toContain("banana");
  });

  it("treats a whitespace-only query as blank via a custom isBlank", () => {
    const query = ref("   ");
    const items = ref(FRUITS);

    const { isSearching, filtered } = useFuzzyFilter(
      query,
      items,
      { keys: ["name"] },
      value => value.trim() === ""
    );

    expect(isSearching.value).toBe(false);
    expect(filtered.value).toEqual(FRUITS);
  });

  it("applies a custom fallback transform while not searching", () => {
    const query = ref("");
    const items = ref(FRUITS);

    const { filtered } = useFuzzyFilter(
      query,
      items,
      { keys: ["name"] },
      value => value === "",
      list => [...list].reverse()
    );

    expect(filtered.value).toEqual([...FRUITS].reverse());
  });

  it("reacts to items changing while not searching", () => {
    const query = ref("");
    const rawItems = ref(FRUITS);
    const items = computed(() => rawItems.value);

    const { filtered } = useFuzzyFilter(query, items, { keys: ["name"] });
    rawItems.value = [{ name: "date" }];

    expect(filtered.value).toEqual([{ name: "date" }]);
  });
});
