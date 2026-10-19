# Academic Certificate Verification

A Solidity academic project with a browser interface, Express API, and PostgreSQL database. The contract stores a SHA-256 fingerprint of each issued PDF; verification checks the exact file against the blockchain.

## Run from VS Code

In the project-root terminal:

```sh
npm run dev:local
```

Open **http://localhost:5000**. Keep the terminal running. The launcher compiles the contract/backend, creates missing database tables, ensures the configured admin exists, starts a local Hardhat node if needed, and deploys/authorizes the issuer if the configured contract is absent. It updates only `CONTRACT_ADDRESS` in `backend/.env` when deploying. Existing admin passwords and database records are preserved.

Sign in with your existing admin account. For a new installation, the account comes from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`. Do not share this file.

**Local Hardhat is temporary:** restarting its node loses blockchain records. PDFs and PostgreSQL records remain but cannot verify against a fresh chain. Keep the node running during a demonstration. The application never deletes old database records automatically.

## Basic features

- Public document verification: VALID, INVALID (unregistered or altered), and REVOKED.
- Public hash lookup and on-chain issuance/revocation history.
- Login with ADMIN, ISSUER, and VERIFIER roles.
- Admin/issuer PDF issuance, certificate register, and authenticated downloads.
- Admin-only revocation, staff creation, and blockchain issuer authorization/removal.
- Recovery after a confirmed issuance fails to save metadata: retry the same PDF and ID.
- Real database/blockchain health checks and automated contract/API tests.

The baseline represents **one institution with a server-managed issuer wallet**. Staff accounts share that wallet through role-protected endpoints; they do not each have independent blockchain identities. Verifying a fingerprint confirms registration and revocation status, not the truth of the document's academic claims. Unique features and multi-institution wallets are left for the next stage.

## Fresh installation

Prerequisites: a supported Node.js version (22.13+), npm, and a running PostgreSQL server.

```sh
npm ci
npm --prefix backend ci
```

1. Create a PostgreSQL database, e.g. `certificate_verification`.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
3. Set a random `JWT_SECRET`, admin name/email, and a password of at least 8 characters (maximum 72 UTF-8 bytes).
4. Run `npm run chain` to see local Hardhat development accounts. Put the first two development keys into `OWNER_PRIVATE_KEY` and `ISSUER_PRIVATE_KEY`. These publicly known keys are only for local development, never live funds.
5. Set `BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`; leave `CONTRACT_ADDRESS` empty for first deployment.
6. Run `npm run dev:local`.

Database setup creates missing tables, preserving existing records. It is not a migration engine for arbitrary schemas; the included schema matches this project's existing tables.

## Demonstration

1. Sign in as admin; check the issuer address in Administration.
2. Issue a final PDF using a unique ID such as `ACV-2026-001`.
3. Verify the original PDF: VALID.
4. Verify an edited copy: INVALID.
5. Copy its document hash into Find a record to inspect the on-chain details and history.
6. Revoke that hash as admin; verify the original again: REVOKED.
7. Create an ISSUER account to demonstrate that issuers can issue/download but cannot revoke certificates or manage accounts/wallets.

Verification uploads are processed in memory and not saved. Issuance accepts a PDF header and a maximum 10 MB file; it does not validate academic content. Original PDFs are stored privately and require an admin/issuer login to download.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:local` | Build, set up and start the complete local app |
| `npm run chain` | Run the local chain separately |
| `npm run deploy:local` | Deploy locally and authorize the configured issuer |
| `npm run db:setup` | Create missing database tables |
| `npm --prefix backend run create-admin` | Create the configured admin if absent |
| `npm run build` | Compile Solidity |
| `npm run sync:abi` | Update the backend ABI after compiling the contract |
| `npm run typecheck` | Typecheck blockchain scripts/tests |
| `npm run build:api` | Compile backend TypeScript |
| `npm start` | Start the compiled backend and browser interface |
| `npm test` | Run contract tests |
| `npm run test:api` | Run real API/database/blockchain integration tests |

API tests start their own local chain on port 18546, deploy a separate contract, and use a randomly named PostgreSQL schema and temporary upload directory. They clean up afterward without touching application tables/PDFs. The database user needs CREATE SCHEMA permission. `TEST_RPC_URL` optionally selects another disposable local Hardhat chain.

If compiler downloads/cache are unavailable, set optional `SOLC_PATH` to an installed **Solidity 0.8.34** native compiler or soljson file. Always compile before typechecking generated contract types.

## API

| Endpoint | Access |
| --- | --- |
| `POST /api/auth/login` | Public |
| `GET /api/auth/me` | Signed in |
| `POST /api/auth/users` | ADMIN |
| `POST /api/certificates/issue` | ADMIN / ISSUER; multipart `certificate`, `certificateId` |
| `POST /api/certificates/verify` | Public; multipart `certificate` |
| `GET /api/certificates` | ADMIN / ISSUER; latest 100 saved records |
| `GET /api/certificates/:hash` | Public; current on-chain status |
| `GET /api/certificates/:hash/download` | ADMIN / ISSUER |
| `GET /api/certificates/audit/:hash` | Public |
| `POST /api/certificates/revoke` | ADMIN; JSON `certificateHash` |
| `POST /api/issuers/register` and `/remove` | ADMIN; JSON `issuerAddress` |
| `GET /api/issuers/:address` | ADMIN |
| `GET /api/health` | 200 if database/contract respond, otherwise 503 |

Authenticated calls use `Authorization: Bearer <token>`. Tokens expire after eight hours; the UI uses session storage. All verification results come from the configured contract.

## Structure

- `contracts/`: Solidity contract.
- `test/`: contract tests.
- `scripts/`: local startup, deployment, ABI synchronization.
- `backend/src/`: API, authentication, blockchain/database services.
- `backend/public/`: HTML/CSS/JavaScript interface.
- `backend/sql/schema.sql`: PostgreSQL table definitions.
- `backend/test/`: integration tests.
- `backend/uploads/`: private certificate PDFs, ignored by Git.

This is a local academic baseline, not a hosted production service.
