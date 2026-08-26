// Original file: ../protocol/biloba/v1/driver.proto

import type { Cookie as _biloba_v1_Cookie, Cookie__Output as _biloba_v1_Cookie__Output } from '../../biloba/v1/Cookie';

export interface SetCookiesRequest {
  'sessionId'?: (string);
  'cookies'?: (_biloba_v1_Cookie)[];
}

export interface SetCookiesRequest__Output {
  'sessionId'?: (string);
  'cookies'?: (_biloba_v1_Cookie__Output)[];
}
