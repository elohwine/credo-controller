import pino from 'pino'

const level = process.env.LOG_LEVEL || 'info'
const isProd = process.env.NODE_ENV === 'production'

export const rootLogger = pino({
  level,
  base: { service: 'credo-controller' },
  // A log line is not a place to keep a person's name, number, PIN or a credential.
  // Paths are the field names services already pass. A field not listed here is unchanged.
  redact: {
    censor: '[redacted]',
    paths: [
      'phone',
      'email',
      'pin',
      'displayName',
      'dateOfBirth',
      'password',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.phone',
      '*.email',
      '*.pin',
      '*.displayName',
      '*.dateOfBirth',
      '*.password',
    ],
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
})

export type PinoLogger = typeof rootLogger
