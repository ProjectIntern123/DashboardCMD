# Archived Scripts

This directory contains legacy and obsolete utility scripts removed from active operational use in the HARTEK Group CMD Office Command Center repository.

## Safety Notice

> [!CAUTION]
> **DO NOT EXECUTE THESE SCRIPTS AGAINST ANY PRODUCTION OR STAGING DATABASE.**
> Several scripts in this directory contain un-guarded, unconditional database truncation and deletion logic (`deleteMany({})`).

### Catalog of Archived Scripts:
- `clear-db.js`: Contains unconditional deletion calls against transactional database tables. Obsolete and schema-incompatible.
- `e2e-qa-test.js`: Legacy ad-hoc testing script with hardcoded credentials and destructive cleanup in its `finally` block. Fully superseded by isolated Jest E2E test suites in `backend/test/`.
- `pack-zip.js`: Legacy Windows-only zip packaging script referencing obsolete documentation files. Superseded by standard Git release pipelines.
