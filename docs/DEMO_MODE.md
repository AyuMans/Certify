Demo mode: what changed and how to explain it

The project now saves only user accounts in PostgreSQL. Certificate details are held in a JavaScript Map and PDF files are held in memory buffers. The blockchain is an isolated Hardhat network created inside the same backend process. Starting the backend deploys a new contract and registers its demo issuer automatically.

When the backend stops, the operating system releases that process's memory. Certificates, PDFs, correction links, revocation flags and transaction logs disappear together. This works even if the process is forcibly terminated, because none of this data was written to a database or disk. Shutdown callbacks are useful for closing resources, but the design does not rely on callbacks to delete saved files.

User names, emails, password hashes and roles stay in the PostgreSQL users table. JWT_SECRET also stays in configuration. Existing passwords are not reset and accounts do not need to be recreated between demos. An unexpired existing token may remain valid with the same signing secret.

To start: npm run dev:local. To stop: Ctrl+C in that terminal. Restart, refresh the page, and reuse the same example ID and PDF. No separate npm run chain or manual deployment step is needed.

The backend removes the old certificates table and files in its dedicated uploads directory during migration/startup. Original PDFs elsewhere on the computer are not application storage and are not deleted. The clear-history utility checks that the user records are identical before and after removal.

Changes to the code:
- blockchainService.ts creates an isolated Hardhat network using network.create() and deploys the contract in that process. It no longer connects to the configured external RPC node or uses saved private keys.
- certificateStore.ts replaces databaseService.ts for certificate data. list/save/download/revoke use memory; authentication continues to use PostgreSQL.
- Certificate upload handling uses Multer memoryStorage and never writes PDF bytes to disk.
- cleanupCertificateHistory.ts drops only the legacy certificate table and clears only the dedicated old uploads directory.
- server.ts closes the HTTP server, clears its certificate Map and closes the in-process chain on a normal shutdown.
- start-local.mjs builds and runs one backend process instead of managing a separate long-running blockchain node.
- The page labels the data as temporary and periodically detects a new session to clear stale displayed results.

Verification, academic-details comparison, corrections, downloads and event history still work while a session is running. Solidity rules are unchanged. Only the lifetime and storage of the demo data changed.

This does not mean an actual public blockchain can have its history erased. We are intentionally discarding a local simulated development network. Previously launched standalone nodes are separate processes and are not used by this backend.

Testing:
The process-restart test creates an isolated account, starts the real backend, issues and revokes a certificate, and confirms its two history events. It forcibly terminates that backend, starts a new one against the same account database, and confirms: the same login works; the certificate list is empty; the previous hash is unregistered; its PDF download is unavailable; its history is empty; and the same ID and PDF can be issued again. It also checks the saved user record is unchanged.

Suggested explanation to the professor:
"For demonstrations, user accounts are permanent but certificate data is temporary. We run Solidity on a Hardhat development blockchain inside the backend process and keep PDF files in RAM. Restarting the backend starts a completely new demo, while PostgreSQL retains only the staff accounts."
