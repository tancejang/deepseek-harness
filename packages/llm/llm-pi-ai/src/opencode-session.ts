/**
 * Session header an OpenCode (Zen/Go) gateway requires on inference requests.
 *
 * The OpenCode Go gateway routes a conversation to a replica and keeps that
 * conversation's prompt cache warm from a stable per-conversation id, and it
 * answers `400 MissingSessionID` to an inference request that carries none
 * (https://opencode.ai/docs/go/#where-can-i-use-it). The harness already stamps
 * that id onto every request as `GenerateOptions.sessionId` — the conversation
 * id, stable across turns, resume, compaction, and retries — and the pi-ai
 * adapter passes it to pi-ai as a stream option. pi-ai does not turn that
 * option into a request header, so a route reaching this gateway sends nothing
 * the gateway can route on.
 *
 * @module dsh-llm-pi-ai/opencode-session
 */

/** The gateway's required session-id header, spelled as its documentation spells it. */
const OPENCODE_SESSION_HEADER = 'x-opencode-session'

/** Route keys under this prefix are OpenCode routes by name. */
const OPENCODE_PROVIDER_PREFIX = 'opencode'

/** The gateway's registrable domain; a subdomain of it is still the gateway. */
const OPENCODE_DOMAIN = 'opencode.ai'

/**
 * Whether a route's requests go to an OpenCode gateway.
 *
 * A route's key is the deployment's own and the endpoint is the provider's, so
 * either match identifies the gateway: a catalog route keeps the catalog's
 * `opencode` / `opencode-go` key, while a deployment that hand-declares a route
 * against the gateway may name the route anything and repoint `baseURL` at it.
 * @param provider - the configuration route key.
 * @param baseUrl - the endpoint resolved onto the model descriptor.
 * @returns true when the route targets an OpenCode gateway.
 */
function isOpenCodeRoute(provider: string, baseUrl: string | undefined): boolean {
  if (provider.toLowerCase().startsWith(OPENCODE_PROVIDER_PREFIX)) return true
  if (baseUrl === undefined) return false
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    // An endpoint that is not a URL cannot be recognized as the gateway. The
    // route still reaches whatever its own protocol resolves; it just carries
    // no session header.
    return false
  }
  return host === OPENCODE_DOMAIN || host.endsWith(`.${OPENCODE_DOMAIN}`)
}

/**
 * Harness-owned request headers carrying the per-conversation session id.
 *
 * Scoped to OpenCode routes so a session id is not disclosed to providers that
 * did not ask for one. A request that names no session id sends none rather
 * than minting a per-request value: the gateway needs an id that is stable for
 * one conversation, so a fabricated one would satisfy its presence check while
 * giving its routing nothing to key on.
 * @param provider - the configuration route key.
 * @param baseUrl - the endpoint resolved onto the model descriptor.
 * @param sessionId - the conversation id the loop stamped on the request, when it named one.
 * @returns headers to merge into the provider request; empty when not applicable.
 */
export function sessionHeaders(
  provider: string,
  baseUrl: string | undefined,
  sessionId: string | undefined,
): Record<string, string> {
  if (sessionId === undefined || !isOpenCodeRoute(provider, baseUrl)) return {}
  return { [OPENCODE_SESSION_HEADER]: sessionId }
}
