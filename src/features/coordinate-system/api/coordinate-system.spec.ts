import { describe, expect, it } from "vitest";
import {
  addCoordinateSystemTransform,
  applyCoordinateSystemChainValues,
  buildCoordinateSystem,
  buildCoordinateSystemNode,
  buildCoordinateSystemValue,
  buildFixedCoordinateSystemValue,
  getCoordinateSystemAxisValue,
  getCoordinateSystemValueAxis,
  isCoordinateSystem,
  removeCoordinateSystemTransform,
  reorderCoordinateSystemTransform,
  reorderCoordinateSystemValue,
  setCoordinateSystemAxisValue,
  setCoordinateSystemSurfaceNode,
  setCoordinateSystemValueAxis,
  setCoordinateSystemValueBounded,
  setCoordinateSystemValueFixed
} from "./coordinate-system.api";
import type { CoordinateSystemValue } from "../model/coordinate-system.model";
import { makeCoordinateSystem } from "@/test/fixtures";

describe("addCoordinateSystemTransform", () => {
  it("appends an all-zero, unfixed, unbounded node to the chain", () => {
    const coordinateSystem = makeCoordinateSystem();

    addCoordinateSystemTransform(coordinateSystem, "Tip");

    expect(coordinateSystem.chain).toHaveLength(2);
    const node = coordinateSystem.chain[1]!;
    expect(node.position.map(value => value.name)).toEqual(["ML", "DV", "AP"]);
    expect(node.rotation.map(value => value.name)).toEqual([
      "Pitch",
      "Yaw",
      "Roll"
    ]);
    for (const value of [...node.position, ...node.rotation]) {
      expect(value.value).toBe(0);
      expect(value.fixed).toBe(false);
      expect(value.bounds).toBeNull();
    }
  });

  it("puts the passed name on the appended node", () => {
    const coordinateSystem = makeCoordinateSystem();

    addCoordinateSystemTransform(coordinateSystem, "Depth");

    expect(coordinateSystem.chain[1]!.name).toBe("Depth");
  });

  it("appends a node to an empty chain", () => {
    const coordinateSystem = makeCoordinateSystem({ chain: [] });

    addCoordinateSystemTransform(coordinateSystem, "Tip");

    expect(coordinateSystem.chain).toHaveLength(1);
  });
});

describe("reorderCoordinateSystemTransform", () => {
  function makeTwoNodeChain() {
    return makeCoordinateSystem({
      chain: [
        buildCoordinateSystemNode(
          "First",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ]
        ),
        buildCoordinateSystemNode(
          "Second",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ],
          [0, 1, 2],
          [0, 1, 2],
          true
        )
      ]
    });
  }

  it("moving index 1 to 0 reverses a two-node chain, keeping the moved node's surface flag", () => {
    const coordinateSystem = makeTwoNodeChain();

    reorderCoordinateSystemTransform(coordinateSystem, 1, 0);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "Second",
      "First"
    ]);
    expect(coordinateSystem.chain[0]!.onSurface).toBe(true);
    expect(coordinateSystem.chain.filter(node => node.onSurface)).toHaveLength(
      1
    );
  });

  it("leaves the chain untouched when the indices are equal", () => {
    const coordinateSystem = makeTwoNodeChain();

    reorderCoordinateSystemTransform(coordinateSystem, 0, 0);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "First",
      "Second"
    ]);
  });

  it("leaves the chain untouched when either index is negative", () => {
    const coordinateSystem = makeTwoNodeChain();

    reorderCoordinateSystemTransform(coordinateSystem, -1, 0);
    reorderCoordinateSystemTransform(coordinateSystem, 0, -1);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "First",
      "Second"
    ]);
  });

  it("leaves the chain untouched when either index is out of range", () => {
    const coordinateSystem = makeTwoNodeChain();

    reorderCoordinateSystemTransform(coordinateSystem, 2, 0);
    reorderCoordinateSystemTransform(coordinateSystem, 0, 2);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "First",
      "Second"
    ]);
  });
});

describe("removeCoordinateSystemTransform", () => {
  function makeThreeNodeChain() {
    return makeCoordinateSystem({
      chain: [
        buildCoordinateSystemNode(
          "First",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ]
        ),
        buildCoordinateSystemNode(
          "Second",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ],
          [0, 1, 2],
          [0, 1, 2],
          true
        ),
        buildCoordinateSystemNode(
          "Third",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ]
        )
      ]
    });
  }

  it("removing the middle of a three-node chain keeps the outer two in order", () => {
    const coordinateSystem = makeThreeNodeChain();

    removeCoordinateSystemTransform(coordinateSystem, 1);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "First",
      "Third"
    ]);
  });

  it("removing the only node leaves an empty chain", () => {
    const coordinateSystem = makeCoordinateSystem();

    removeCoordinateSystemTransform(coordinateSystem, 0);

    expect(coordinateSystem.chain).toHaveLength(0);
  });

  it("removing the surface node leaves every remaining node off the surface", () => {
    const coordinateSystem = makeThreeNodeChain();

    removeCoordinateSystemTransform(coordinateSystem, 1);

    expect(coordinateSystem.chain.every(node => !node.onSurface)).toBe(true);
  });

  it("leaves the chain untouched when the index is negative or out of range", () => {
    const coordinateSystem = makeThreeNodeChain();

    removeCoordinateSystemTransform(coordinateSystem, -1);
    removeCoordinateSystemTransform(coordinateSystem, 3);

    expect(coordinateSystem.chain.map(node => node.name)).toEqual([
      "First",
      "Second",
      "Third"
    ]);
  });
});

describe("setCoordinateSystemSurfaceNode", () => {
  function makeTwoNodeChain() {
    return makeCoordinateSystem({
      chain: [
        buildCoordinateSystemNode(
          "Tip",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ],
          [0, 1, 2],
          [0, 1, 2],
          true
        ),
        buildCoordinateSystemNode(
          "Second",
          [
            buildCoordinateSystemValue("ML"),
            buildCoordinateSystemValue("DV"),
            buildCoordinateSystemValue("AP")
          ],
          [
            buildCoordinateSystemValue("Pitch"),
            buildCoordinateSystemValue("Yaw"),
            buildCoordinateSystemValue("Roll")
          ]
        )
      ]
    });
  }

  it("enabling a node clears every other node's surface flag", () => {
    const coordinateSystem = makeTwoNodeChain();

    setCoordinateSystemSurfaceNode(coordinateSystem, 1, true);

    expect(coordinateSystem.chain.map(node => node.onSurface)).toEqual([
      false,
      true
    ]);
  });

  it("disabling a node clears only that node", () => {
    const coordinateSystem = makeTwoNodeChain();

    setCoordinateSystemSurfaceNode(coordinateSystem, 1, false);

    expect(coordinateSystem.chain.map(node => node.onSurface)).toEqual([
      true,
      false
    ]);
  });
});

describe("buildCoordinateSystemValue", () => {
  it("defaults to unbounded, unfixed, zero", () => {
    expect(buildCoordinateSystemValue("ML")).toEqual({
      name: "ML",
      value: 0,
      fixed: false,
      bounds: null
    });
  });

  it("carries an explicit bounds and value", () => {
    expect(buildCoordinateSystemValue("Depth", [-7.5, 7.5], 20)).toEqual({
      name: "Depth",
      value: 20,
      fixed: false,
      bounds: [-7.5, 7.5]
    });
  });
});

describe("buildFixedCoordinateSystemValue", () => {
  it("defaults to an unnamed, unbounded, zero value", () => {
    expect(buildFixedCoordinateSystemValue()).toEqual({
      name: "",
      value: 0,
      fixed: true,
      bounds: null
    });
  });

  it("carries an explicit name and value", () => {
    expect(buildFixedCoordinateSystemValue("Radius", 20)).toEqual({
      name: "Radius",
      value: 20,
      fixed: true,
      bounds: null
    });
  });
});

describe("buildCoordinateSystemNode", () => {
  it("defaults both display orders to identity and passes through the values", () => {
    const position = [
      buildCoordinateSystemValue("ML"),
      buildCoordinateSystemValue("DV"),
      buildCoordinateSystemValue("AP")
    ] satisfies Parameters<typeof buildCoordinateSystemNode>[1];
    const rotation = [
      buildCoordinateSystemValue("Pitch"),
      buildCoordinateSystemValue("Yaw"),
      buildCoordinateSystemValue("Roll")
    ] satisfies Parameters<typeof buildCoordinateSystemNode>[2];

    const node = buildCoordinateSystemNode("Tip", position, rotation);

    expect(node.position).toBe(position);
    expect(node.rotation).toBe(rotation);
    expect(node.positionDisplayOrder).toEqual([0, 1, 2]);
    expect(node.rotationDisplayOrder).toEqual([0, 1, 2]);
  });

  it("preserves an explicit display order", () => {
    const node = buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML"),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ],
      [2, 0, 1]
    );

    expect(node.positionDisplayOrder).toEqual([2, 0, 1]);
    expect(node.rotationDisplayOrder).toEqual([0, 1, 2]);
  });
});

describe("buildCoordinateSystem", () => {
  it("carries the given name, empty chain, and inspectable kind", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", []);

    expect(coordinateSystem.inspectableKind).toBe("coordinateSystem");
    expect(coordinateSystem.name).toBe("CCF");
    expect(coordinateSystem.chain).toEqual([]);
    expect(coordinateSystem.offsetByReferenceCoordinate).toBe(false);
  });

  it("carries an explicit offsetByReferenceCoordinate", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", [], true);

    expect(coordinateSystem.offsetByReferenceCoordinate).toBe(true);
  });

  it("assigns a fresh id on every call", () => {
    expect(buildCoordinateSystem("CCF", []).id).not.toBe(
      buildCoordinateSystem("CCF", []).id
    );
  });
});

describe("isCoordinateSystem", () => {
  function makeNode(
    position: [
      CoordinateSystemValue,
      CoordinateSystemValue,
      CoordinateSystemValue
    ] = [
      buildCoordinateSystemValue("ML"),
      buildCoordinateSystemValue("DV"),
      buildCoordinateSystemValue("AP")
    ],
    positionDisplayOrder: [number, number, number] = [0, 1, 2]
  ) {
    return buildCoordinateSystemNode(
      "Tip",
      position,
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ],
      positionDisplayOrder
    );
  }

  it("accepts a buildCoordinateSystem result", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", [makeNode()]);

    expect(isCoordinateSystem(coordinateSystem)).toBe(true);
  });

  it("rejects a wrong inspectableKind", () => {
    const coordinateSystem = {
      ...buildCoordinateSystem("CCF", [makeNode()]),
      inspectableKind: "probe"
    };

    expect(isCoordinateSystem(coordinateSystem)).toBe(false);
  });

  it("rejects a non-permutation display order", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", [
      makeNode(undefined, [0, 0, 1])
    ]);

    expect(isCoordinateSystem(coordinateSystem)).toBe(false);
  });

  it("rejects a non-finite value", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", [
      makeNode([
        { ...buildCoordinateSystemValue("ML"), value: NaN },
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ])
    ]);

    expect(isCoordinateSystem(coordinateSystem)).toBe(false);
  });

  it("rejects a bounds array of length 3", () => {
    const coordinateSystem = buildCoordinateSystem("CCF", [
      makeNode([
        {
          ...buildCoordinateSystemValue("ML"),
          bounds: [0, 1, 2] as unknown as [number, number]
        },
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ])
    ]);

    expect(isCoordinateSystem(coordinateSystem)).toBe(false);
  });

  it("rejects an id that could pollute a prototype chain", () => {
    const coordinateSystem = {
      ...buildCoordinateSystem("CCF", [makeNode()]),
      id: "__proto__"
    };

    expect(isCoordinateSystem(coordinateSystem)).toBe(false);
  });
});

describe("getCoordinateSystemValueAxis", () => {
  function makeNode() {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML"),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ]
    );
  }

  it("returns the axis a value index resolves to under the default order", () => {
    const node = makeNode();

    expect(getCoordinateSystemValueAxis(node, "position", 1)).toBe(1);
  });

  it("returns the axis a value index resolves to under a permuted order", () => {
    const node = makeNode();
    node.positionDisplayOrder = [2, 0, 1];

    expect(getCoordinateSystemValueAxis(node, "position", 2)).toBe(0);
  });
});

describe("setCoordinateSystemValueAxis", () => {
  function makeNode() {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML"),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ]
    );
  }

  it("swaps the value onto the target axis with whichever value held it", () => {
    const node = makeNode();

    setCoordinateSystemValueAxis(node, "position", 1, 0);

    expect(node.positionDisplayOrder).toEqual([1, 0, 2]);
    expect(new Set(node.positionDisplayOrder).size).toBe(3);
  });

  it("is a no-op when the value already owns the target axis", () => {
    const node = makeNode();

    setCoordinateSystemValueAxis(node, "position", 0, 0);

    expect(node.positionDisplayOrder).toEqual([0, 1, 2]);
  });

  it("leaves the other component's display order untouched", () => {
    const node = makeNode();

    setCoordinateSystemValueAxis(node, "position", 1, 0);

    expect(node.rotationDisplayOrder).toEqual([0, 1, 2]);
  });
});

describe("reorderCoordinateSystemValue", () => {
  function makeNode() {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML"),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ]
    );
  }

  it("moves a value while keeping every axis mapped to the same value", () => {
    const node = makeNode();
    const nameByAxisBefore = [0, 1, 2].map(
      axis => node.position[node.positionDisplayOrder[axis]!]!.name
    );

    reorderCoordinateSystemValue(node, "position", 0, 2);

    expect(node.position.map(value => value.name)).toEqual(["DV", "AP", "ML"]);
    expect(node.positionDisplayOrder).toEqual([2, 0, 1]);
    const nameByAxisAfter = [0, 1, 2].map(
      axis => node.position[node.positionDisplayOrder[axis]!]!.name
    );
    expect(nameByAxisAfter).toEqual(nameByAxisBefore);
  });

  it("is a no-op when fromIndex equals toIndex", () => {
    const node = makeNode();

    reorderCoordinateSystemValue(node, "position", 1, 1);

    expect(node.position.map(value => value.name)).toEqual(["ML", "DV", "AP"]);
    expect(node.positionDisplayOrder).toEqual([0, 1, 2]);
  });

  it("is a no-op for an out-of-range index", () => {
    const node = makeNode();

    reorderCoordinateSystemValue(node, "position", 0, 3);
    reorderCoordinateSystemValue(node, "position", -1, 1);

    expect(node.position.map(value => value.name)).toEqual(["ML", "DV", "AP"]);
    expect(node.positionDisplayOrder).toEqual([0, 1, 2]);
  });

  it("re-maps a non-identity display order, keeping every axis mapped to the same value", () => {
    const node = makeNode();
    node.positionDisplayOrder = [2, 0, 1];
    const nameByAxisBefore = [0, 1, 2].map(
      axis => node.position[node.positionDisplayOrder[axis]!]!.name
    );

    reorderCoordinateSystemValue(node, "position", 0, 2);

    expect(node.positionDisplayOrder).toEqual([1, 2, 0]);
    const nameByAxisAfter = [0, 1, 2].map(
      axis => node.position[node.positionDisplayOrder[axis]!]!.name
    );
    expect(nameByAxisAfter).toEqual(nameByAxisBefore);
  });
});

describe("setCoordinateSystemValueFixed", () => {
  it("fixes a bounded value and clears its bounds", () => {
    const value = buildCoordinateSystemValue("Depth", [-7.5, 7.5], 3);

    setCoordinateSystemValueFixed(value, true);

    expect(value.fixed).toBe(true);
    expect(value.bounds).toBeNull();
  });

  it("unfixes a value and leaves its bounds null", () => {
    const value = buildFixedCoordinateSystemValue("Radius", 20);

    setCoordinateSystemValueFixed(value, false);

    expect(value.fixed).toBe(false);
    expect(value.bounds).toBeNull();
  });
});

describe("setCoordinateSystemValueBounded", () => {
  it("bounds a zero value with a range bracketing it", () => {
    const value = buildCoordinateSystemValue("ML");

    setCoordinateSystemValueBounded(value, true);

    expect(value.bounds).toEqual([-1, 1]);
  });

  it("bounds a non-zero value with a range bracketing it", () => {
    const value = buildCoordinateSystemValue("ML", null, 5);

    setCoordinateSystemValueBounded(value, true);

    expect(value.bounds).toEqual([4, 6]);
  });

  it("unbounds a bounded value", () => {
    const value = buildCoordinateSystemValue("Depth", [-7.5, 7.5], 3);

    setCoordinateSystemValueBounded(value, false);

    expect(value.bounds).toBeNull();
  });
});

describe("getCoordinateSystemAxisValue", () => {
  function makeNode() {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML", null, 1),
        buildCoordinateSystemValue("DV", null, 2),
        buildCoordinateSystemValue("AP", null, 3)
      ],
      [
        buildCoordinateSystemValue("Pitch", null, 0.1),
        buildCoordinateSystemValue("Yaw", null, 0.2),
        buildCoordinateSystemValue("Roll", null, 0.3)
      ],
      [2, 0, 1]
    );
  }

  it("reads the value mapped onto the given axis under a non-identity order", () => {
    const node = makeNode();

    // positionDisplayOrder [2, 0, 1]: axis 0 <- value 2 (AP=3), axis 1 <- value 0 (ML=1),
    // axis 2 <- value 1 (DV=2).
    expect(getCoordinateSystemAxisValue(node, "position", 0)).toBe(3);
    expect(getCoordinateSystemAxisValue(node, "position", 1)).toBe(1);
    expect(getCoordinateSystemAxisValue(node, "position", 2)).toBe(2);
  });

  it("reads the value mapped onto the given axis under the default rotation order", () => {
    const node = makeNode();

    expect(getCoordinateSystemAxisValue(node, "rotation", 0)).toBeCloseTo(0.1);
    expect(getCoordinateSystemAxisValue(node, "rotation", 1)).toBeCloseTo(0.2);
    expect(getCoordinateSystemAxisValue(node, "rotation", 2)).toBeCloseTo(0.3);
  });
});

describe("setCoordinateSystemAxisValue", () => {
  function makeNode() {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML", null, 1),
        buildCoordinateSystemValue("DV", null, 2),
        buildCoordinateSystemValue("AP", null, 3)
      ],
      [
        buildCoordinateSystemValue("Pitch"),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ],
      [2, 0, 1]
    );
  }

  it("writes the value mapped onto the given axis under a non-identity order", () => {
    const node = makeNode();

    setCoordinateSystemAxisValue(node, "position", 0, 100);

    // Axis 0 maps to value index 2 (AP) under order [2, 0, 1].
    expect(node.position[2]!.value).toBe(100);
    expect(node.position[0]!.value).toBe(1);
    expect(node.position[1]!.value).toBe(2);
    expect(getCoordinateSystemAxisValue(node, "position", 0)).toBe(100);
  });
});

describe("applyCoordinateSystemChainValues", () => {
  function makeNode(mlValue: number, pitchValue: number) {
    return buildCoordinateSystemNode(
      "Tip",
      [
        buildCoordinateSystemValue("ML", null, mlValue),
        buildCoordinateSystemValue("DV"),
        buildCoordinateSystemValue("AP")
      ],
      [
        buildCoordinateSystemValue("Pitch", null, pitchValue),
        buildCoordinateSystemValue("Yaw"),
        buildCoordinateSystemValue("Roll")
      ]
    );
  }

  it("copies every node's position and rotation values in place, keeping node identity", () => {
    const chain = [makeNode(0, 0), makeNode(0, 0)];
    const solved = [makeNode(1, 0.5), makeNode(2, 0.75)];
    const [firstNode, secondNode] = chain;

    applyCoordinateSystemChainValues(chain, solved);

    expect(chain[0]).toBe(firstNode);
    expect(chain[1]).toBe(secondNode);
    expect(chain[0]!.position[0]!.value).toBe(1);
    expect(chain[0]!.rotation[0]!.value).toBe(0.5);
    expect(chain[1]!.position[0]!.value).toBe(2);
    expect(chain[1]!.rotation[0]!.value).toBe(0.75);
  });

  it("stops early without throwing when the solved chain is shorter than the chain", () => {
    const chain = [makeNode(0, 0), makeNode(0, 0)];
    const solved = [makeNode(9, 1.5)];

    expect(() => applyCoordinateSystemChainValues(chain, solved)).not.toThrow();
    expect(chain[0]!.position[0]!.value).toBe(9);
    expect(chain[1]!.position[0]!.value).toBe(0);
  });
});
