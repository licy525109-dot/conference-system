# Environment and Secrets Policy

## 1. `.env.example`

`.env.example` may contain only:

- Mock values
- Placeholder values
- Non-secret documentation defaults

It must not contain production domains, real appids, API keys, certificates, private keys, JWT secrets, database passwords, merchant keys, or access tokens.

## 2. Production Env Location

The real production env file is server-only:

```bash
/www/wwwroot/conference-system/.env.production
```

It is loaded by:

```bash
/www/wwwroot/conference-system/start-api.sh
```

Do not create, modify, print, or commit the real production env from Codex tasks unless a human operator explicitly handles it on the server outside Git.

## 3. Secrets That Must Never Be Committed

- WeChat AppSecret
- WeChat Pay API v3 key
- WeChat merchant private key
- WeChat certificates
- Mini Program private key
- `JWT_SECRET`
- Database passwords
- Redis passwords
- GitHub tokens
- SSH private keys
- Any `.pem`, `.key`, `.p12`, `.crt` file

## 4. If a Real Secret Enters Git History

Treat it as compromised:

1. Rotate or revoke the secret immediately.
2. Replace the production secret on the server.
3. Review logs and deployment artifacts.
4. Remove the secret from the repository history if required by security policy.
5. Do not rely only on deleting the latest commit.

## 5. Codex Handling Rules

Codex must not:

- Read real production env files.
- Print secret values.
- Commit secret values.
- Add secret values to docs, tests, workflow files, logs, or snapshots.
- Copy server-only files into the repository.

Codex may:

- Add placeholder examples.
- Update `.env.example` with placeholder keys when a new environment variable is required.
- Document manual operator steps.

## 6. Adding New Environment Variables

When a new key is required:

1. Add only a placeholder to `.env.example`.
2. Document the key, purpose, and safe example value.
3. Add the real value manually on the server or in GitHub Secrets.
4. List the key in the PR description under manual configuration.

Do not change runtime behavior to rely on an undocumented secret.

## 7. GitHub Secrets Naming

Baota manual deploy:

- `BAOTA_HOST`
- `BAOTA_PORT`
- `BAOTA_USER`
- `BAOTA_SSH_KEY`

Mini Program preview/upload:

- `MP_APPID`
- `MP_PRIVATE_KEY`
- `MP_VERSION` if managed as a secret or variable
- `MP_DESC` if managed as a secret or variable

Use repository-level GitHub Secrets unless organization policy requires environment-level secrets.

## 8. Baota Server Secrets

Keep server secrets in:

- `/www/wwwroot/conference-system/.env.production`
- Server-only service configuration managed by the operator
- Baota or PM2 process configuration when needed

Permissions should be restricted to the deploy/runtime user. Do not rsync local env files to the server.

## 9. Mini Program Private Key Storage

Allowed storage:

- GitHub Secret `MP_PRIVATE_KEY`
- Local operator private directory outside the repository
- CI temporary file written during a job and removed at the end

Not allowed:

- Repository files
- Docs
- Screenshots
- Logs
- Test snapshots
- Chat messages

## 10. Production API Port Reminder

The conference API listens on `3001`. Port `3000` is `certificate-site`.

Do not add secrets or deployment scripts that assume `3000` is the conference API.
