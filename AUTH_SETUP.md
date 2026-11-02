# Marko account authentication setup

This branch adds the Marko login/sign-up page and server-side authentication foundation. It is intentionally not active on the production site until the database binding and secret are configured and the pull request is reviewed.

## Required Cloudflare Pages configuration

1. Create a Cloudflare D1 database for Marko authentication.
2. In the **clst-trucking** Pages project, add a D1 binding:
   - Variable name: `AUTH_DB`
   - Database: the new Marko authentication database
3. Apply `migrations/0001_mare_auth.sql` to that database.
4. Add an encrypted Pages secret named `AUTH_SESSION_SECRET` containing a unique random value of at least 32 bytes.
5. Deploy a preview and verify first sign-up, sign-in, sign-out, and unauthenticated redirects before promoting the change.

Do not put passwords, password hashes, API keys, or the session secret in GitHub source code.

## Account rules

- The first successfully registered account receives the `admin` role.
- A partial unique database index prevents a second admin account.
- Later sign-ups receive the ordinary `user` role.
- Passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes, never as plain text.
- Sessions are signed, HttpOnly, Secure, SameSite=Strict cookies and expire after eight hours.
- The role is read from D1 on each authenticated request; it is not trusted from browser storage.

## Important scope

This is single-workspace account access for the existing Marko application. It does not yet provide separate company tenants, per-company data isolation, invitations, password reset, or admin user-management screens. Do not advertise multi-company isolation until those controls are implemented and tested.
