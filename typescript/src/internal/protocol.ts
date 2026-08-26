import {
  makeGenericClientConstructor,
  loadPackageDefinition,
  type ServiceDefinition,
} from "@grpc/grpc-js";
import {loadSync} from "@grpc/proto-loader";
import {fileURLToPath} from "node:url";

import type {BilobaDriverClient} from "../generated/biloba/v1/BilobaDriver.js";

const protoPath = fileURLToPath(new URL("../../protocol/driver.proto", import.meta.url));

type LoadedDriverPackage = {
  biloba: {
    v1: {
      BilobaDriver: {service: ServiceDefinition};
    };
  };
};

export type WireServiceDefinition = ServiceDefinition;

export type WireDriverClientConstructor = new (
  address: string,
  credentials: import("@grpc/grpc-js").ChannelCredentials,
) => BilobaDriverClient;

export function loadDriverDefinition(): ServiceDefinition {
  const definition = loadSync(protoPath, {
    defaults: true,
    enums: String,
    keepCase: false,
    longs: Number,
    oneofs: true,
  });
  return (loadPackageDefinition(definition) as unknown as LoadedDriverPackage).biloba.v1.BilobaDriver.service;
}

export function loadDriverClientConstructor(): WireDriverClientConstructor {
  return makeGenericClientConstructor(
    loadDriverDefinition(),
    "BilobaDriver",
  ) as unknown as WireDriverClientConstructor;
}
