import { markRaw, toRaw } from "vue";
import type { Probe } from "../models/probe.model";
import type { ProbeVisibility } from "../models/visibility.model";
import type { ProbeInterfaceProbe } from "../models/probe-interface.model";
import {
  KNOWN_MANUFACTURERS,
  KNOWN_PROBES
} from "../models/known-probes.model";
import { STANDARD_COLORS } from "@/features/scene";

/** Every valid probe visibility, for validating untrusted probe data. */
const PROBE_VISIBILITIES: ProbeVisibility[] = ["visible", "shanks", "hidden"];

/** `#RRGGBB`, the only form `Color3.FromHexString` renders correctly. */
const PROBE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Build a probe referencing the given probe interface definition, with a
 * random name and color, a zeroed position, and a pitch pointing inferiorly.
 * @param probeInterfaceProbe Probe interface definition for the probe.
 */
export function buildProbe(probeInterfaceProbe: ProbeInterfaceProbe): Probe {
  const uuid = crypto.randomUUID();
  const uniqueName = uuid.slice(0, 8);
  return {
    inspectableKind: "probe",
    id: uuid,
    name: `Probe ${uniqueName}`,
    color: STANDARD_COLORS[Math.floor(Math.random() * STANDARD_COLORS.length)]!,
    visibility: "visible",
    probeInterfaceIdentifier: getProbeInterfaceIdentifier(probeInterfaceProbe),
    tipPosition: [0, 0, 0],
    rotation: [0, 0, Math.PI / 2],
    // Null rather than a fixed value - the slice view resolves this
    // proportionally to whichever atlas is current
    // (`getDefaultSliceExtentMillimeters`), since a single constant can't
    // fit both a mouse and a human atlas.
    sliceExtentMillimeters: null,
    sliceCenterHeightMillimeters: 0
  };
}

/**
 * Detach a probe interface definition from Vue's reactivity, so it can be
 * interned into experiment state without being deep-watched.
 * @param probeInterfaceProbe Probe interface definition to detach.
 */
export function detachProbeInterfaceProbe(
  probeInterfaceProbe: ProbeInterfaceProbe
): ProbeInterfaceProbe {
  return markRaw(structuredClone(toRaw(probeInterfaceProbe)));
}

/**
 * Detach every probe interface definition in a record from Vue's reactivity,
 * in place.
 * @param probeInterfaceProbes Record of probe interface definitions to detach.
 */
export function detachProbeInterfaceProbes(
  probeInterfaceProbes: Record<string, ProbeInterfaceProbe>
) {
  for (const [identifier, definition] of Object.entries(probeInterfaceProbes)) {
    probeInterfaceProbes[identifier] = detachProbeInterfaceProbe(definition);
  }
}

/**
 * Toggle a probe's visibility through visible -> shanks -> hidden -> visible.
 * @param probe Probe to change the visibility of.
 */
export function rotateProbeVisibility(probe: Probe) {
  switch (probe.visibility) {
    case "visible":
      probe.visibility = "shanks";
      break;
    case "shanks":
      probe.visibility = "hidden";
      break;
    case "hidden":
      probe.visibility = "visible";
      break;
    default:
      probe.visibility = "hidden";
      break;
  }
}

/**
 * Return the probe's manufacturer and model name as a single identifier string.
 * @param probeInterfaceProbe Probe interface definition to extract identifier from.
 */
export function getProbeInterfaceIdentifier(
  probeInterfaceProbe: ProbeInterfaceProbe
): string {
  return `${String(probeInterfaceProbe.annotations!.manufacturer)} ${String(probeInterfaceProbe.annotations!.model_name)}`;
}

/**
 * Find a probe interface definition in a library by its identifier, or null
 * if none match.
 * @param library Probe interface definitions to search.
 * @param identifier Identifier to match, as produced by {@link getProbeInterfaceIdentifier}.
 */
export function findProbeInterfaceProbeByIdentifier(
  library: ProbeInterfaceProbe[],
  identifier: string
): ProbeInterfaceProbe | null {
  return (
    library.find(
      probeInterfaceProbe =>
        getProbeInterfaceIdentifier(probeInterfaceProbe) === identifier
    ) ?? null
  );
}

/**
 * Return a probe's human-readable manufacturer and model name for display,
 * e.g. `IMEC Neuropixels 1.0 probe (NP1000)`.
 * @param probeInterfaceProbe Probe interface definition to describe.
 */
export function getProbeInterfaceDisplayName(
  probeInterfaceProbe: ProbeInterfaceProbe
): string {
  const manufacturerName = String(
    probeInterfaceProbe.annotations!.manufacturer
  );
  const modelName = String(probeInterfaceProbe.annotations!.model_name);

  return `${getManufacturerDisplayName(manufacturerName)} ${getProbeModelDisplayName(manufacturerName, modelName)}`;
}

/**
 * Return a manufacturer's proper noun for display, falling back to the raw
 * manufacturer name when unknown.
 * @param manufacturerName Manufacturer name, e.g. `cambridgeneurotech`.
 */
export function getManufacturerDisplayName(manufacturerName: string): string {
  return KNOWN_MANUFACTURERS[manufacturerName] ?? manufacturerName;
}

/**
 * Return a probe model's human-readable description for display, falling
 * back to the raw model name when unknown.
 * @param manufacturerName Manufacturer the model belongs to.
 * @param modelName Probe model name, e.g. `NP1000`.
 */
export function getProbeModelDisplayName(
  manufacturerName: string,
  modelName: string
): string {
  return KNOWN_PROBES[`${manufacturerName} ${modelName}`]?.trim() ?? modelName;
}

/**
 * Check that a value has the minimal shape of a ProbeInterface probe,
 * including the annotations `getProbeInterfaceIdentifier` assumes are present.
 * @param value Value to check.
 */
export function isProbeInterfaceProbe(
  value: unknown
): value is ProbeInterfaceProbe {
  if (!isRecord(value)) return false;

  if (
    typeof value.ndim !== "number" ||
    typeof value.si_units !== "string" ||
    !Array.isArray(value.contact_positions)
  ) {
    return false;
  }

  if (!isRecord(value.annotations)) return false;

  return (
    typeof value.annotations.model_name === "string" &&
    typeof value.annotations.manufacturer === "string"
  );
}

/**
 * Check that a value has the shape of a `Probe`.
 * @param value Value to check.
 */
export function isProbe(value: unknown): value is Probe {
  if (!isRecord(value)) return false;

  return (
    value.inspectableKind === "probe" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    PROBE_COLOR_PATTERN.test(value.color) &&
    typeof value.visibility === "string" &&
    PROBE_VISIBILITIES.includes(value.visibility as ProbeVisibility) &&
    typeof value.probeInterfaceIdentifier === "string" &&
    isFiniteTriple(value.tipPosition) &&
    isFiniteTriple(value.rotation) &&
    (value.sliceExtentMillimeters === null ||
      (typeof value.sliceExtentMillimeters === "number" &&
        Number.isFinite(value.sliceExtentMillimeters))) &&
    typeof value.sliceCenterHeightMillimeters === "number" &&
    Number.isFinite(value.sliceCenterHeightMillimeters)
  );
}

/**
 * Check that a value is a plain object (not an array or null).
 * @param value Value to check.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Check that a value is a tuple of three finite numbers.
 * @param value Value to check.
 */
function isFiniteTriple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      component => typeof component === "number" && Number.isFinite(component)
    )
  );
}
