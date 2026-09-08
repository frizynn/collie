# Security policy

Nenu is a remote-control surface for live terminal sessions. A security defect can expose pane
content or allow commands to run with the host user's permissions.

## Supported versions

Security fixes are provided for the latest published minor version and the current `main` branch.
Older minors should be upgraded before support is requested.

| Version | Supported |
| --- | --- |
| Latest `0.x` release | Yes |
| `main` | Development fixes |
| Older releases | No |

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/frizynn/nenu/security/advisories/new).
Do not open a public issue, discussion, or pull request for an undisclosed vulnerability.

Include only what is needed to reproduce the problem:

- affected Nenu version and commit;
- host OS, browser, deployment variant, and Herdr version;
- security boundary that was crossed;
- minimal reproduction steps and expected behavior; and
- a proposed fix, if you have one.

Redact credentials, private source code, terminal output, tailnet names, device identifiers, and real
filesystem paths. Do not test against systems or users you do not own or have permission to assess.

The maintainer aims to acknowledge reports within three business days and provide an initial
assessment within seven. Timing for a fix and disclosure depends on severity and complexity. Credit
is offered unless the reporter prefers to remain anonymous.

## Security boundaries

The following are intentional and are not vulnerabilities by themselves:

- an authorized device can read panes and send arbitrary terminal input;
- Nenu runs with the permissions of the user who started the bridge;
- the idle lock pauses the local UI but is not an authentication boundary; and
- Nenu relies on the configured Tailscale or reverse-proxy boundary for remote identity.

Reports are especially useful for authentication bypasses, cross-origin writes, path traversal,
unsafe file preview, unintended public exposure, secret leakage, or input being delivered to a pane
other than the one the operator approved.

See the [deployment security model](DEPLOYMENT.md) and [architecture](ARCHITECTURE.md#6-security-model)
for the complete trust boundaries.
