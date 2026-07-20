import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_FETCH_TIMEOUT_MS, fetchWithTimeout, isAbortError } from '../src/net'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchWithTimeout', () => {
  it('passes an AbortSignal to fetch and resolves with the response', async () => {
    const response = { ok: true } as Response
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return response
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWithTimeout('https://example.test')).resolves.toBe(response)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('aborts the request once the timeout elapses', async () => {
    vi.useFakeTimers()
    // A fetch that only settles when its signal aborts — i.e. a hung request.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchWithTimeout('https://example.test', 5000)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('does NOT abort a request that resolves before the timeout', async () => {
    vi.useFakeTimers()
    let aborted = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true
      })
      return { ok: true } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchWithTimeout('https://example.test', 5000)
    // Advance past the timeout: the timer must already be cleared, so no abort.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(aborted).toBe(false)
  })

  it('defaults to a 10s budget', () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(10_000)
  })
})

describe('isAbortError', () => {
  it('recognises the AbortError a timed-out request throws', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isAbortError({ name: 'AbortError' })).toBe(true)
  })

  it('rejects unrelated errors and non-objects', () => {
    expect(isAbortError(new TypeError('network'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})
