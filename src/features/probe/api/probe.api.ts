import { markRaw, toRaw } from "vue";
import type { Probe } from "../models/probe.model";
import type { ProbeInterfaceProbe } from "../models/probe-interface.model";
import {
  KNOWN_MANUFACTURERS,
  KNOWN_PROBES
} from "../models/known-probes.model";
import { STANDARD_COLORS } from "@/features/scene";

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
    rotation: [0, 0, Math.PI / 2]
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
