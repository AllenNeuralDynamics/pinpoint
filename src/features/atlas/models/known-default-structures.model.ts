/**
 * Default structures for atlases built on the Allen Mouse CCF terminology,
 * which share its identifiers.
 */
const ALLEN_CCF_STRUCTURES = [
  184, 500, 453, 1057, 677, 247, 669, 31, 972, 44, 714, 95, 254, 22, 541, 922,
  698, 895, 1089, 703, 623, 343, 512
];

export const KNOWN_DEFAULT_STRUCTURES: Record<string, number[]> = {
  allen_mouse: ALLEN_CCF_STRUCTURES,
  whs_sd_rat: [
    1034, 1096, 1084, 1038, 1081, 1097, 1048, 1057, 1061, 1055, 1059, 1069,
    1056, 1065, 1072, 1020, 1047, 58, 1044, 74, 1046, 56, 1045, 75, 1043
  ],
  princeton_mouse: ALLEN_CCF_STRUCTURES,
  allen_human: [
    10467, 10465, 10390, 10331, 10159, 12113, 12176, 12155, 12148, 12131, 12139,
    12179, 10595, 10557, 10654, 10669, 10668, 10649, 10651, 10650
  ],
  azba_zfish: [9999],
  prairie_vole: [343, 512, 623, 688],
  sju_cavefish_2um: [
    8, 21, 26, 7, 17, 24, 9, 2, 5, 10, 13, 1, 11, 3, 4, 19, 6, 15, 14, 16, 18,
    25, 22, 23, 27, 20
  ],
  unam_axolotl: [105, 106, 104, 102, 101, 103],
  allen_mouse_bluebrain_barrels: ALLEN_CCF_STRUCTURES,
  qiu2018_mouse: ALLEN_CCF_STRUCTURES
};
