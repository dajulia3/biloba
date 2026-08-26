// Original file: ../protocol/biloba/v1/driver.proto

export const LocatorKind = {
  LOCATOR_KIND_UNSPECIFIED: 0,
  CSS: 1,
  TEST_ID: 2,
  TEXT: 3,
  ROLE: 4,
} as const;

export type LocatorKind =
  | 'LOCATOR_KIND_UNSPECIFIED'
  | 0
  | 'CSS'
  | 1
  | 'TEST_ID'
  | 2
  | 'TEXT'
  | 3
  | 'ROLE'
  | 4

export type LocatorKind__Output = typeof LocatorKind[keyof typeof LocatorKind]
