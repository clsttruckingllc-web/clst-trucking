# Marko account authentication setup

This branch adds the Marko login/sign-up page and server-side authentication foundation. It is intentionally not active on the production site until the database binding and secret are configured and the pull request is reviewed.

## Required Cloudflare Pages configuration

1. Create a Cloudflare D1 database for Marko authentication.
2. In the **clst-trucking** Pages project, add a D1 binding:
   - Variable name: `AUTH_DB`
   - Database: the new Marko authentication database
3. Apply `migrations/0001_mare_auth.sql` to that database.
4. Add encrypted Pages secrets:
   - `AUTH_SESSION_SECRET`: a unique random value of at least 32 bytes.
   - `AUTH_ADMIN_SETUP_KEY`: a separate one-time bootstrap secret you choose and keep private. Enter it in the sign-up form when creating the first admin account.
5. Deploy a preview and verify first sign-up, sign-in, sign-out, and unauthenticated redirects before promoting the change.

Do not put passwords, password hashes, API keys, or the session secret in GitHub source code.

## Account rules

- The first account can receive the `admin` role only when the correct `AUTH_ADMIN_SETUP_KEY` is supplied; this prevents a stranger from claiming the first account.
- A partial unique database index prevents a second admin account.
- After the first administrator is created, public sign-up is closed. The single-owner version does not create additional accounts.
- Passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes, never as plain text.
- Sessions are signed, HttpOnly, Secure, SameSite=Strict cookies and expire after eight hours.
- The role is read from D1 on each authenticated request; it is not trusted from browser storage.

## Important scope

This is a single-owner account gate for the existing Marko application. After the first admin account is claimed, public registration is closed. It does not yet provide additional users, invitations, password reset, separate company tenants, per-company data isolation, or admin user-management screens. Do not advertise multi-company isolation until those controls are implemented and tested.
