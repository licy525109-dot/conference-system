# September 22 Follow-up Release

## Scope

- Compact conference rows, unread-only homepage notices, personal profile action
  layout, renamed attendance entry and private attendee invitation links.
- Directed coupon delivery to existing accounts or verified-phone invitations.
- Serial columns on all 89 admin tables and server-side order pagination.

Feature-level verification and limitations are recorded in the three adjacent
QA documents. Their NOT DEPLOYED statements describe the earlier local milestone;
the release outcome must be verified independently from GitHub and production.

## Preflight

- PASS: workspace typecheck and lint.
- PASS: workspace tests: API 458, user 66, shared 13 and runtime package checks.
- PASS: 52 focused frontend checks and 11 Playwright browser regressions.
- PASS: API, admin, H5 and Mini Program production builds.
- PASS: Prisma schema validation and admin permission scan (316 controller
  permission references).
- PASS: diff whitespace check. Generated output and local credentials excluded.
- Mini Program main package: 1619.98 KiB before WeChat's upload packaging.
- Real database coupon integration was verified in the isolated local cluster
  during feature development; production is not a test database.

The first native WeChat upload check rejected a compact-list WXSS selector.
Metadata icons now use an explicit class wrapper, and keyboard focus styling
is limited to H5. Native compilation/upload must be repeated for this fix;
ordinary uni-app builds alone do not establish WXSS compatibility.

## Deployment Order

1. Merge the reviewed batch to main only after Pull Request Quality succeeds.
2. The production workflow backs up the database, environment and static sites,
   builds assets, applies the additive coupon migration, immediately restarts
   the API, then publishes admin/H5 assets and performs health checks.
3. Verify the deployed revision, migration, public endpoints and protected
   routes without mutating guest records or sending real messages.
4. Upload the production Mini Program build. Upload is not review approval or
   publication. Verify platform status before claiming it is publicly available.
5. Publish the compatible Mini Program before distributing new token-based
   coupon invitation links to guests.

## Safety and Rollback

- Preserve the existing WeChat credentials, encryption key and rollout flags.
- Do not delete test-labelled records or alter registrations as part of release.
- The migration is additive, but new directed claims have no campaign ID.
  After such claims exist, do not roll back to an API that requires campaign IDs.
  Prefer a forward fix; never restore an old database over new transactions.
- Native iOS/Android authorization and invitation opening remain device
  acceptance items. Automated browser tests are not real-device acceptance.
