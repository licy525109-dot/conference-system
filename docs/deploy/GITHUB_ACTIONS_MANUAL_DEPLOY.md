# GitHub Actions Deploy Guide

## 1. Current Deploy Policy

Current policy after the Baota auto-deploy upgrade:

- Push to `main` runs production deployment automatically through `Deploy Baota Production`.
- `workflow_dispatch` remains available for manual redeploy.
- GitHub Actions only SSHes to the server and runs the server-side deploy script.
- Production `.env.production`, database credentials, WeChat Pay certificates, and WeCom secrets stay on the server.

Workflows:

- `.github/workflows/deploy-baota.yml`
- `.github/workflows/deploy-baota.manual.yml`
- `.github/workflows/miniprogram-preview.manual.yml`

`deploy-baota.manual.yml` is retained as a compatibility manual entry. Prefer `Deploy Baota Production` for current production deployment.

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

Before enabling automatic deployment from `main`:

1. Confirm GitHub Secrets are configured.
2. Confirm the server project path exists:

   ```bash
   /www/wwwroot/conference-system
   ```

3. Confirm the server can pull GitHub:

   ```bash
   cd /www/wwwroot/conference-system
   git fetch origin
   ```

4. Confirm the production env and Docker Compose file exist:

   ```bash
   test -f /www/wwwroot/conference-system/.env.production
   test -f /www/wwwroot/conference-system/docker-compose.prod.yml
   ```

5. Confirm API health before deployment:

   ```bash
   curl http://127.0.0.1:3001/api/health
   ```

6. Push to `main` or trigger `Deploy Baota Production` manually.

Before running `Manual Mini Program Preview`:

1. Confirm `pnpm build:user:mp-weixin` passes locally or in CI dry-run.
2. Confirm legal request domains and payment callback domains in WeChat public platform.
3. Configure `MP_APPID` and `MP_PRIVATE_KEY` in GitHub Secrets.
4. Start with `run_mode=dry-run`.
5. Move to `run_mode=preview` only after dry-run passes.
6. Use `run_mode=upload` only after human approval and `confirm_upload=true`.

## 4. Failure and Rollback

If Baota deployment fails before static publishing:

- Check workflow logs.
- Check SSH connectivity and required Secrets.
- Check whether `/www/wwwroot/conference-system/scripts/deploy/baota-deploy.sh` exists after pull.
- No server rollback may be needed if static files were not updated.

If deployment fails after static publishing:

- Use the backup directory printed by `scripts/deploy/baota-deploy.sh`.
- Restore `admin-static` using `docs/deploy/AUTO_DEPLOY_BAOTA.md`.
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
- Remove or disable `/www/wwwroot/conference-system/scripts/deploy/baota-deploy.sh` on the server.

To pause automatic production deploy, disable `.github/workflows/deploy-baota.yml` in GitHub Actions or remove one required Secret.

## 6. Why Manual Review Remains Required

This project contains payment, registration, user data, and production deployment concerns.

Review still matters because:

- Frontend-only changes and backend/API changes have different deployment risk.
- Prisma migrations require database backup and manual rollback planning.
- WeChat Pay prepay/notify and amount calculation must not be changed casually.
- Mini Program publishing still depends on WeChat platform settings and human review.
- Secrets are server/GitHub assets and must not be printed or copied into logs.

## 7. Deploy Workflow Behavior

`deploy-baota.yml`:

- Does not check out or build code on GitHub runner.
- Connects to the server over SSH.
- Bootstraps the latest `main` on the server so the repo deploy script is current.
- Runs `scripts/deploy/baota-deploy.sh` on the server.
- Does not require interactive input.
- Fails clearly if required secrets or the server deploy script are missing.
- Does not contain real server host, username, SSH key, production env content, or database credentials.

`miniprogram-preview.manual.yml`:

- Checks out code.
- Installs dependencies.
- Builds `mp-weixin`.
- Defaults to dry-run.
- Writes the Mini Program private key to a temporary file only for preview/upload.
- Removes the temporary private key at the end.
