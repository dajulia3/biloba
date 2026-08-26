// Original file: ../protocol/biloba/v1/driver.proto

import type { PollObservation as _biloba_v1_PollObservation, PollObservation__Output as _biloba_v1_PollObservation__Output } from '../../biloba/v1/PollObservation';
import type { Timings as _biloba_v1_Timings, Timings__Output as _biloba_v1_Timings__Output } from '../../biloba/v1/Timings';
import type { Diagnostics as _biloba_v1_Diagnostics, Diagnostics__Output as _biloba_v1_Diagnostics__Output } from '../../biloba/v1/Diagnostics';

export interface OperationResult {
  'matched'?: (boolean);
  'observedJson'?: (string);
  'attemptCount'?: (number);
  'trajectory'?: (_biloba_v1_PollObservation)[];
  'timings'?: (_biloba_v1_Timings | null);
  'diagnostics'?: (_biloba_v1_Diagnostics | null);
  'rpcRequestCount'?: (number);
  'rpcResponseCount'?: (number);
}

export interface OperationResult__Output {
  'matched'?: (boolean);
  'observedJson'?: (string);
  'attemptCount'?: (number);
  'trajectory'?: (_biloba_v1_PollObservation__Output)[];
  'timings'?: (_biloba_v1_Timings__Output);
  'diagnostics'?: (_biloba_v1_Diagnostics__Output);
  'rpcRequestCount'?: (number);
  'rpcResponseCount'?: (number);
}
