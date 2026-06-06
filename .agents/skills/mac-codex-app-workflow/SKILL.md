---
name: mac-codex-app-workflow
description: Use this skill when working in Codex App on macOS, including Local vs Worktree choice, integrated terminal, project trust, actions, setup scripts, and safe review workflow.
---

# Mac Codex App Workflow

## When to use

Use this skill for tasks that mention Mac, Codex App, Worktree, Local, integrated terminal, project setup, local environment actions, or app permissions.

## Workflow

1. Start read-only when opening a project for the first time.
2. Use Local for initial setup and manual verification.
3. Use Worktree for feature implementation after Git is initialized.
4. Keep changes small and review diffs before handoff.
5. Use integrated terminal to run pnpm, docker, prisma, and tests.
6. Do not request danger-full-access for ordinary project edits.
7. If dependency install needs network, ask the user before changing network access.

## Mac-specific guidance

- Prefer project folder under ~/Projects.
- Avoid Desktop/Downloads for code projects because macOS may prompt for additional permissions.
- Use Docker Desktop for PostgreSQL and Redis.
- Use WeChat Developer Tools only for mini program preview/build verification.
- Use Computer Use only when GUI verification is required.
