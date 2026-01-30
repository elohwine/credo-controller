import type { ILogObject } from 'tslog'

import { LogLevel, BaseLogger } from '@credo-ts/core'
import { appendFileSync } from 'fs'
import { Logger } from 'tslog'

import { otelLogger } from '../tracer'

import { rootLogger } from './pinoLogger'
import { getRequestContext } from './requestContext'

function logToTransport(logObject: ILogObject) {
  try {
    appendFileSync('/app/data/logs.txt', JSON.stringify(logObject) + '\n')
  } catch { }
}

export class TsLogger extends BaseLogger {
  private logger: Logger

  // Map our log levels to tslog levels
  private tsLogLevelMap = {
    [LogLevel.test]: 'silly',
    [LogLevel.trace]: 'trace',
    [LogLevel.debug]: 'debug',
    [LogLevel.info]: 'info',
    [LogLevel.warn]: 'warn',
    [LogLevel.error]: 'error',
    [LogLevel.fatal]: 'fatal',
  } as const

  public constructor(logLevel: LogLevel, name: string = 'credo-controller-service' as string) {
    super(logLevel)

    this.logger = new Logger({
      name,
      minLevel: this.logLevel == LogLevel.off ? undefined : this.tsLogLevelMap[this.logLevel],
      ignoreStackLevels: 5,
      attachedTransports: [
        {
          transportLogger: {
            silly: logToTransport,
            debug: logToTransport,
            trace: logToTransport,
            info: logToTransport,
            warn: logToTransport,
            error: logToTransport,
            fatal: logToTransport,
          },
          // always log to file
          minLevel: 'silly',
        },
      ],
    })
  }

  private log(
    level: Exclude<LogLevel, LogLevel.off>,
    message: string | { message: string },
    data?: Record<string, any>,
  ): void {
    const tsLogLevel = this.tsLogLevelMap[level]

    if (data) {
      this.logger[tsLogLevel](message, data)
    } else {
      this.logger[tsLogLevel](message)
    }

    // Forward to Pino root logger with correlationId context
    try {
      const ctx = getRequestContext()
      const pinoData = { ...(data || {}), ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}) }
      const text = typeof message === 'string' ? message : message?.message
      switch (level) {
        case LogLevel.trace:
          rootLogger.trace(pinoData, text)
          break
        case LogLevel.debug:
          rootLogger.debug(pinoData, text)
          break
        case LogLevel.info:
          rootLogger.info(pinoData, text)
          break
        case LogLevel.warn:
          rootLogger.warn(pinoData, text)
          break
        case LogLevel.error:
          rootLogger.error(pinoData, text)
          break
        case LogLevel.fatal:
          rootLogger.fatal(pinoData, text)
          break
        default:
          rootLogger.info(pinoData, text)
      }
    } catch { }
    let logMessage = ''
    if (typeof message === 'string') {
      logMessage = message
    } else if (typeof message === 'object' && 'message' in message) {
      logMessage = message.message
    }

    let errorDetails
    if (data?.error) {
      const error = data.error
      if (typeof error === 'string') {
        errorDetails = error
      } else if (error instanceof Error) {
        errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      } else {
        try {
          errorDetails = JSON.parse(JSON.stringify(error))
        } catch {
          errorDetails = String(error)
        }
      }
    }
    const ctx = getRequestContext()
    otelLogger.emit({
      body: logMessage,
      severityText: LogLevel[level].toUpperCase(),
      attributes: {
        ...(data || {}),
        ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
        ...(errorDetails ? { error: errorDetails } : {}),
      },
    })
  }

  public test(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.test, message, data)
  }

  public trace(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.trace, message, data)
  }

  public debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.debug, message, data)
  }

  public info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.info, message, data)
  }

  public warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.warn, message, data)
  }

  public error(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.error, message, data)
  }

  public fatal(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.fatal, message, data)
  }
}
