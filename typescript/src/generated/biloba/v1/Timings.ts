// Original file: ../protocol/biloba/v1/driver.proto

import type { Long } from '@grpc/proto-loader';

export interface Timings {
  'startedUnixMs'?: (number | string | Long);
  'elapsedMs'?: (number | string | Long);
}

export interface Timings__Output {
  'startedUnixMs'?: (Long);
  'elapsedMs'?: (Long);
}
