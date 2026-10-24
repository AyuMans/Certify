# Academic Certificate Verification — demo mode

This college project uses Solidity, Node.js/Express and a simple HTML/CSS/JavaScript page. **Only staff accounts persist. Certificates, PDFs and their blockchain history live in memory and disappear when the backend process stops.**

## Start the demo

From the project-root terminal:

```sh
npm run dev:local
```

Open **http://localhost:5000**. Keep this terminal running during the demo. Stop it with Ctrl+C when finished. Each new backend process starts with zero certificates and a freshly deployed contract. You can reuse the same certificate IDs and PDFs in the next run.

If an older server is already running, stop that process in its VS Code terminal before starting this version. Refresh the page afterward. The UI detects an old backend and asks for a restart.

Existing user accounts and password hashes are kept in PostgreSQL. Sign in with your normal credentials; you do not need to recreate staff accounts for each demonstration. A valid login token can also remain usable while its normal eight-hour expiry and JWT secret are unchanged.

## What is persistent?

| Data | Storage | After stopping the backend |
| --- | --- | --- |
| Staff names, emails, roles and password hashes | PostgreSQL users table | Retained |
| Login-token signing configuration | backend/.env | Retained |
| Issued certificate metadata and academic fields | JavaScript Map | Lost |
| Uploaded PDF bytes | Memory buffers | Lost |
| Solidity records, corrections, revocations and event history | In-process Hardhat development chain | Lost |

No certificate PDF is saved to disk and no certificate rows are inserted into PostgreSQL. On startup the backend also removes the legacy certificates table and old files from its dedicated backend/uploads directory. It does not delete the original files you selected from elsewhere on your computer.

The development blockchain is created **inside the backend process** using Hardhat's isolated simulated network. No external node needs to be started or stopped. This is temporary local demo storage, not a way to erase records from a public blockchain. Separately launched old blockchain nodes are not used by this version.

## Features available during each run

- Exact-file verification: VALID, INVALID, REVOKED or SUPERSEDED.
- Browser-side SHA-256 hashing: only the hash is sent during normal verification.
- Separate comparison of manually entered academic details against their on-chain hash.
- Staff login and ADMIN / ISSUER / VERIFIER permissions.
- Admin/issuer issuance, session certificate list and authenticated PDF downloads.
- Admin corrections linking previous and replacement certificates atomically.
- Revocation and transaction history for the current demo session.

Issuance requires a final PDF, unique certificate ID, student name, roll number, degree/course, department, graduation year and grade/CGPA. IDs and files must be unique within one run; they can be reused after restarting.

Academic-field comparison is independent from file verification. It checks the values entered into that form and does not read PDF text or perform OCR. Matching fields never authenticates an unrelated uploaded PDF. Capitalization and repeated whitespace are normalized, while punctuation and grade formatting remain significant.

## Fresh installation

Requirements: a supported Node.js version, npm, and a running PostgreSQL server.

```sh
npm ci
npm --prefix backend ci
```

Create a PostgreSQL database, copy backend/.env.example to backend/.env, and configure DATABASE_URL, JWT_SECRET and the initial admin's name, email and password. Then run npm run dev:local. The startup script builds Solidity/backend code, creates the users table if absent, ensures the configured admin exists without changing an existing password, and launches the fresh demo backend.

Blockchain RPC URLs, saved contract addresses and private keys are no longer required by the demo server. Older values in an existing .env file are ignored by this runtime. The Solidity contract still runs in an Ethereum-compatible EVM, with development signers supplied by Hardhat.

## Commands

| Command | Purpose |
| --- | --- |
| npm run dev:local | Build and start a fresh complete demo |
| npm start | Start the already-built backend with a new temporary chain/session |
| npm run dev | Run the backend in watch mode; each restart clears certificates |
| npm run build | Compile Solidity |
| npm run sync:abi | Copy the compiled contract ABI into the backend |
| npm run build:api | Compile backend TypeScript |
| npm run typecheck | Typecheck blockchain scripts/tests |
| npm run db:setup | Create the persistent users table if absent |
| npm --prefix backend run create-admin | Create the configured admin if absent |
| npm --prefix backend run reset:certificates | Remove legacy disk/SQL certificate storage, preserving users |
| npm test | Run the 35 contract tests |
| npm run test:api | Run API tests and the real process-restart test |

The reset command removes legacy storage only; a running backend's current in-memory certificates last until that backend stops. Tests use isolated PostgreSQL schemas and do not add test users to the actual users table. The restart test verifies that accounts survive a forced stop while certificate verification, downloads and event history reset and IDs can be reused.

If compiler downloads/cache are unavailable, optional SOLC_PATH may point to an installed Solidity 0.8.34 compiler or soljson file. Compile before typechecking generated contract types.

## Quick demonstration

1. Start the backend and sign in with your existing account.
2. Issue a PDF using a simple ID such as DEMO-001.
3. Verify the original, then an edited copy; compare academic details separately.
4. Correct the certificate with a new ID/PDF and follow its previous/replacement links.
5. Revoke the active version and inspect the current session's event history.
6. Stop the backend, start it again, and refresh the page.
7. Sign in with the same account. The certificate list is empty and DEMO-001 can be issued again.

The browser checks session health every five seconds. If the backend becomes unreachable, it clears displayed certificate results; if the session ID changes, it resets the old forms/results. Network reachability alone cannot prove a process has exited; the actual non-persistence is guaranteed by keeping the certificates and chain inside that process.

## Main files

- contracts/CertificateVerification.sol: on-chain issuance, academic hashes, correction links and revocation rules.
- backend/src/services/blockchainService.ts: creates/deploys the fresh in-process demo chain.
- backend/src/services/certificateStore.ts: temporary certificate metadata and PDF buffers.
- backend/src/services/authService.ts and config/database.ts: persistent PostgreSQL accounts and login.
- backend/src/cleanupCertificateHistory.ts: removes legacy certificate-only SQL/disk storage.
- backend/src/server.ts: HTTP server startup and graceful resource cleanup.
- backend/public/: plain interface and client-side hashing/session monitoring.
- backend/test/demo-session.test.ts: forced-stop/restart regression test.

Older standalone deployment examples are not used by the demo startup. Earlier explanation notes describe prior storage behaviour; the current implementation uses temporary certificate storage as described here and in docs/DEMO_MODE.md.
