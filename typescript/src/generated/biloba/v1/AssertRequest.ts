// Original file: ../protocol/biloba/v1/driver.proto

import type { Assertion as _biloba_v1_Assertion, Assertion__Output as _biloba_v1_Assertion__Output } from '../../biloba/v1/Assertion';
import type { PollPolicy as _biloba_v1_PollPolicy, PollPolicy__Output as _biloba_v1_PollPolicy__Output } from '../../biloba/v1/PollPolicy';

export interface AssertRequest {
  'sessionId'?: (string);
  'assertion'?: (_biloba_v1_Assertion | null);
  'poll'?: (_biloba_v1_PollPolicy | null);
}

export interface AssertRequest__Output {
  'sessionId'?: (string);
  'assertion'?: (_biloba_v1_Assertion__Output);
  'poll'?: (_biloba_v1_PollPolicy__Output);
}
