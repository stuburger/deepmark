#!/usr/bin/env bash
#
# One-time setup: provision the AWS-side trust for GitHub Actions OIDC.
#
# What this creates:
#   1. The token.actions.githubusercontent.com OIDC provider (idempotent —
#      skipped if it already exists in the account).
#   2. An IAM role `github-actions` whose trust policy only accepts tokens
#      from the stuburger/deepmark repository. Workflows assume this role
#      via aws-actions/configure-aws-credentials@v4.
#   3. AdministratorAccess attached to that role. SST/Pulumi need broad
#      perms across S3, ECS, IAM, Lambda, CloudFront, Route53, SQS, etc. —
#      scoping that down requires running a deploy first and harvesting the
#      actual perms used. Do that once the pipeline is green; not before.
#
# Run once per AWS account, locally, with the deepmark profile that owns
# the account (NOT via CI). Re-running is safe.
#
# Prereqs: aws cli, jq, AWS_PROFILE=deepmark configured.

set -euo pipefail

REPO="stuburger/deepmark"
ROLE_NAME="github-actions"
PROFILE="${AWS_PROFILE:-deepmark}"

ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
echo "→ Target account: $ACCOUNT_ID (profile: $PROFILE)"

OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "→ Ensuring OIDC provider exists…"
if aws iam get-open-id-connect-provider --profile "$PROFILE" --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "  already present: $OIDC_ARN"
else
  # The thumbprint is a documented constant for GitHub's OIDC issuer; AWS
  # ignores it for github.com but the API still requires the field.
  aws iam create-open-id-connect-provider \
    --profile "$PROFILE" \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    >/dev/null
  echo "  created: $OIDC_ARN"
fi

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:*"
        }
      }
    }
  ]
}
EOF
)

echo "→ Ensuring IAM role '$ROLE_NAME' exists…"
if aws iam get-role --profile "$PROFILE" --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "  role exists — updating trust policy"
  aws iam update-assume-role-policy \
    --profile "$PROFILE" \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY" \
    >/dev/null
else
  aws iam create-role \
    --profile "$PROFILE" \
    --role-name "$ROLE_NAME" \
    --description "Assumed by GitHub Actions in ${REPO} for SST deploys" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --max-session-duration 3600 \
    >/dev/null
  echo "  created role: $ROLE_NAME"
fi

echo "→ Attaching AdministratorAccess…"
aws iam attach-role-policy \
  --profile "$PROFILE" \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" \
  >/dev/null

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo ""
echo "Done."
echo ""
echo "Role ARN: $ROLE_ARN"
echo ""
echo "Next: set GitHub Actions secrets at"
echo "  https://github.com/${REPO}/settings/secrets/actions"
echo ""
echo "Required secrets:"
echo "  AWS_ACCOUNT_ID            = ${ACCOUNT_ID}"
echo "  NEON_API_KEY              = (from Neon dashboard)"
echo "  NEON_ORG_ID               = org-ancient-mud-15177616"
echo "  NEON_PROJECT_ID           = snowy-bar-65699801"
echo "  STRIPE_SECRET_KEY_LIVE    = sk_live_…   (production only)"
echo "  STRIPE_SECRET_KEY_TEST    = sk_test_…   (dev + PR stages)"
