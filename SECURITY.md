# Security Policy

Agent E2E Harness helps agents run Executable Journeys, collect Deterministic Proof, manage browser sessions, record artifacts, and clean resources through an Ownership Ledger. Security reports should preserve that same discipline: give maintainers enough private evidence to reproduce and reason about the issue without exposing exploit details publicly.

## Supported Versions

The first supported release line begins at the v1.0 launch.

| Version | Supported |
| --- | --- |
| `1.x` | Yes, starting at v1.0 launch |
| `<1.0` | No public security support commitment |

Before v1.0, security-sensitive findings are still welcome through the private reporting flow below, but fixes are handled on a best-effort launch-prep basis.

## How to Report a Vulnerability

Use GitHub Private Vulnerability Reporting for `aitoroses/agent-e2e-harness`:

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Choose **Report a vulnerability**.
4. Submit the report through GitHub's private advisory flow.

Do not file a public issue, discussion, pull request, or comment with exploit details. Public issues are appropriate for ordinary bugs, feature requests, and questions; they are not appropriate for vulnerability details, proof-of-exploit steps, secrets, credentials, or payloads that could help attack downstream projects.

If you are unsure whether something is security-sensitive, use the private vulnerability report path.

## What to Include

Useful reports include:

- The affected package surface, such as `core`, `dev-mcp`, `playwright-mcp`, `stack`, `artifacts`, or the Reference CLI.
- The affected workflow, MCP tool, Executable Journey, artifact path, browser session, stack provider, or cleanup path.
- Impact: what an attacker or untrusted input could do.
- Reproduction steps, with private proof only.
- Any relevant environment details, such as OS, Node version, Bun version, browser mode, and package version.
- Whether the issue can affect generated proof artifacts, the Ownership Ledger, resource cleanup, local Dev MCP access, or consumer app data.

Please keep shared artifacts minimal and focused. If screenshots, logs, or snapshots contain tokens, personal data, database contents, or exploit payloads, redact them before attaching.

## Response Expectations

Maintainers will review private vulnerability reports on a best-effort basis and aim to acknowledge valid reports within a reasonable window. For the v1.0 launch line, there is no formal SLA yet.

After acknowledgment, maintainers may ask for more detail, validate the affected harness surface, coordinate a fix, and decide whether a GitHub Security Advisory, release note, or public issue is appropriate after the risk is mitigated.

## Safe Research Boundaries

When researching a potential vulnerability:

- Use your own local projects, disposable test apps, or the repository's showcase app.
- Do not target third-party systems without permission.
- Do not attempt data exfiltration beyond what is needed to prove impact.
- Do not leave persistent resources behind; when possible, use the harness cleanup and reseed paths so created resources remain bounded by an Ownership Ledger.
- Do not publish exploit details before maintainers have had a reasonable chance to respond.
