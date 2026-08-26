// Original file: ../protocol/biloba/v1/driver.proto

export const MatchMode = {
  MATCH_MODE_UNSPECIFIED: 0,
  EXACT: 1,
  CONTAINS: 2,
} as const;

export type MatchMode =
  | 'MATCH_MODE_UNSPECIFIED'
  | 0
  | 'EXACT'
  | 1
  | 'CONTAINS'
  | 2

export type MatchMode__Output = typeof MatchMode[keyof typeof MatchMode]
