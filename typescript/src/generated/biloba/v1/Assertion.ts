// Original file: ../protocol/biloba/v1/driver.proto

import type { Locator as _biloba_v1_Locator, Locator__Output as _biloba_v1_Locator__Output } from '../../biloba/v1/Locator';
import type { MatchMode as _biloba_v1_MatchMode, MatchMode__Output as _biloba_v1_MatchMode__Output } from '../../biloba/v1/MatchMode';
import type { Long } from '@grpc/proto-loader';

// Original file: ../protocol/biloba/v1/driver.proto

export const _biloba_v1_Assertion_Kind = {
  KIND_UNSPECIFIED: 0,
  VISIBLE: 1,
  TEXT: 2,
  COUNT: 3,
  ATTRIBUTE: 4,
  VALUE: 5,
  URL: 6,
  EVALUATE: 7,
} as const;

export type _biloba_v1_Assertion_Kind =
  | 'KIND_UNSPECIFIED'
  | 0
  | 'VISIBLE'
  | 1
  | 'TEXT'
  | 2
  | 'COUNT'
  | 3
  | 'ATTRIBUTE'
  | 4
  | 'VALUE'
  | 5
  | 'URL'
  | 6
  | 'EVALUATE'
  | 7

export type _biloba_v1_Assertion_Kind__Output = typeof _biloba_v1_Assertion_Kind[keyof typeof _biloba_v1_Assertion_Kind]

export interface Assertion {
  'kind'?: (_biloba_v1_Assertion_Kind);
  'locator'?: (_biloba_v1_Locator | null);
  'attribute'?: (string);
  'expression'?: (string);
  'expectedString'?: (string);
  'expectedCount'?: (number | string | Long);
  'expectedJson'?: (string);
  'match'?: (_biloba_v1_MatchMode);
}

export interface Assertion__Output {
  'kind'?: (_biloba_v1_Assertion_Kind__Output);
  'locator'?: (_biloba_v1_Locator__Output);
  'attribute'?: (string);
  'expression'?: (string);
  'expectedString'?: (string);
  'expectedCount'?: (Long);
  'expectedJson'?: (string);
  'match'?: (_biloba_v1_MatchMode__Output);
}
