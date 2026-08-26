// Original file: ../protocol/biloba/v1/driver.proto

import type { Long } from '@grpc/proto-loader';

export interface PollObservation {
  'attempt'?: (number);
  'elapsedMs'?: (number | string | Long);
  'observedJson'?: (string);
  'retryReason'?: (string);
}

export interface PollObservation__Output {
  'attempt'?: (number);
  'elapsedMs'?: (Long);
  'observedJson'?: (string);
  'retryReason'?: (string);
}
