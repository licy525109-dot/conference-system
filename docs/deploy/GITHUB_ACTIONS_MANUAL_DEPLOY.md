# GitHub Actions Manual Deploy Guide

## 1. Manual Deploy Only

Current policy:

- Only `workflow_dispatch` manual deployment is allowed.
- `push` to `main` must not automatically deploy.
- A human must review and merge the PR before manually triggering deployment.
- A human must confirm the server script was reviewed before the first run.

Workflows added as release automation presets:

- `.github/workflows/deploy-baota.manual.yml`
- `.github/workflows/miniprogram-preview.manual.yml`

## 2. Required Secrets

Baota deploy workflow:

- `BAOTA_HOST`
- `BAOTA_PORT`
- `BAOTA_USER`
- `BAOTA_SSH_KEY`

Mini Program workflow:

- `MP_APPID`
- `MP_PRIVATE_KEY`

Do not put real secret values in workflow YAML files.

## 3. First Run Checklist

Before running `Manual Baota Deploy`:

1. Review `scripts/deploy/baota-deploy.example.sh`.
2. Preferred: copy the reviewed non-interactive CI script to the server:

   ```bash
   /www/scripts/conference-system-deploy-ci.sh
   ```

   This script must be safe for non-interactive CI use and must not prompt for `deploy`.

3. Fallback: if the CI-specific script is not available, copy the reviewed script to the legacy server path:

   ```bash
   /www/scripts/conference-system-deploy.sh
   ```

   The workflow will run it as `CONFIRM_DEPLOY=YES /www/scripts/conference-system-deploy.sh`.

4. Make the selected server script executable:

   ```bash
   chmod +x /www/scripts/conference-system-deploy-ci.sh
   # or
   chmod +x /www/scripts/conference-system-deploy.sh
   ```

5. Confirm the server script still uses API health check:

   ```bash
   curl http://127.0.0.1:3001/api/health
   ```

6. Configure GitHub Secrets.
7. Trigger the workflow manually. No interactive `deploy` input is required after SSH connects.

Before running `Manual Mini Program Preview`:

1. Confirm `pnpm build:user:mp-weixin` passes locally or in CI dry-run.
2. Confirm legal request domains and payment callback domains in WeChat public platform.
3. Configure `MP_APPID` and `MP_PRIVATE_KEY` in GitHub Secrets.
4. Start with `run_mode=dry-run`.
5. Move to `run_mode=preview` only after dry-run passes.
6. Use `run_mode=upload` only after human approval and `confirm_upload=true`.

## 4. Failure and Rollback

If Baota deployment fails before rsync:

- Check workflow logs.
- Check SSH connectivity and required Secrets.
- Check whether `/www/scripts/conference-system-deploy-ci.sh` exists and is executable.
- If using the fallback path, check whether `/www/scripts/conference-system-deploy.sh` exists and is executable.
- No server rollback may be needed if static files were not updated.

If deployment fails after rsync:

- Use `docs/deploy/BAOTA_RELEASE_GUIDE.md` rollback flow.
- Use `scripts/deploy/baota-rollback.example.sh` only after reviewing and copying it to the server.
- Remember that database migrations are not automatically rolled back.

If Mini Program preview/upload fails:

- Check `MP_APPID`.
- Check private key validity.
- Check whether WeChat CI IP allowlist blocks the runner.
- Try manual upload through WeChat DevTools.

## 5. Disabling Workflows

Options:

- Disable Actions for the repository in GitHub settings.
- Rename workflow files so GitHub no longer detects them.
- Restrict repository Actions permissions.
- Remove required Secrets.
- Remove or disable `/www/scripts/conference-system-deploy-ci.sh` and `/www/scripts/conference-system-deploy.sh` on the server.

Do not add a `push` trigger as a shortcut.

## 6. Why Manual Review Remains Required

This project contains payment, registration, user data, and production deployment concerns.

Manual review remains required because:

- Frontend-only changes and backend/API changes have different deployment risk.
- Prisma migrations require database backup and manual rollback planning.
- WeChat Pay prepay/notify and amount calculation must not be changed casually.
- Mini Program publishing still depends on WeChat platform settings and human review.
- Secrets are server/GitHub assets and should not be exposed to CI unless needed.

## 7. Manual Deploy Workflow Behavior

`deploy-baota.manual.yml`:

- Does not check out or build code on GitHub runner.
- Connects to the server over SSH.
- Prefers `/www/scripts/conference-system-deploy-ci.sh`.
- Falls back to `CONFIRM_DEPLOY=YES /www/scripts/conference-system-deploy.sh`.
- Does not require an interactive `deploy` prompt after SSH connects.
- Fails clearly if neither server script exists or is executable.
- Does not contain real server host, username, SSH key, or deployment commands.

`miniprogram-preview.manual.yml`:

- Checks out code.
- Installs dependencies.
- Builds `mp-weixin`.
- Defaults to dry-run.
- Writes the Mini Program private key to a temporary file only for preview/upload.
- Removes the temporary private key at the end.
