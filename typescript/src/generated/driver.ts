import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { BilobaDriverClient as _biloba_v1_BilobaDriverClient, BilobaDriverDefinition as _biloba_v1_BilobaDriverDefinition } from './biloba/v1/BilobaDriver';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  biloba: {
    v1: {
      AssertRequest: MessageTypeDefinition
      Assertion: MessageTypeDefinition
      BilobaDriver: SubtypeConstructor<typeof grpc.Client, _biloba_v1_BilobaDriverClient> & { service: _biloba_v1_BilobaDriverDefinition }
      ClickRequest: MessageTypeDefinition
      CloseSessionRequest: MessageTypeDefinition
      Cookie: MessageTypeDefinition
      Diagnostics: MessageTypeDefinition
      Empty: MessageTypeDefinition
      EvaluateRequest: MessageTypeDefinition
      HandshakeRequest: MessageTypeDefinition
      HandshakeResponse: MessageTypeDefinition
      Locator: MessageTypeDefinition
      LocatorKind: EnumTypeDefinition
      MatchMode: EnumTypeDefinition
      NavigateRequest: MessageTypeDefinition
      OpenSessionRequest: MessageTypeDefinition
      OpenSessionResponse: MessageTypeDefinition
      OperationResult: MessageTypeDefinition
      PollObservation: MessageTypeDefinition
      PollPolicy: MessageTypeDefinition
      PrepareSessionRequest: MessageTypeDefinition
      SetCookiesRequest: MessageTypeDefinition
      SetValueRequest: MessageTypeDefinition
      Timings: MessageTypeDefinition
    }
  }
}

