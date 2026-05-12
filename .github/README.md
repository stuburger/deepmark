# GitHub Actions — DeepMark CI/CD

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `deploy-main.yml` | `push` to `main` | typecheck + lint → deploy `development` → deploy `production` |
| `deploy-preview.yml` | PR `opened` / `synchronize` | typecheck + lint → deploy `pr-<n>-<slug>` → comment URLs on the PR |
| `cleanup-preview.yml` | PR `closed` (merged or not) | `sst remove` the PR stage (drops the Neon branch too) |
| `deploy-stage.yml` | reusable (called by the above) | OIDC auth → prisma generate → `sst deploy --stage=<x>` |

Production is gated behind a successful `development` deploy on `main`.
Preview deploys do not block PR merges — wire branch protection separately
if that's wanted.

## One-time AWS setup

```bash
AWS_PROFILE=deepmark ./scripts/ci/setup-github-actions-iam.sh
```

Creates the OIDC provider, the `github-actions` IAM role with trust scoped
to `repo:stuburger/deepmark:*`, and attaches `AdministratorAccess`. Idempotent.

SST/Pulumi touch a wide surface (S3, ECS, IAM, Lambda, CloudFront, Route53,
SQS, SSM, …). Scoping the policy down is a follow-up — do it after a clean
deploy so the perm set is observable, not guessed.

## Required GitHub repo secrets

Set at <https://github.com/stuburger/deepmark/settings/secrets/actions>:

| Secret | Value |
|---|---|
| `AWS_ACCOUNT_ID` | the AWS account hosting the `deepmark` resources |
| `NEON_API_KEY` | from Neon dashboard — used by the Pulumi `neon` provider |
| `NEON_ORG_ID` | `org-ancient-mud-15177616` |
| `NEON_PROJECT_ID` | `snowy-bar-65699801` |
| `STRIPE_SECRET_KEY_LIVE` | `sk_live_…` — only used by the production deploy job |
| `STRIPE_SECRET_KEY_TEST` | `sk_test_…` — used by dev + every PR stage |

`sst.config.ts` hard-fails synth if the wrong Stripe key shape reaches the
wrong stage (live key on a non-prod stage, or vice versa), so a misset
secret breaks the deploy loudly instead of silently writing test price IDs
into prod config.

## SST runtime secrets (`sst secret set`)

GitHub only carries Pulumi-provider/synth-time secrets. Anything the app
reads via `Resource.X.value` at runtime (Gemini, Cloud Vision, Anthropic,
Google/Microsoft OAuth, the collab service shared secret, VAPID keys,
Stripe webhook secret …) is managed via:

```bash
AWS_PROFILE=deepmark bunx sst secret set <Name> <value> --stage=<stage>
```

Per-stage. A fresh PR stage will deploy with the SST-secret defaults
(empty) for anything not yet set — fine for stages that don't exercise
those code paths, but expect runtime errors if a PR's feature touches
Gemini/Stripe webhooks/etc. on a stage where the secret hasn't been seeded.
The clean fix is to copy secrets from `development` after the PR stage is
first created — `sst secret list --stage=development` then re-`set` on the
PR stage.

## Local dev is unaffected

Stuart runs `AWS_PROFILE=deepmark npx sst dev` on the `stuartbourhill`
stage. CI never touches that stage. The `development` stage is owned by
CI from now on — don't run `sst dev --stage=development` locally or it
will race the workflow's deploy lock.
