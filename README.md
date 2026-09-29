# kundenportal-demo

A reference implementation of a **multi-utility customer portal** (electricity, gas, water,
internet, mobile) that migrates the customers of an acquired provider into a modern,
cloud-native portal.

It is a portfolio project that demonstrates, in one coherent system:

- **Frontend:** React, Next.js (App Router, server-side rendering), micro-frontends
  (Next.js multi-zones), a shared component library, German/English UI
- **Identity:** Auth0 / OAuth 2.0 — registration, onboarding, logged-in journey, lazy and
  bulk migration of legacy accounts, account linking
- **AWS serverless:** Lambda, DynamoDB, API Gateway (HTTP API), S3, CloudFront,
  EventBridge, SQS, SNS
- **Infrastructure as code:** AWS CDK (application) and Terraform (platform: Auth0, OIDC
  trust, budgets)
- **Delivery:** GitHub Actions with OIDC (no long-lived AWS keys)

> Status: phase 1 (foundation and first end-to-end slice) is in progress.

## Documentation

The concept, decisions and research are written in German:

- Markdown wiki (source): [`docs/wiki/`](docs/wiki/)
- Rendered reports: [`docs/reports/`](docs/reports/) (published via GitHub Pages)

## Repository layout

| Path              | Content                                                       |
| ----------------- | ------------------------------------------------------------- |
| `apps/*`          | Next.js zones (shell, contracts, consumption, cockpit, admin) |
| `packages/*`      | component library, API contract (OpenAPI), event schemas      |
| `services/*`      | Lambda services per domain                                    |
| `infra/cdk`       | AWS CDK application                                           |
| `infra/terraform` | platform layer (deployed from a private GitLab pipeline)      |
| `docs/`           | wiki and reports                                              |

## Development

Requirements: Node.js 26 (see `.nvmrc`) and Corepack (`npm i -g corepack`, no longer bundled
with Node.js). Lambda functions run on Node.js 24, the newest runtime AWS Lambda offers.

```sh
npm i -g corepack && corepack enable
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Version policy

All runtimes, frameworks and tools use their **newest stable release**. Deliberate exceptions,
each re-checked on every dependency update:

| Component             | Used | Newest stable | Reason                                                   |
| --------------------- | ---- | ------------- | -------------------------------------------------------- |
| Node.js in AWS Lambda | 24   | 26            | Lambda offers `nodejs24.x` as its newest Node.js runtime |
| TypeScript            | 6.0  | 7.0           | `typescript-eslint` 8.x supports TypeScript `<6.1` only  |

## License

[MIT](LICENSE)
