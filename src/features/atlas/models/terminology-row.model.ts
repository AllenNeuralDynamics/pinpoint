export interface TerminologyRow {
  identifier: number;
  parent_identifier: number | null;
  annotation_value: number;
  name: string;
  abbreviation: string;
  color_hex_triplet: string;
}
