import pino from 'pino'

const level = process.env.LOG_LEVEL || 'info'
const isProd = process.env.NODE_ENV === 'production'

export const rootLogger = pino({
  level,
  base: { service: 'credo-controller' },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
})

export type PinoLogger = typeof rootLogger
