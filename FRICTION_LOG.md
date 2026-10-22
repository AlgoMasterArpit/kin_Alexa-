# Friction log

Problems we hit while building Kin, recorded as they happened.

## 1. MCP Apps requires the v2 MCP SDK, but most guides use v1

- **Task:** Add an MCP Apps UI card to an Alexa+ MCP server.
- **Steps:** Started from the widely documented `@modelcontextprotocol/sdk` (v1.32) package, then installed `@modelcontextprotocol/ext-apps` 2.0.3.
- **Expected:** ext-apps server helpers work with the SDK most tutorials use.
- **Actual:** ext-apps 2.x declares peers on the split v2 packages (`@modelcontextprotocol/server`, `/client`, `/core`), so it does not pair with v1. We rewrote the server against v2 (`createMcpHandler`, `@modelcontextprotocol/node`).
- **Severity:** Medium. About an hour lost before writing any feature code.
- **Workaround:** Built on SDK v2 from the start of the real implementation.
- **Suggestion:** State the required SDK line at the top of the Alexa+ track docs and link a v2 starter server that already includes an MCP Apps resource.

## 2. Confirmation prompts need two code paths

- **Task:** Ask the parent "Are you sure?" before placing a medicine order.
- **Steps:** Used `ctx.mcpReq.elicitInput` as documented for 2025-11-25.
- **Expected:** One elicitation API for every client the track accepts.
- **Actual:** In SDK v2, `elicitInput` is deprecated and throws for 2026-07-28 requests, which must return `inputRequired(...)` instead. Clients on 2025-11-25 still need the push-style call.
- **Severity:** Medium.
- **Workaround:** A small `requestConfirmation` helper that picks the path from the protocol era passed to the server factory.
- **Suggestion:** Document which elicitation style Alexa+ uses, and ship one SDK helper that covers both eras.

## 3. Stateless 2025-11-25 serving cannot see client capabilities

- **Task:** Only send elicitation to clients that support it.
- **Steps:** Served 2025-era traffic with the SDK's default stateless fallback, then checked client capabilities inside a `tools/call` handler.
- **Expected:** Capabilities from `initialize` are available on later requests.
- **Actual:** Each stateless request gets a fresh server instance, so capabilities sent at `initialize` are unknown during `tools/call`. Calling `elicitInput` for a client without elicitation fails.
- **Severity:** Low.
- **Workaround:** Catch the failure and fall back to an explicit `confirmed` argument that the agent sets only after the parent says yes.
- **Suggestion:** Tell server authors whether the Alexa+ client declares elicitation, or recommend sessionful serving for servers that need it.

## 4. A new IAM user cannot use Bedrock until permissions are added

- **Task:** Call Claude on Amazon Bedrock in `ap-south-1` for the weekly family digest.
- **Steps:** Configured the AWS CLI with an IAM user and listed inference profiles with `aws bedrock list-inference-profiles --region ap-south-1`.
- **Expected:** A list of available Claude models.
- **Actual:** `AccessDeniedException: ... is not authorized to perform: bedrock:ListInferenceProfiles`. The hackathon getting-started page does not mention which IAM permissions Bedrock needs.
- **Severity:** Medium. It blocks the AWS Builder integration until an account admin changes IAM.
- **Workaround:** The digest falls back to a deterministic template, so the rest of the demo works without Bedrock.
- **Suggestion:** Add a "minimum IAM policy for the hackathon" snippet to builder.aws.com and the Bedrock quickstart.
