// Original file: ../protocol/biloba/v1/driver.proto

import type { Locator as _biloba_v1_Locator, Locator__Output as _biloba_v1_Locator__Output } from '../../biloba/v1/Locator';
import type { PollPolicy as _biloba_v1_PollPolicy, PollPolicy__Output as _biloba_v1_PollPolicy__Output } from '../../biloba/v1/PollPolicy';

export interface ClickRequest {
  'sessionId'?: (string);
  'locator'?: (_biloba_v1_Locator | null);
  'poll'?: (_biloba_v1_PollPolicy | null);
}

export interface ClickRequest__Output {
  'sessionId'?: (string);
  'locator'?: (_biloba_v1_Locator__Output);
  'poll'?: (_biloba_v1_PollPolicy__Output);
}
