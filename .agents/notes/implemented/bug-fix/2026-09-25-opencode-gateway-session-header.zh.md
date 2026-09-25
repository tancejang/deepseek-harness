# Agent Note: OpenCode 网关会话头

Status: implemented

[English](2026-09-25-opencode-gateway-session-header.md) | 中文

## 问题

OpenCode Zen/Go 网关为开放编码模型提供托管推理，大量 harness 部署把模型路由到它。网关按会话把请求选路到一个副本，并以一个稳定的每会话 id 保持该会话的提示缓存命中；自 2026-09-05 起，它用 `400 MissingSessionID` 拒绝不带该 id 的推理请求。在 pi-ai 适配器所拥有的路由上，请求到达网关时完全不带会话标识。

harness 本已持有该 id。循环把 `GenerateOptions.sessionId` 作为会话标识盖在每一个模型请求上，它在轮次、恢复、压缩与重试之间保持稳定，且 LLM seam 明确允许适配器把它映射为对模型隐藏的传输元数据。`dsh-llm-deepseek` 把它作为 `x-deepseek-harness-session-id` 发送，网关同样接受该头。而拥有 `opencode` 与 `opencode-go` 目录路由的 `dsh-llm-pi-ai`，只是把该 id 作为流选项交给 pi-ai，从未把它变成请求头。

## 决策

`dsh-llm-pi-ai` 对任何指向 OpenCode 网关的路由发送携带请求会话 id 的 `x-opencode-session`。该判定由 `src/opencode-session.ts` 拥有：当路由键以 `opencode` 开头，或落在模型描述符上的端点主机为 `opencode.ai` 或其子域时，该路由即符合。路由键是部署自己的选择，端点是提供方的事实，任一侧命中即可，因此以其他键手工声明、却指向该网关的路由同样被覆盖。

该头归 Harness 所有，与归属标识并列：同名的 profile 静态 `headers` 条目会被丢弃，而不会遮蔽每会话值。它搭载在 pi-ai 最后合并的同一个 `StreamOptions.headers` 调用点，因此对网关服务的每一种协议——`openai-completions`、`openai-responses` 与 `anthropic-messages`——都能到达，无论是目录路由还是由本包自有协议表构建的路由。

未指名会话的请求不发送该头。临时生成一个每请求 id 虽能满足网关的存在性检查，却让它的选路无从稳定依附，并把本应由请求路径携带的会话标识缺失隐藏起来。

## 验证

- `packages/llm/llm-pi-ai/tests/opencode-session.spec.ts` 覆盖路由键命中、端点主机精确匹配与子域匹配、仅以网关名结尾的更长域名、不是 URL 的端点、缺失会话 id，以及非网关路由。
- `packages/llm/llm-pi-ai/tests/adapter.spec.ts` 断言在该已安装 OpenCode 目录所出厂的每一种协议上都能到达线上、同名的静态条目不会遮蔽每会话值、未指名会话的请求不发送该头，以及非 OpenCode 路由既收不到该会话头也不会丢失 `User-Agent`。
- `packages/llm/llm-pi-ai/src` 下的每个文件都保持在既定的逐文件覆盖率阈值之上。

## 曾考虑的替代方案

**静态 `headers` 值。** 这是截止后各部署采用的变通做法：`headers: { x-opencode-session: <一个 uuid> }`。它能满足网关，却把每个会话塌缩进同一个亲和桶：在 DSH 中切换会话仍指向同一副本却带着不同前缀，缓存局部性随之退化。否决：它把网关的职责做得很差，而正确的值只有一行之隔。

**可选的 `sessionHeader` profile 字段。** 按路由指定头名，并把会话 id 写入其中。否决：所报告的故障是开箱即坏，而一个没人知道要设置的字段并不能修好它；本包存在的意义就是归一化提供方的特殊性，因此网关自身的要求应属于包内，而不是落在每个部署的配置里。

**依赖 pi-ai 升级。** 上游在 0.85.1 之后为它自己的目录提供方新增了 `x-opencode-session` 包装。否决作为完整修复：`src/provider.ts` 用本包未包装的协议工厂构建手工声明与 `api:` 覆盖的路由，那些路由仍不会发送任何东西。版本提升仍是另一项独立变更，附带它自己的补丁与目录工作。

**在所有路由发送 `x-deepseek-harness-session-id`，与孪生适配器对齐。** 与 `dsh-llm-deepseek` 一致，且网关接受该头。否决：这会把 harness 会话 id 泄露给从未索取它的提供方；应用归属决策明确将其排除在提供方中立头之外。

**在缺失会话 id 时临时生成每请求 UUID。** 否决：它满足了存在性检查却不给选路任何稳定依据，并隐藏了未能携带会话 id 的请求路径。

**仅按路由键判定。** 否决：手工声明并指向该网关的部署可以任意命名路由，而端点是标识提供方的事实。

## 后果

harness 会话 id 只到达网关而不触及其他提供方，因为该判定按端点与路由键限定，而非施加于每个请求。在 `headers` 中固定了静态 `x-opencode-session` 的部署会失去该条目，由每会话值取而代之；这一替换正是修复本身，因为固定值无法表达会话亲和。pi-ai 自身的上游包装与本头不冲突，因为该包装会跳过调用方已设置的头。网关接受原始的会话 id，因此不做 UUID 归一化，线上值保持为 harness 自己的稳定 id。
