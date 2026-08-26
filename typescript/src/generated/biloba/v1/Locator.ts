// Original file: ../protocol/biloba/v1/driver.proto

import type { LocatorKind as _biloba_v1_LocatorKind, LocatorKind__Output as _biloba_v1_LocatorKind__Output } from '../../biloba/v1/LocatorKind';
import type { MatchMode as _biloba_v1_MatchMode, MatchMode__Output as _biloba_v1_MatchMode__Output } from '../../biloba/v1/MatchMode';

export interface Locator {
  'kind'?: (_biloba_v1_LocatorKind);
  'value'?: (string);
  'role'?: (string);
  'name'?: (string);
  'match'?: (_biloba_v1_MatchMode);
  'first'?: (boolean);
}

export interface Locator__Output {
  'kind'?: (_biloba_v1_LocatorKind__Output);
  'value'?: (string);
  'role'?: (string);
  'name'?: (string);
  'match'?: (_biloba_v1_MatchMode__Output);
  'first'?: (boolean);
}
