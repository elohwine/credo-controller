# Agent Terminology & Naming (AI vs Credo)

## Why this exists
This repository already uses the word **agent** to mean an **Aries/Credo agent** (root agent / tenant agents), which is a concrete runtime component responsible for DIDComm, OID4VC, keys, wallets, etc.

Separately, the product roadmap discusses **AI agents** (LLM-driven automation). If we mix these concepts in file names, folder names, route names, or types, we’ll create constant confusion and naming conflicts.

This document defines rules to keep them distinct.

---

## Canonical meanings (use these terms)

### Credo/Aries agent (default meaning of “agent” in this codebase)
Use when referring to:
- `Agent` / `TenantAgent` from Credo
- wallet/session lifecycle
- OID4VC issuer/verifier modules
- DID provisioning and signing keys

Preferred phrasing:
- “Credo agent”
- “Tenant agent”
- “Root agent”
- “Issuer agent” / “Verifier agent”

### AI agent (LLM automation)
Use when referring to:
- LLM-based automation / copilots / orchestration
- natural-language tools
- Gen-UI orchestration logic

Preferred phrasing:
- “AI assistant”
- “Automation agent”
- “LLM assistant”

Avoid calling this just “agent” in code.

---

## Folder + file naming rules

### Folders
- Reserve `src/controllers/agent/*` for Credo-agent REST endpoints.
- Put AI/LLM automation code under one of:
  - `src/ai/`
  - `src/automation/`
  - `src/gen-ui/` (only if it’s truly Gen-UI)

Do not create any new folder named `agent/` outside `src/controllers/agent/`.

### Filenames and class names
- Credo/Aries-related:
  - OK: `TenantProvisioningService.ts`, `OidcIssuerController.ts`, `AgentController.ts`
  - Avoid inventing new names like `AiAgentController.ts` under `src/controllers/agent/`

- AI/LLM-related:
  - Use prefixes: `Ai*` or `Automation*`
  - Examples: `AiPolicyService.ts`, `AutomationRunner.ts`, `AiConsentExplainer.ts`

### Type names
- If you need an Aries agent type alias, use explicit naming:
  - `type CredoRootAgent = Agent<...>`
  - `type CredoTenantAgent = TenantAgent<...>`
- If you need an AI “agent” interface, name it:
  - `AiAssistant` / `AutomationAgent` / `Assistant`

Never introduce a new exported type named just `Agent`.

---

## HTTP route naming rules
- `/agent/*` is reserved for Credo-agent operations.
- AI/LLM endpoints must use:
  - `/ai/*` or `/automation/*`

Examples:
- Credo: `GET /agent/health/database`
- AI: `POST /ai/policy/evaluate`

---

## Documentation rules
When writing docs or tickets:
- Use “Credo agent” when you mean the Aries runtime.
- Use “AI assistant” or “automation agent” when you mean LLM behavior.

If a document uses the word “agent” without qualifier, assume **Credo agent**.
