// Shared boundary types; existing JS remains the runtime validation authority.
import { createWorldLoadRequest } from '../app/js/earth-core/world-load-request.js';

export type WorldLoadRequest = NonNullable<ReturnType<typeof createWorldLoadRequest>>;
export interface LocationSelection {
  readonly key: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

export function requestLocation(selection: LocationSelection, sequence: number): WorldLoadRequest | null {
  return createWorldLoadRequest(selection, sequence);
}

// Distinct coordinate frames prevent accidentally passing local metres to a geographic API.
export interface GeographicLocation { readonly frame: 'wgs84'; readonly lat: number; readonly lon: number }
export interface LocalPosition { readonly frame: 'earth-local'; readonly x: number; readonly y: number; readonly z: number }

// Projection of existing provenance statuses, not a replacement provenance compiler.
export type ProvenanceValue<T> =
  | Readonly<{ status: 'mapped'; value: T; sourceFeatureId: string; tag: string }>
  | Readonly<{ status: 'inferred'; value: T; sourceFeatureId: string; method: string }>
  | Readonly<{ status: 'absent'; value: null; sourceFeatureId: string }>;

export function sourceLabel(value: ProvenanceValue<number>): string {
  if (value.status === 'mapped') return value.tag;
  if (value.status === 'inferred') return value.method;
  return 'unavailable';
}
