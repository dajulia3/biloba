// Original file: ../protocol/biloba/v1/driver.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { AssertRequest as _biloba_v1_AssertRequest, AssertRequest__Output as _biloba_v1_AssertRequest__Output } from '../../biloba/v1/AssertRequest';
import type { ClickRequest as _biloba_v1_ClickRequest, ClickRequest__Output as _biloba_v1_ClickRequest__Output } from '../../biloba/v1/ClickRequest';
import type { CloseSessionRequest as _biloba_v1_CloseSessionRequest, CloseSessionRequest__Output as _biloba_v1_CloseSessionRequest__Output } from '../../biloba/v1/CloseSessionRequest';
import type { Empty as _biloba_v1_Empty, Empty__Output as _biloba_v1_Empty__Output } from '../../biloba/v1/Empty';
import type { EvaluateRequest as _biloba_v1_EvaluateRequest, EvaluateRequest__Output as _biloba_v1_EvaluateRequest__Output } from '../../biloba/v1/EvaluateRequest';
import type { HandshakeRequest as _biloba_v1_HandshakeRequest, HandshakeRequest__Output as _biloba_v1_HandshakeRequest__Output } from '../../biloba/v1/HandshakeRequest';
import type { HandshakeResponse as _biloba_v1_HandshakeResponse, HandshakeResponse__Output as _biloba_v1_HandshakeResponse__Output } from '../../biloba/v1/HandshakeResponse';
import type { NavigateRequest as _biloba_v1_NavigateRequest, NavigateRequest__Output as _biloba_v1_NavigateRequest__Output } from '../../biloba/v1/NavigateRequest';
import type { OpenSessionRequest as _biloba_v1_OpenSessionRequest, OpenSessionRequest__Output as _biloba_v1_OpenSessionRequest__Output } from '../../biloba/v1/OpenSessionRequest';
import type { OpenSessionResponse as _biloba_v1_OpenSessionResponse, OpenSessionResponse__Output as _biloba_v1_OpenSessionResponse__Output } from '../../biloba/v1/OpenSessionResponse';
import type { OperationResult as _biloba_v1_OperationResult, OperationResult__Output as _biloba_v1_OperationResult__Output } from '../../biloba/v1/OperationResult';
import type { PrepareSessionRequest as _biloba_v1_PrepareSessionRequest, PrepareSessionRequest__Output as _biloba_v1_PrepareSessionRequest__Output } from '../../biloba/v1/PrepareSessionRequest';
import type { SetCookiesRequest as _biloba_v1_SetCookiesRequest, SetCookiesRequest__Output as _biloba_v1_SetCookiesRequest__Output } from '../../biloba/v1/SetCookiesRequest';
import type { SetValueRequest as _biloba_v1_SetValueRequest, SetValueRequest__Output as _biloba_v1_SetValueRequest__Output } from '../../biloba/v1/SetValueRequest';

export interface BilobaDriverClient extends grpc.Client {
  Assert(argument: _biloba_v1_AssertRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Assert(argument: _biloba_v1_AssertRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Assert(argument: _biloba_v1_AssertRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Assert(argument: _biloba_v1_AssertRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  assert(argument: _biloba_v1_AssertRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  assert(argument: _biloba_v1_AssertRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  assert(argument: _biloba_v1_AssertRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  assert(argument: _biloba_v1_AssertRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
  Click(argument: _biloba_v1_ClickRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Click(argument: _biloba_v1_ClickRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Click(argument: _biloba_v1_ClickRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Click(argument: _biloba_v1_ClickRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  click(argument: _biloba_v1_ClickRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  click(argument: _biloba_v1_ClickRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  click(argument: _biloba_v1_ClickRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  click(argument: _biloba_v1_ClickRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
  CloseSession(argument: _biloba_v1_CloseSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  CloseSession(argument: _biloba_v1_CloseSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  CloseSession(argument: _biloba_v1_CloseSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  CloseSession(argument: _biloba_v1_CloseSessionRequest, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  closeSession(argument: _biloba_v1_CloseSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  closeSession(argument: _biloba_v1_CloseSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  closeSession(argument: _biloba_v1_CloseSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  closeSession(argument: _biloba_v1_CloseSessionRequest, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  
  Evaluate(argument: _biloba_v1_EvaluateRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Evaluate(argument: _biloba_v1_EvaluateRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Evaluate(argument: _biloba_v1_EvaluateRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Evaluate(argument: _biloba_v1_EvaluateRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  evaluate(argument: _biloba_v1_EvaluateRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  evaluate(argument: _biloba_v1_EvaluateRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  evaluate(argument: _biloba_v1_EvaluateRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  evaluate(argument: _biloba_v1_EvaluateRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
  Handshake(argument: _biloba_v1_HandshakeRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  Handshake(argument: _biloba_v1_HandshakeRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  Handshake(argument: _biloba_v1_HandshakeRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  Handshake(argument: _biloba_v1_HandshakeRequest, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  handshake(argument: _biloba_v1_HandshakeRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  handshake(argument: _biloba_v1_HandshakeRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  handshake(argument: _biloba_v1_HandshakeRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  handshake(argument: _biloba_v1_HandshakeRequest, callback: grpc.requestCallback<_biloba_v1_HandshakeResponse__Output>): grpc.ClientUnaryCall;
  
  Navigate(argument: _biloba_v1_NavigateRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Navigate(argument: _biloba_v1_NavigateRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Navigate(argument: _biloba_v1_NavigateRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  Navigate(argument: _biloba_v1_NavigateRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  navigate(argument: _biloba_v1_NavigateRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  navigate(argument: _biloba_v1_NavigateRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  navigate(argument: _biloba_v1_NavigateRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  navigate(argument: _biloba_v1_NavigateRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
  OpenSession(argument: _biloba_v1_OpenSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  OpenSession(argument: _biloba_v1_OpenSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  OpenSession(argument: _biloba_v1_OpenSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  OpenSession(argument: _biloba_v1_OpenSessionRequest, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  openSession(argument: _biloba_v1_OpenSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  openSession(argument: _biloba_v1_OpenSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  openSession(argument: _biloba_v1_OpenSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  openSession(argument: _biloba_v1_OpenSessionRequest, callback: grpc.requestCallback<_biloba_v1_OpenSessionResponse__Output>): grpc.ClientUnaryCall;
  
  PrepareSession(argument: _biloba_v1_PrepareSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  PrepareSession(argument: _biloba_v1_PrepareSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  PrepareSession(argument: _biloba_v1_PrepareSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  PrepareSession(argument: _biloba_v1_PrepareSessionRequest, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  prepareSession(argument: _biloba_v1_PrepareSessionRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  prepareSession(argument: _biloba_v1_PrepareSessionRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  prepareSession(argument: _biloba_v1_PrepareSessionRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  prepareSession(argument: _biloba_v1_PrepareSessionRequest, callback: grpc.requestCallback<_biloba_v1_Empty__Output>): grpc.ClientUnaryCall;
  
  SetCookies(argument: _biloba_v1_SetCookiesRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetCookies(argument: _biloba_v1_SetCookiesRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetCookies(argument: _biloba_v1_SetCookiesRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetCookies(argument: _biloba_v1_SetCookiesRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setCookies(argument: _biloba_v1_SetCookiesRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setCookies(argument: _biloba_v1_SetCookiesRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setCookies(argument: _biloba_v1_SetCookiesRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setCookies(argument: _biloba_v1_SetCookiesRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
  SetValue(argument: _biloba_v1_SetValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetValue(argument: _biloba_v1_SetValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetValue(argument: _biloba_v1_SetValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  SetValue(argument: _biloba_v1_SetValueRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setValue(argument: _biloba_v1_SetValueRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setValue(argument: _biloba_v1_SetValueRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setValue(argument: _biloba_v1_SetValueRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  setValue(argument: _biloba_v1_SetValueRequest, callback: grpc.requestCallback<_biloba_v1_OperationResult__Output>): grpc.ClientUnaryCall;
  
}

export interface BilobaDriverHandlers extends grpc.UntypedServiceImplementation {
  Assert: grpc.handleUnaryCall<_biloba_v1_AssertRequest__Output, _biloba_v1_OperationResult>;
  
  Click: grpc.handleUnaryCall<_biloba_v1_ClickRequest__Output, _biloba_v1_OperationResult>;
  
  CloseSession: grpc.handleUnaryCall<_biloba_v1_CloseSessionRequest__Output, _biloba_v1_Empty>;
  
  Evaluate: grpc.handleUnaryCall<_biloba_v1_EvaluateRequest__Output, _biloba_v1_OperationResult>;
  
  Handshake: grpc.handleUnaryCall<_biloba_v1_HandshakeRequest__Output, _biloba_v1_HandshakeResponse>;
  
  Navigate: grpc.handleUnaryCall<_biloba_v1_NavigateRequest__Output, _biloba_v1_OperationResult>;
  
  OpenSession: grpc.handleUnaryCall<_biloba_v1_OpenSessionRequest__Output, _biloba_v1_OpenSessionResponse>;
  
  PrepareSession: grpc.handleUnaryCall<_biloba_v1_PrepareSessionRequest__Output, _biloba_v1_Empty>;
  
  SetCookies: grpc.handleUnaryCall<_biloba_v1_SetCookiesRequest__Output, _biloba_v1_OperationResult>;
  
  SetValue: grpc.handleUnaryCall<_biloba_v1_SetValueRequest__Output, _biloba_v1_OperationResult>;
  
}

export interface BilobaDriverDefinition extends grpc.ServiceDefinition {
  Assert: MethodDefinition<_biloba_v1_AssertRequest, _biloba_v1_OperationResult, _biloba_v1_AssertRequest__Output, _biloba_v1_OperationResult__Output>
  Click: MethodDefinition<_biloba_v1_ClickRequest, _biloba_v1_OperationResult, _biloba_v1_ClickRequest__Output, _biloba_v1_OperationResult__Output>
  CloseSession: MethodDefinition<_biloba_v1_CloseSessionRequest, _biloba_v1_Empty, _biloba_v1_CloseSessionRequest__Output, _biloba_v1_Empty__Output>
  Evaluate: MethodDefinition<_biloba_v1_EvaluateRequest, _biloba_v1_OperationResult, _biloba_v1_EvaluateRequest__Output, _biloba_v1_OperationResult__Output>
  Handshake: MethodDefinition<_biloba_v1_HandshakeRequest, _biloba_v1_HandshakeResponse, _biloba_v1_HandshakeRequest__Output, _biloba_v1_HandshakeResponse__Output>
  Navigate: MethodDefinition<_biloba_v1_NavigateRequest, _biloba_v1_OperationResult, _biloba_v1_NavigateRequest__Output, _biloba_v1_OperationResult__Output>
  OpenSession: MethodDefinition<_biloba_v1_OpenSessionRequest, _biloba_v1_OpenSessionResponse, _biloba_v1_OpenSessionRequest__Output, _biloba_v1_OpenSessionResponse__Output>
  PrepareSession: MethodDefinition<_biloba_v1_PrepareSessionRequest, _biloba_v1_Empty, _biloba_v1_PrepareSessionRequest__Output, _biloba_v1_Empty__Output>
  SetCookies: MethodDefinition<_biloba_v1_SetCookiesRequest, _biloba_v1_OperationResult, _biloba_v1_SetCookiesRequest__Output, _biloba_v1_OperationResult__Output>
  SetValue: MethodDefinition<_biloba_v1_SetValueRequest, _biloba_v1_OperationResult, _biloba_v1_SetValueRequest__Output, _biloba_v1_OperationResult__Output>
}
