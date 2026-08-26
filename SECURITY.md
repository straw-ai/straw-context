# Security Policy

## Supported versions

Straw Context is currently an unreleased technical preview. No version receives a formal security-support guarantee yet. Security fixes will be applied to the latest `main` branch until a public release policy is established.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Do not open a public issue containing exploit details, credentials, private prompts, customer data, or production traces.

Include:

- the affected package and API;
- reproduction steps using synthetic data;
- expected and observed behavior;
- potential impact;
- any suggested mitigation.

If private vulnerability reporting is unavailable, contact the repository maintainers without including sensitive reproduction data and request a secure reporting channel.

## Scope and security boundaries

Straw Context performs deterministic development and CI checks. It is not a complete data-loss prevention, PII classification, prompt-injection defense, sandbox, authorization system, or production security gateway.

In particular:

- Secret detection covers a deliberately narrow set of high-confidence patterns and may produce false negatives.
- Baselines omit raw values but contain non-cryptographic fingerprints and metadata; they are not anonymized artifacts.
- Provider capture wrappers expose the raw request to application-provided callbacks in memory.
- Fixture writers persist exactly what the required sanitizer returns. Applications remain responsible for deciding what is safe to store.

Never use Straw Context as the only control protecting sensitive data or privileged tools.
