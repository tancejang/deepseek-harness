# Agent Note: OpenCode gateway session header

Status: implemented

English | [中文](2026-09-25-opencode-gateway-session-header.zh.md)

## Problem

The OpenCode Zen/Go gateway serves managed inference for open coding models, and a large share of harness deployments route models through it. It routes each conversation to a replica and keeps that conversation's prompt cache warm from a stable per-conversation id, and since 2026-09-05 it rejects an inference request that carries none with `400 MissingSessionID`. Requests reached it with no session identity at all on the routes the pi-ai adapter owns.

The harness already has the id. The loop stamps `GenerateOptions.sessionId` on every model request as the conversation identity, stable across turns, resume, compaction, and retries, and the LLM seam documents that adapters may map it to model-hidden transport metadata. `dsh-llm-deepseek` sends it as `x-deepseek-harness-session-id`, which the gateway also accepts. `dsh-llm-pi-ai`, which owns the `opencode` and `opencode-go` catalog routes, passed the id to pi-ai as a stream option and never turned it into a request header.

## Decision

`dsh-llm-pi-ai` sends `x-opencode-session`, carrying the request's session id, to any route that targets an OpenCode gateway. `src/opencode-session.ts` owns the decision: a route qualifies when its key begins with `opencode`, or when the host of the endpoint resolved onto its model descriptor is `opencode.ai` or a subdomain of it. The route key is the deployment's own and the endpoint is the provider's, so either match is enough and a hand-declared route pointed at the gateway under another key is still covered.

The header is Harness-owned, beside attribution: a profile's static `headers` entry of the same name is dropped rather than left to shadow the per-conversation value. It rides the same `StreamOptions.headers` call site pi-ai merges last, so it reaches every wire protocol the gateway serves — `openai-completions`, `openai-responses`, and `anthropic-messages` — on catalog routes and on routes built from this package's own protocol table alike.

A request that names no session sends no header. Minting a per-request id would satisfy the gateway's presence check while giving its routing nothing stable to key on, and would hide a missing session identity from the request path that should carry it.

## Verification

- `packages/llm/llm-pi-ai/tests/opencode-session.spec.ts` covers the route-key match, the exact and subdomain endpoint host, a longer domain that only ends in the gateway's name, an endpoint that is not a URL, an absent session id, and a non-gateway route.
- `packages/llm/llm-pi-ai/tests/adapter.spec.ts` asserts arrival on the wire for each protocol the installed OpenCode catalog ships, that a static same-named entry does not shadow the per-conversation value, that a request naming no session sends none, and that a non-OpenCode route receives neither the session header nor a lost `User-Agent`.
- Every file under `packages/llm/llm-pi-ai/src` remains at the configured per-file coverage thresholds.

## Alternatives considered

**A static `headers` value.** The workaround deployments adopted after the deadline: `headers: { x-opencode-session: <one uuid> }`. It satisfies the gateway but collapses every conversation into one affinity bucket, so switching sessions still points at the same replica with different prefixes and cache locality degrades. Rejected: it does the gateway's job badly, and the fix is one line away from the value that does it well.

**An opt-in `sessionHeader` profile field.** Names the header per route and writes the session id into it. Rejected: the reported failure is out-of-the-box breakage, and a field nobody knows to set does not fix it; this package exists to normalize provider particulars, so the gateway's own requirement belongs inside it rather than in every deployment's configuration.

**Rely on a pi-ai upgrade.** Upstream added an `x-opencode-session` wrapper for its own catalog providers after 0.85.1. Rejected as the whole fix: `src/provider.ts` builds hand-declared and `api:`-overridden routes from this package's unwrapped protocol factories, so those routes would still send nothing. A pin bump remains a separate change with its own patch and catalog work.

**Send `x-deepseek-harness-session-id` on every route, mirroring the twin adapter.** Uniform with `dsh-llm-deepseek`, and the gateway accepts it. Rejected: it discloses a harness session id to providers that never asked for one, which the app-attribution decision explicitly keeps out of provider-neutral headers.

**Mint a per-request UUID when no session id is present.** Rejected: it satisfies the presence check without giving routing anything stable, and it hides a request path that failed to carry the conversation id.

**Gate on the route key alone.** Rejected: a deployment that hand-declares a route against the gateway may name it anything, and the endpoint is the fact that identifies the provider.

## Consequences

A harness session id reaches the gateway and no other provider, because the decision is scoped by endpoint and route key rather than applied to every request. Deployments that pinned a static `x-opencode-session` in `headers` lose that entry to the per-conversation value; that replacement is the fix, since a fixed value cannot express session affinity. pi-ai's own upstream wrapper and this header do not conflict, because the wrapper skips a header the caller already set. The gateway accepts the raw conversation id, so no UUID normalization is applied and the wire value stays the harness's own stable id.
