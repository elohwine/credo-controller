import type { BaseError } from './errors/errors'

import {
  CredoError,
  RecordNotFoundError,
  RecordDuplicateError,
  ClassValidationError,
  MessageSendingError,
} from '@credo-ts/core'

import { RecordDuplicateError as CustomRecordDuplicateError, NotFoundError, InternalServerError } from './errors/errors'
import convertError from './utils/errorConverter'

class ErrorHandlingService {
  public static handle(error: unknown) {
    if (error instanceof RecordDuplicateError) {
      throw this.handleRecordDuplicateError(error)
    } else if (error instanceof ClassValidationError) {
      throw this.handleClassValidationError(error)
    } else if (error instanceof MessageSendingError) {
      throw this.handleMessageSendingError(error)
    } else if (error instanceof RecordNotFoundError) {
      throw this.handleRecordNotFoundError(error)
      // Indy/AnonCreds branches removed for lean setup
    } else if (error instanceof CredoError) {
      throw this.handleCredoError(error)
    } else if (error instanceof Error) {
      throw convertError(error.constructor.name, error.message)
    } else {
      throw new InternalServerError(`An unknown error occurred ${error}`)
    }
  }
  // Removed handlers for Indy / AnonCreds specific errors

  private static handleCredoError(error: CredoError): BaseError {
    throw new InternalServerError(`CredoError: ${error.message}`)
  }

  private static handleRecordNotFoundError(error: RecordNotFoundError): BaseError {
    throw new NotFoundError(error.message)
  }

  private static handleRecordDuplicateError(error: RecordDuplicateError): BaseError {
    throw new CustomRecordDuplicateError(error.message)
  }

  private static handleClassValidationError(error: ClassValidationError): BaseError {
    throw new InternalServerError(`ClassValidationError: ${error.message}`)
  }

  private static handleMessageSendingError(error: MessageSendingError): BaseError {
    throw new InternalServerError(`MessageSendingError: ${error.message}`)
  }
}

export default ErrorHandlingService
