import { friendlyRequestError, isRetryableRequestError } from './requestError'

describe('request feedback', () => {
  it('keeps local validation errors and does not retry them', () => {
    const error = new Error('Please say why you are declining.')
    expect(friendlyRequestError(error)).toBe(error.message)
    expect(isRetryableRequestError(error)).toBe(false)
  })

  it('offers retry for connection failures without showing Axios wording', () => {
    const error = { isAxiosError: true, message: 'Network Error', request: {} }
    expect(friendlyRequestError(error)).toContain('Check your data or Wi-Fi')
    expect(isRetryableRequestError(error)).toBe(true)
  })

  it.each([500, 502, 503, 504])('maps server failure %i to plain words and permits retry', (status) => {
    const error = { response: { status, data: { message: 'Internal implementation details' } } }
    expect(friendlyRequestError(error)).not.toContain('Internal implementation details')
    expect(isRetryableRequestError(error)).toBe(true)
  })

  it.each([401, 403, 404])('explains %i without raw status codes', (status) => {
    const error = { response: { status }, message: `Request failed with status code ${status}` }
    expect(friendlyRequestError(error)).not.toContain(String(status))
    expect(isRetryableRequestError(error)).toBe(false)
  })

  it('keeps actionable server validation messages', () => {
    const error = { response: { status: 422, data: { message: 'Enter a phone number' } } }
    expect(friendlyRequestError(error)).toBe('Enter a phone number')
    expect(isRetryableRequestError(error)).toBe(false)
  })
})
