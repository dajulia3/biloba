import {
  credentials,
  Metadata,
  status,
  type ClientUnaryCall,
  type ServiceError,
} from "@grpc/grpc-js";

import {BilobaError, type BilobaErrorCode, type WaitOptions} from "../index.js";
import type {AssertRequest} from "../generated/biloba/v1/AssertRequest.js";
import type {BilobaDriverClient} from "../generated/biloba/v1/BilobaDriver.js";
import type {ClickRequest} from "../generated/biloba/v1/ClickRequest.js";
import type {CloseSessionRequest} from "../generated/biloba/v1/CloseSessionRequest.js";
import type {Empty__Output} from "../generated/biloba/v1/Empty.js";
import type {EvaluateRequest} from "../generated/biloba/v1/EvaluateRequest.js";
import type {HandshakeRequest} from "../generated/biloba/v1/HandshakeRequest.js";
import type {HandshakeResponse__Output} from "../generated/biloba/v1/HandshakeResponse.js";
import type {NavigateRequest} from "../generated/biloba/v1/NavigateRequest.js";
import type {OpenSessionRequest} from "../generated/biloba/v1/OpenSessionRequest.js";
import type {OpenSessionResponse__Output} from "../generated/biloba/v1/OpenSessionResponse.js";
import type {OperationResult__Output} from "../generated/biloba/v1/OperationResult.js";
import type {PrepareSessionRequest} from "../generated/biloba/v1/PrepareSessionRequest.js";
import type {SetCookiesRequest} from "../generated/biloba/v1/SetCookiesRequest.js";
import type {SetValueRequest} from "../generated/biloba/v1/SetValueRequest.js";
import {loadDriverClientConstructor} from "./protocol.js";

export type WireOperationResult = OperationResult__Output;

interface TransportOptions extends WaitOptions {
  deadlineMs?: number;
}

type UnaryMethod<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: {deadline?: Date},
  callback: (error: ServiceError | null, response?: Response) => void,
) => ClientUnaryCall;

export class GrpcTransport {
  readonly #client: BilobaDriverClient;
  readonly #metadata: Metadata;

  constructor(address: string, token: string) {
    const DriverClient = loadDriverClientConstructor();
    this.#client = new DriverClient(address, credentials.createInsecure());
    this.#metadata = new Metadata();
    this.#metadata.set("authorization", `Bearer ${token}`);
  }

  close(): void {
    this.#client.close();
  }

  handshake(request: HandshakeRequest, options: TransportOptions = {}): Promise<HandshakeResponse__Output> {
    return this.#unary(this.#client.handshake, request, options);
  }

  openSession(request: OpenSessionRequest, options: TransportOptions = {}): Promise<OpenSessionResponse__Output> {
    return this.#unary(this.#client.openSession, request, options);
  }

  prepareSession(request: PrepareSessionRequest, options: TransportOptions = {}): Promise<Empty__Output> {
    return this.#unary(this.#client.prepareSession, request, options);
  }

  closeSession(request: CloseSessionRequest, options: TransportOptions = {}): Promise<Empty__Output> {
    return this.#unary(this.#client.closeSession, request, options);
  }

  navigate(request: NavigateRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.navigate, request, options);
  }

  setCookies(request: SetCookiesRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.setCookies, request, options);
  }

  click(request: ClickRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.click, request, options);
  }

  setValue(request: SetValueRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.setValue, request, options);
  }

  evaluate(request: EvaluateRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.evaluate, request, options);
  }

  assert(request: AssertRequest, options: TransportOptions = {}): Promise<WireOperationResult> {
    return this.#unary(this.#client.assert, request, options);
  }

  async #unary<Request extends object, Response>(
    rpc: UnaryMethod<Request, Response>,
    request: Request,
    options: TransportOptions = {},
  ): Promise<Response> {
    if (options.signal?.aborted) {
      throw abortedError(options.signal.reason);
    }

    return await new Promise<Response>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        callback();
      };
      const deadlineMs = options.deadlineMs ?? options.timeoutMs;
      const callOptions = deadlineMs === undefined
        ? {}
        : {deadline: new Date(Date.now() + deadlineMs)};
      const clientCall = rpc.call(
        this.#client,
        request,
        this.#metadata,
        callOptions,
        (error, response) => finish(() => {
          if (error) reject(mapServiceError(error));
          else if (response === undefined) reject(new BilobaError({
            code: "DRIVER_ERROR",
            message: "Biloba RPC returned no response",
          }));
          else resolve(response);
        }),
      );
      const abort = () => {
        clientCall.cancel();
        finish(() => reject(abortedError(options.signal?.reason)));
      };
      options.signal?.addEventListener("abort", abort, {once: true});
    });
  }
}

function mapServiceError(error: ServiceError): BilobaError {
  const code: BilobaErrorCode = error.code === status.DEADLINE_EXCEEDED
    ? "TIMEOUT"
    : error.code === status.CANCELLED
      ? "CANCELLED"
      : error.code === status.INVALID_ARGUMENT
        ? "INVALID_ARGUMENT"
        : error.code === status.NOT_FOUND
          ? "TARGET_NOT_FOUND"
          : error.code === status.FAILED_PRECONDITION
            ? "TARGET_NOT_READY"
            : error.code === status.UNAVAILABLE
              ? "DRIVER_CLOSED"
              : "DRIVER_ERROR";
  return new BilobaError({code, message: error.details || error.message, daemonDetail: error.message});
}

function abortedError(reason: unknown): BilobaError {
  const suffix = reason === undefined ? "" : `: ${String(reason)}`;
  return new BilobaError({code: "CANCELLED", message: `Biloba operation cancelled${suffix}`});
}
