# kundenportal-demo

A reference implementation of a **multi-utility customer portal** (electricity, gas, water,
internet, mobile) that migrates the customers of an acquired provider into a modern,
cloud-native portal.

It is a portfolio project that demonstrates, in one coherent system:

- **Frontend:** React, Next.js (App Router, server-side rendering), micro-frontends
  (Next.js multi-zones), a shared component library, German/English UI
- **Identity:** OAuth 2.0 / OpenID Connect with Amazon Cognito (provider-agnostic code, so
  Auth0 or any other OIDC provider can be swapped in) — registration, onboarding, logged-in
  journey, lazy migration from a self-hosted Keycloak, bulk migration, account linking
- **AWS serverless:** Lambda, DynamoDB, API Gateway (HTTP API), S3, CloudFront,
  EventBridge, SQS, SNS
- **Infrastructure as code:** AWS CDK (application incl. Cognito) and Terraform (foundation:
  OIDC trust for CI, budgets, and later the Keycloak configuration)
- **Delivery:** GitHub Actions with OIDC (no long-lived AWS keys)

> Status: phase 1 (foundation and first end-to-end slice) is live at
> https://kundenportal-demo.rypox.com — sign-in via Amazon Cognito, account page from the
> REST API, and a welcome message delivered through EventBridge and SQS within seconds.

## Documentation

The concept, decisions and research are written in German:

- Markdown wiki (source): [`docs/wiki/`](docs/wiki/)
- Rendered reports: https://janpfeil.github.io/kundenportal-demo/ (source [`docs/reports/`](docs/reports/), published by the `Pages` workflow)

## Repository layout

| Path                    | Content                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `apps/shell`            | Next.js shell zone: start page, OIDC sign-in (BFF), account, demo mailbox     |
| `packages/api-contract` | OpenAPI contract, typed client, routes and scopes for the gateway             |
| `packages/events`       | domain event envelope and schemas (zod)                                       |
| `packages/service-kit`  | shared Lambda helpers: routing, problem details, caller from JWT              |
| `services/customer`     | `GET/PATCH /me`, publishes `CustomerRegistered`                               |
| `services/notification` | SQS consumer with DLQ, demo mailbox API, owner hints via SNS                  |
| `services/identity`     | Cognito triggers (access token claims)                                        |
| `infra/cdk`             | AWS CDK application in four stacks (certificate, base, app, edge)             |
| `infra/terraform`       | foundation: OIDC trust for CI, budget, SSM (run by a private GitLab pipeline) |
| `tests/e2e`             | Playwright run of the first slice against the live portal                     |
| `docs/`                 | wiki and reports                                                              |

## Development

Requirements: Node.js 26 (see `.nvmrc`) and Corepack (`npm i -g corepack`, no longer bundled
with Node.js). Lambda functions run on Node.js 24, the newest runtime AWS Lambda offers.

```sh
npm i -g corepack && corepack enable
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # build includes `cdk synth`
```

## Delivery

| What                           | Tool      | Runs in                            | AWS access                   |
| ------------------------------ | --------- | ---------------------------------- | ---------------------------- |
| Application (`infra/cdk`)      | CDK       | GitHub Actions (`deploy.yml`)      | OIDC role, environment gated |
| Teardown, DLQ probe, live E2E  | CDK, CLI  | GitHub Actions (manual workflows)  | same OIDC role               |
| Foundation (`infra/terraform`) | Terraform | private GitLab pipeline (platform) | OIDC role of the GitLab CI   |

Deploy and teardown run unattended through `scripts/deploy.sh` and `scripts/teardown.sh`,
from GitHub Actions or locally. The application is split into four stacks:

| Stack                     | Content                                             | Lifetime                          |
| ------------------------- | --------------------------------------------------- | --------------------------------- |
| `KundenportalCertificate` | TLS certificate for CloudFront (us-east-1)          | long-lived                        |
| `KundenportalBase`        | Cognito, DynamoDB, owner notification topic         | long-lived (users and data stay)  |
| `KundenportalApp`         | services, Next.js shell, HTTP API, EventBridge, SQS | removed when the demo is paused   |
| `KundenportalEdge`        | CloudFront and static files                         | long-lived (domain never changes) |

The stacks exchange values through SSM parameters rather than CloudFormation exports, so the
app stack can be removed and rebuilt at any time; the edge is then re-pointed at the new
origins. There are no long-lived AWS access keys anywhere. The owner's manual steps are described in
the (German) wiki: `docs/wiki/anleitung-kontoinhaber.md` and the pages linked there.

## Version policy

All runtimes, frameworks and tools use their **newest stable release**. Deliberate exceptions,
each re-checked on every dependency update:

| Component             | Used | Newest stable | Reason                                                   |
| --------------------- | ---- | ------------- | -------------------------------------------------------- |
| Node.js in AWS Lambda | 24   | 26            | Lambda offers `nodejs24.x` as its newest Node.js runtime |
| TypeScript            | 6.0  | 7.0           | `typescript-eslint` 8.x supports TypeScript `<6.1` only  |

## License

[MIT](LICENSE)
