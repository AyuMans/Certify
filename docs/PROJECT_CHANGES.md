Academic Certificate Verification: additions for the college project

Storage update: the current demo keeps only user accounts in PostgreSQL. Certificate metadata, PDFs and blockchain events are now in memory and reset whenever the backend stops. See DEMO_MODE.md for current storage/startup behaviour; the database-certificate sections below describe the previous version.

This update keeps the project small enough to explain as a second-year project. It uses the same Solidity, Express, PostgreSQL and plain JavaScript stack. The three additions are a separate academic-details check, linked corrections, and file verification without uploading the PDF. There is no OCR, AI model, student wallet system or selective-disclosure cryptography.

1. The website

The page now uses a normal heading, section buttons, labeled forms, a basic table and small result boxes. Styling is in one short CSS file. The main sections are Verify file, Check academic details, Find certificate, Issue / correct, Saved certificates, and Admin. Staff sections are shown after login, while API middleware still enforces permissions.

2. File verification in the browser

Previously, the browser uploaded the file and Node.js calculated its SHA-256 hash. The website now reads the selected file using file.arrayBuffer(), calculates SHA-256 using crypto.subtle.digest(), converts the 32 bytes into hexadecimal, and posts only that hash to /api/certificates/verify/hash.

The backend looks up the hash in the contract and returns VALID, INVALID, REVOKED or SUPERSEDED. The browser displays the result. A normal verification request does not contain PDF bytes. Issuance still uploads the PDF because the application stores it for later authorized download. The older file-upload verification endpoint remains available to existing API clients.

Explain it this way: "I moved file hashing to the browser so a verifier does not have to upload a personal document. The same SHA-256 algorithm is used at issuance and verification."

A file hash can still identify repeated requests. This change prevents the PDF upload in this workflow; it is not a claim of complete anonymity. Browser hashing requires localhost or HTTPS.

3. The academic-details hash

At issuance, staff enter six fields: student name, roll number, degree/course, department, graduation year and grade/CGPA. The server validates each field, normalizes Unicode, removes extra whitespace and changes letters to uppercase.

For example, "  test   student " becomes "TEST STUDENT". This avoids failures caused only by capitalization or repeated spaces. It does not equate every possible spelling, punctuation mark or numeric format. A grade of 8.5 and 8.50 are different strings in this version.

The server puts values into a fixed-order JSON array:

["ACV_DETAILS_V1", certificateId, studentName, rollNumber, degree, department, graduationYear, grade]

It hashes the UTF-8 bytes of that JSON using SHA-256. Including a version label fixes the format; including the certificate ID binds the fields to that record. Fixed ordering prevents object-key ordering from changing the hash.

The contract stores this academicHash alongside the existing PDF hash. Normalized fields are saved in PostgreSQL for staff viewing and correction prefilling. Personal field values are not written directly into the contract, although ordinary unsalted field hashes should not be described as cryptographically private against guessing.

4. Comparing academic details

The verifier manually enters the certificate ID and six fields into the separate form. The backend repeats validation, normalization and hashing. The contract resolves the ID to a document record and supplies its stored academic hash. Equality means the entered fields match what was registered.

The response keeps two facts separate: detailsMatch and the record status. Details can match a revoked or superseded certificate, but that record is not active. Changing a PostgreSQL copy of a grade alone cannot change the on-chain academic hash.

Explain it this way: "The PDF hash checks the exact file. The academic hash checks the fields a verifier enters. They answer different questions."

This form does not read or parse a PDF. If the verifier copies fields from a reformatted certificate, those entered fields can still match even when the PDF hash differs. That is not proof that the reformatted PDF contains only correct information. A valid ID or a successful field comparison never overrides a failed file check. The authorized staff member must ensure the PDF agrees with the fields at issuance.

5. Correcting a certificate

An admin uses Correct beside a saved certificate. The form copies its details and old document hash. The admin enters the correction, gives it a new unique ID such as ACV-DEMO-001-R1, and uploads the corrected PDF.

The backend calls replaceCertificate(oldHash, newHash, newId, newAcademicHash) through the owner wallet. The contract checks that the old record exists and is active. The original authorized issuer or contract owner may call it on-chain; the current web API exposes it only to ADMIN accounts using the owner wallet.

Inside a single transaction, the contract creates the new record, sets its previousHash, and sets the old record's replacementHash. If validation fails, the transaction reverts and neither half is saved. For example, using a duplicate new ID cannot leave the old certificate superseded without a replacement.

The old certificate becomes SUPERSEDED. Its revoked flag stays false because a correction is distinct from revocation. Both versions and their issuance events remain. A CertificateReplaced event links the two hashes. The Find certificate page can follow links backward and forward. A later correction can extend the chain again.

A revoked certificate cannot be corrected using this function. An already-superseded certificate cannot be superseded a second time. Correct the current active version instead. An old superseded record cannot be separately revoked; the active replacement can be revoked.

Explain it this way: "A correction is a new certificate linked to its old version. We preserve history instead of editing or deleting the original record."

6. Database additions and recovery

Nullable columns academic_details, academic_hash, previous_hash, replacement_hash and contract_address are added using ALTER TABLE ... ADD COLUMN IF NOT EXISTS. This preserves existing rows and allows setup to run more than once.

After a confirmed correction, a PostgreSQL transaction inserts the new certificate and updates the saved old record's replacement link. BEGIN/COMMIT keeps these database operations together. ROLLBACK reverses them if the database save fails.

The SQL transaction cannot roll back a confirmed blockchain transaction. If the chain succeeded but the database failed, the response asks the user to retry the same PDF, ID, details and old hash. The service checks the existing blockchain record, reuses its original issuance event and transaction hash, and finishes the database save. Integration tests deliberately cause a database failure to check this path.

The register filters by configured contract address. Legacy rows without that association remain in the database but are not automatically assigned to the new contract. Old IDs/hashes remain subject to existing database uniqueness constraints. Use fresh IDs and files for a new demonstration; nothing is automatically deleted.

The local Hardhat node is still temporary. Restarting it loses chain state while database rows/files remain. A repeated contract address after a reset is not proof of the same historical chain. Keep the node running during the demo.

7. Changes in Solidity

The Certificate structure adds academicHash, previousHash and replacementHash. The contract adds a mapping from the hashed certificate ID to its document hash. getCertificateHashById() supports academic comparison. The existing ID uniqueness mapping remains.

issueCertificateWithDetails() requires a nonzero academic hash. replaceCertificate() performs an authorized atomic correction. The internal _issueCertificate() function holds the common issuance/uniqueness checks so they are not duplicated.

verifyCertificate() now returns valid=false when replacementHash is nonzero, even if revoked is false. The backend uses the explicit replacement link to report SUPERSEDED. The original two-argument issueCertificate() remains for older contract callers; those records have no academic hash, so their details cannot be compared.

contractVersion() returns 2. The local launcher can detect the old contract and deploy a new instance without modifying the old instance. The ABI is regenerated from compiled Solidity.

8. Small supporting code

academicService.ts holds the six field names, validation, normalization and deterministic academic hashing. verificationService.ts reads live record status and compares details. The issuance route validates uploads and orchestrates chain, file and database operations.

chainWriteQueue.ts is a small Promise-based queue for this single-server demo. It prevents operations using the shared institution wallets from sending overlapping writes with conflicting transaction nonces. It is not a distributed queue for multiple backend processes.

The frontend remains one ordinary JavaScript file. It uses fetch, FormData, crypto.subtle and DOM methods. No new frontend framework or large dependency was added.

9. Demonstration steps

Start with npm run dev:local and keep the terminal running. The launcher creates missing columns, builds the app, and deploys version 2 if necessary. Sign in with the existing admin account.

Issue a sample certificate with a fresh ID and these example values: Test Student, CS-101, B.Tech, Computer Science, 2026, 8.5. Keep its PDF unchanged.

Verify the original file: VALID. Check the Network panel: the request to /verify/hash contains a JSON certificateHash, not the PDF.

Compare the academic details. Try different capitalization and extra spaces: they still match. Change the grade to 9.9: the details do not match. Verify a different PDF separately: it remains INVALID, even if you know the correct academic fields.

As admin, click Correct, change the grade or spelling, use a new ID and a new PDF, then save. Verify the old PDF: SUPERSEDED. Follow its corrected-certificate link: the replacement is active and links back to its predecessor. Check the transaction history.

10. What to claim in the viva

"Our project checks both exact-file integrity and manually entered academic details. It also tracks certificate corrections without deleting history. File verification calculates the hash in the browser so the PDF does not need to be uploaded."

Do not claim automatic PDF text verification, that the system independently proves a degree was earned, that all the code is decentralized, or that the local Hardhat simulation is a public production network. You can demonstrate these additions without claiming to have invented blockchain credentials.

11. Suggested division of work to study

One teammate can study the contract, hashing and correction tests. The other can study forms, API calls, login and PostgreSQL. Both should be able to trace one issuance, one verification and one correction from start to finish. This is a suggested study split, not a claim about who authored any particular file.

12. Restart after this update

If a backend process was already running when the code changed, it may serve the new HTML but still use old API handlers. Stop that process with Ctrl+C in its VS Code terminal, run npm run dev:local from the project root, wait for startup to finish, then refresh the browser. The page now detects an older backend and shows this instruction instead of accepting requests for missing routes.

