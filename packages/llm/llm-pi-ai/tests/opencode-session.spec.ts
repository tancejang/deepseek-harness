import { describe, expect, it } from 'vitest'
import { sessionHeaders } from '../src/opencode-session.ts'

describe('sessionHeaders', () => {
  it('names the gateway header from an OpenCode route key', () => {
    expect(sessionHeaders('opencode-go', 'https://opencode.ai/zen/go/v1', 'conversation-1'))
      .toEqual({ 'x-opencode-session': 'conversation-1' })
    expect(sessionHeaders('opencode', undefined, 'conversation-1'))
      .toEqual({ 'x-opencode-session': 'conversation-1' })
    expect(sessionHeaders('OpenCode-Go', undefined, 'conversation-1'))
      .toEqual({ 'x-opencode-session': 'conversation-1' })
  })

  it('recognizes the gateway from the endpoint alone', () => {
    expect(sessionHeaders('zen', 'https://opencode.ai/zen/go/v1', 'conversation-2'))
      .toEqual({ 'x-opencode-session': 'conversation-2' })
    expect(sessionHeaders('zen', 'https://console.opencode.ai/zen/go/v1', 'conversation-2'))
      .toEqual({ 'x-opencode-session': 'conversation-2' })
  })

  it('does not mistake a longer domain name for the gateway', () => {
    expect(sessionHeaders('zen', 'https://notopencode.ai/zen/go/v1', 'conversation-3')).toEqual({})
  })

  it('leaves a route that is not the gateway without a session header', () => {
    expect(sessionHeaders('deepseek', 'https://api.deepseek.com/anthropic', 'conversation-4')).toEqual({})
    expect(sessionHeaders('deepseek', undefined, 'conversation-4')).toEqual({})
  })

  it('treats an endpoint that is not a URL as outside the gateway', () => {
    expect(sessionHeaders('zen', 'not a url', 'conversation-5')).toEqual({})
  })

  it('sends nothing when the request names no session', () => {
    expect(sessionHeaders('opencode-go', 'https://opencode.ai/zen/go/v1', undefined)).toEqual({})
  })
})
