/* eslint-disable import/order */
/* eslint-disable no-console */
import { NodeSDK } from '@opentelemetry/sdk-node'
import * as process from 'process'

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core'

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'

import { resourceFromAttributes } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import type { Logger } from '@opentelemetry/api-logs'

import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api'
import dotenv from 'dotenv'
dotenv.config()
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO)

const otelDisabled =
  (process.env.DISABLE_OTEL ?? '').toLowerCase() === 'true' || process.env.NODE_ENV === 'test'

const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION,
  [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.HOSTNAME,
})
const traceExporter = otelDisabled
  ? undefined
  : new OTLPTraceExporter({
    url: process.env.OTEL_TRACES_OTLP_ENDPOINT,
    headers: {
      Authorization: `Api-Key ${process.env.OTEL_HEADERS_KEY}`,
    },
  })

const logProvider = new LoggerProvider({ resource })

if (!otelDisabled) {
  const logExporter = new OTLPLogExporter({
    url: process.env.OTEL_LOGS_OTLP_ENDPOINT,
    headers: {
      Authorization: `Api-Key ${process.env.OTEL_HEADERS_KEY}`,
    },
  })
  logProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter))
}

export const otelLogger: Logger = logProvider.getLogger('credo-controller-logger')
export const otelLoggerProviderInstance = logProvider

type OtelSdkLike = {
  start(): void | Promise<void>
  shutdown(): void | Promise<void>
}

export const otelSDK: OtelSdkLike = otelDisabled
  ? {
    start: async () => { },
    shutdown: async () => { },
  }
  : new NodeSDK({
    traceExporter,
    resource,
    instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation(), new NestInstrumentation()],
  })

if (!otelDisabled && typeof (process as NodeJS.Process).on === 'function') {
  ; (process as NodeJS.Process).on('SIGTERM', () => {
    Promise.all([otelSDK.shutdown(), logProvider.shutdown()])
      .then(() => console.log('SDK and Logger shut down successfully'))
      .catch((err) => console.error('Error during shutdown', err))
      .finally(() => process.exit(0))
  })
}
