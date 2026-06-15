# Mini Program Release Guide

## 1. Baota/GitHub Deployment Is Not Mini Program Release

Deploying H5/admin static files to Baota and deploying backend API do not publish the WeChat Mini Program.

Mini Program release requires either:

- WeChat DevTools upload for experience version and submission.
- `miniprogram-ci` preview/upload with a valid appid and private key.

The WeChat public platform review and release steps still require manual confirmation.

## 2. Recommended Manual Experience Version Flow

1. Build Mini Program:

   ```bash
   pnpm build:user:mp-weixin
   ```

2. Open WeChat DevTools.
3. Import `apps/user/dist/build/mp-weixin`.
4. Confirm the appid is correct in the DevTools project settings.
5. Compile and preview locally.
6. Upload as experience version.
7. Share the experience QR code for QA.

## 3. Mini Program Pre-Release Checklist

- Legal request domains are configured in WeChat public platform.
- WeChat Pay callback domain is configured for the production API.
- Mini Program appid is correct.
- Experience QR code opens on a real device.
- Homepage opens.
- Conference detail opens.
- Registration form renders dynamic fields.
- Quote request returns display-only amount.
- Order creation succeeds.
- WeChat profile authorization prompt is understandable.
- Payment entry appears according to environment configuration.
- Payment result page handles success, pending, failure, and cancellation.
- My registrations displays confirmed records after successful payment.
- Custom CMS page renders and unsupported components are hidden.
- Member, mall, and cart pages show gray-state or future-open copy clearly.

## 4. `miniprogram-ci` Template

Example script:

```bash
scripts/miniprogram/upload-preview.example.js
```

Required environment variables:

- `MP_APPID`
- `MP_PRIVATE_KEY_PATH`
- `MP_PROJECT_PATH`
- `MP_VERSION`
- `MP_DESC`

Optional environment variables:

- `MP_CI_MODE=preview|upload`
- `MP_CONFIRM_UPLOAD=YES` for upload mode only
- `MP_QRCODE_FORMAT`
- `MP_QRCODE_OUTPUT`

Default recommendation: run preview first. Upload mode must be manually confirmed.

## 5. Private Key Rules

- Do not commit the Mini Program private key.
- Do not paste the private key into docs, logs, screenshots, or test snapshots.
- In GitHub Actions, store the key only in `MP_PRIVATE_KEY`.
- In local use, store the key outside the repository, for example under a private operator directory.
- Delete temporary key files after CI jobs.

## 6. IP Allowlist

If the Mini Program platform enables IP allowlist for CI uploads, configure the CI runner outbound IP.

For GitHub-hosted runners, outbound IPs may change. In that case:

- Prefer manual WeChat DevTools upload, or
- Use a self-hosted runner with a stable outbound IP, or
- Update the allowlist before running the workflow.

## 7. GitHub Actions Preview Plan

Workflow:

```bash
.github/workflows/miniprogram-preview.manual.yml
```

Behavior:

- Manual `workflow_dispatch` only.
- No push trigger.
- Default `run_mode` is `dry-run`.
- `dry-run` builds `mp-weixin` but does not run `miniprogram-ci`.
- `preview` writes the private key from GitHub Secrets to a temporary file and runs the template script.
- `upload` requires `confirm_upload=true` and should be enabled only after human review.

Required GitHub Secrets for preview/upload:

- `MP_APPID`
- `MP_PRIVATE_KEY`

Do not store real appid or private key in the workflow file.

## 8. Later Automation Conditions

Before enabling routine CI preview or upload:

- Confirm appid and request domains.
- Confirm production API and payment callback domains.
- Confirm private key storage and cleanup.
- Confirm whether IP allowlist applies.
- Confirm experience version QA checklist ownership.
- Confirm upload mode does not replace required WeChat public platform review.
