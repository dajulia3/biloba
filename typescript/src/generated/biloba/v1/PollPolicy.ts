// Original file: ../protocol/biloba/v1/driver.proto

import type { Long } from '@grpc/proto-loader';

export interface PollPolicy {
  'timeoutMs'?: (number | string | Long);
  'intervalMs'?: (number | string | Long);
}

export interface PollPolicy__Output {
  'timeoutMs'?: (Long);
  'intervalMs'?: (Long);
}
