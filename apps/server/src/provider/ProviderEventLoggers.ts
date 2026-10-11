/**
 * Server construction of the provider-core `ProviderEventLoggers` service: one
 * rotating store behind both logger views, so driver instances never race its
 * rotation. Diagnostics must not block startup: a store that cannot open
 * degrades to the no-op loggers.
 *
 * @module provider/ProviderEventLoggers
 */
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ResourceAttribution from "../resourceTelemetry/ResourceAttribution.ts";
import * as EventNdjsonLogger from "./EventNdjsonLogger.ts";

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const { providerEventLogPath, providerEventLogs } = yield* ServerConfig.ServerConfig;
  // Opted out (`--no-provider-event-logs` / T3CODE_PROVIDER_EVENT_LOGS=false): never create the store,
  // so no file under logs/provider/ is opened, written or rotated.
  if (providerEventLogs === false) return ProviderEventLoggers.NoOpProviderEventLoggers;
  const attribution = yield* ResourceAttribution.ResourceAttribution;
  const store = yield* EventNdjsonLogger.makeEventNdjsonLogStore(providerEventLogPath, {
    attribution,
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning(error.message, { error }).pipe(
        Effect.annotateLogs({ scope: "provider-observability" }),
        Effect.as(undefined),
      ),
    ),
  );
  if (!store) return ProviderEventLoggers.NoOpProviderEventLoggers;
  yield* Effect.addFinalizer(() => store.close());
  return { native: store.logger("native"), canonical: store.logger("canonical") };
});

export const layer = Layer.effect(ProviderEventLoggers.ProviderEventLoggers, make);
