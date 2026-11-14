import 'reflect-metadata'

import Database from 'better-sqlite3'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { identityVerificationRequestService } from '../IdentityVerificationRequestService'

describe('Central Registry opt-in request (no VC type invented, no registry call made)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    DatabaseManager.setDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  it('has no status before anyone asks', () => {
    expect(identityVerificationRequestService.statusFor('wallet-1')).toEqual({ status: 'none' })
  })

  it('records the opt-in as pending, not as a confirmation', () => {
    const state = identityVerificationRequestService.requestRegistryVerification('wallet-1')
    expect(state.status).toBe('pending')
    expect(state.requestId).toBeTruthy()
    expect(identityVerificationRequestService.statusFor('wallet-1').status).toBe('pending')
  })

  it('asking again while pending returns the same request, not a second one', () => {
    const first = identityVerificationRequestService.requestRegistryVerification('wallet-1')
    const second = identityVerificationRequestService.requestRegistryVerification('wallet-1')
    expect(second.requestId).toBe(first.requestId)
  })

  it('a decline (the person withdrew the request) clears the pending request', () => {
    identityVerificationRequestService.requestRegistryVerification('wallet-1')
    identityVerificationRequestService.decline('wallet-1')
    expect(identityVerificationRequestService.statusFor('wallet-1').status).toBe('declined')
    // Asking again after a decline opens a fresh request.
    const again = identityVerificationRequestService.requestRegistryVerification('wallet-1')
    expect(again.status).toBe('pending')
  })

  it('keeps requests separate per wallet', () => {
    identityVerificationRequestService.requestRegistryVerification('wallet-1')
    expect(identityVerificationRequestService.statusFor('wallet-2')).toEqual({ status: 'none' })
  })
})
