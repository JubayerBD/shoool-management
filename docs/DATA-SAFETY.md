# Financial controls and local data safety

## Persistent local storage

The local replica set stores its data under `.data/mongodb`, not a temporary directory. Its executable is copied into `.data/bin` on first launch so reinstalling Node dependencies does not remove the database executable. These directories and backups are excluded from Git and are not served by the website.

Start the database with `npm run mongo:local`, then start the API with `npm start`. Alternatively, `npm run start:local` starts/reuses the local database and starts the API together. Start the frontend separately with `npm run dev:client` during development. Stopping/restarting the programs does not erase disk-backed records.

Keep the whole `.data` directory when moving this local installation. Do not use the temporary `mongo:memory` helper for real records. Deployment to another server should use a secured MongoDB replica set/Atlas and a persistent upload volume.

## Automatic backups

The API checks once per minute and creates a backup when the latest completed copy is 24 hours old. It also creates a backup at startup if none exists. Configure `BACKUPS_ENABLED`, `BACKUP_INTERVAL_HOURS` (minimum 1), and `BACKUP_DIR` in `server/.env`. Backups run while the API is running. Completed backups are retained; this version does not automatically delete old copies.

An admin can create a copy and see recent backup timestamps under **Finance → Settings → Database backups**. Accountants cannot access the backup API or controls.

Each backup includes a BSON-preserving compressed database snapshot, indexes, uploaded files, record counts, and SHA-256 checksums. An unfinished copy keeps a `.partial` suffix and is not shown as a successful backup. Password hashes and personal records are inside the backup: keep the backup directory private.

Local copies protect against accidental edits and database loss, but not loss of this entire computer. Use `BACKUP_DIR` on a separate mounted backup location or copy completed backup folders to another device/service for off-site protection.

Manual backup from the root: `npm run backup`.

Restore from `server/`:

```text
node src/seed/restore-cli.js <backup-folder> <empty-target-mongodb-uri> [uploads-folder]
```

Restore refuses a database containing any records and verifies file checksums before writing. Restore into a separate database, check it, and then switch the application connection. There is no browser button that overwrites the live database.

The local migration takes a final snapshot while the API is stopped and compares every restored collection by count and BSON-value fingerprint. The result is saved as `.data/backups/migration-verification.json`. The original source is not dropped.

## Duplicate invoice/voucher numbers

The check is separate for income invoices and expense vouchers. It ignores case and repeated whitespace, preserves leading zeros, and shows the existing party, date, amount, and reversal status. A repeat is allowed only after explicit confirmation. A repeated number from a different party is therefore warned about, not forbidden.

Matching writes are serialized, and request keys make retries return the original entry rather than creating a second one. Acknowledged duplicates are recorded on the saved transaction. Duplicate checks also run when a replacement is requested and approved.

## Corrections and reversals

Posted income, expense, and salary entries cannot be permanently deleted or overwritten through the API. Use **Request reversal**, or edit an income/expense entry and provide a correction reason. Requests appear under **Finance → Corrections**. Admins approve or reject them with a review note; accountants can submit requests and inspect their status. An admin can review their own request when no second admin is available; requester and reviewer are both retained.

Pending/rejected requests have no financial effect. Approval keeps the original amounts, document numbers and dates, marks the original reversed, and adds an equal opposite posting. Editing income/expenses additionally creates a new replacement linked to the correction. Entries are posted on the approval date, or the original date if the original is future-dated. Prior period figures and saved profit distributions are not silently rewritten.

Approved reversals are reflected in balance, net profit, category/monthly reports, transaction lists, partner capital, and unpaid profit. They do not send or recover money from a bank account. Salary reversal permits recording the correct salary for the same staff/month without erasing the earlier payment.

Partner deposit and profit-payment history have admin reversal controls. Student fee payments retain their existing approved refund/correction workflow. Review retries and concurrent approval cannot post a second reversal/replacement.

Physical receipts/slips for reversed records are marked `REVERSED`. The original plus its reversing entry remain visible for audit.
