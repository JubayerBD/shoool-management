# Fees and finance operations

## Database and startup

Payments insert the collection record and update the invoice in one MongoDB
transaction. Use MongoDB Atlas or a replica set; standalone MongoDB rejects
payments with a clear 503 response and writes neither record. The bundled
`npm run mongo:memory` helper now starts a one-node replica set for demos. It is
still temporary: stopping it removes demo data. Docker Compose starts a replica
set on its existing database volume without clearing records.

Restart the backend after updating. Unique invoice, recurring occurrence and
payment request indexes are initialized before it starts accepting requests.
Existing invoices and payments are retained. Invoice numbers continue above the
highest existing `INV-` number, with an atomic counter; gaps are intentional.

## School fees workflow

The Fees screen now separates six tasks:

1. **Fee setup**: reusable fee types (name, default amount and active status),
   then class fee plans with an academic year and itemized components. Mark
   optional services such as transport as optional components. A fee type or
   plan never creates an invoice by itself.
2. **Billing schedules**: select a class plan, the components to bill, students,
   first/last billing dates, frequency and payment due offset. For example,
   start on the first of the month with 9 due days for payment due on the tenth.
   Select tuition/transport for a monthly schedule and annual charges in a
   separate one-time schedule. Optional services require individual student
   opt-in. Concessions are fixed or percentage amounts per invoice, apply to a
   specific component or the selected total, and require a reason.
3. **Collect fees**: find a student or outstanding/overdue invoice, record a
   partial or full payment and print its numbered receipt. One-off manual
   invoices remain available. Legacy receipts without a number use their
   unique payment ID as a fallback reference.
4. **Student accounts**: itemized ledger of charges, concessions, payments,
   approved waivers, cancellations and refunds, with running balances. Students
   can see only their own records and parents can select any linked child.
5. **Dues & reports**: current balances by class/academic year, overdue totals,
   CSV export and printable statements. Cancelled invoices are excluded and paid
   amounts are net of approved refunds. These are current-balance reports, not
   historical accounting snapshots.
6. **Adjustments & refunds**: accountants/admins submit a reasoned request;
   only an administrator can approve/reject it with a review note. Pending and
   rejected requests do not change balances. Approved requests are retained,
   not deleted. Refunds must reference an original receipt and cannot exceed
   its retained payment. Refunding reopens the invoice balance; cancellation
   requires refunding all retained payments first. A waiver reduces unpaid
   charges without pretending money was collected.

Schedules begin as drafts. Saving or previewing does not charge students.
The administrator reviews a preview containing per-student amounts, concessions,
total scheduled invoices and how many are ready for immediate generation.
Past first billing dates explicitly create catch-up invoices after approval.
Changes to the plan, schedule or student eligibility invalidate the preview.
Approval freezes rates and concessions; later plan edits do not change approved
bills. Overlapping approved schedules cannot bill the same components to the
same students within the same plan. Separate components can have independent
schedules. Do not create overlapping charges through different fee plans.

Approved schedules run every minute and catch up after restart. Pausing stops
future generation; resuming catches up missed dates. Withdrawal/class transfer
stops future billing. Generated invoices remain independent historical records.
Schedules do not process online payments or automatically send reminders.
Refund approval records an offline return of money; it does not transfer money
through a bank or gateway. Record it only after the money has actually been
returned. Finance reports reduce fee income at the refund approval date.

## Legacy recurring entries

Existing automatic fee structures are preserved for compatibility and shown
with a warning in Fee setup. Use **Stop old automation** before replacing one
with an approved billing schedule, to avoid duplicate legacy/scheduled charges.
The new Add fee type form has no automatic billing controls. Old API clients can
still manage legacy configuration. Monthly, quarterly and yearly dates such as
January 31 clamp to February's last day and return to March 31.

Only active students admitted by the billing day, matching the structure's
class and academic year when specified, are billed. A specified academic year's
start and end dates bound the schedule. Invoices fall due on the billing day.
Past start dates generate historical bills; select the intended start carefully.
Automatic invoices have database-enforced occurrence keys, so concurrent workers
and restarts do not duplicate them. Manually created invoices remain independent;
do not manually bill periods already covered by an automatic schedule.

An expense marked **Recurring** is the template for future expense records.
The original expense date anchors monthly/quarterly/yearly repetitions. Repeated
entries do not copy old transaction references or receipts and do not themselves
recur. Disable recurring on the original entry to stop future repetitions.
These entries record expected repeated expenses; no bank transfer is performed.
Deleting a generated entry will allow the scheduler to recreate that occurrence.
Do not mark variable expenses recurring unless automatic recording is intended.

## Access, payment retries and reports

Admins and accountants manage finance. Students see only their own invoices and
payments; parents see all linked children. Missing links return an empty list.
Cross-student detail requests return 404; forbidden list filters return 403.
Teachers cannot read individual fee invoices or payments.

The payment form sends a UUID `idempotencyKey`. Retrying an unchanged request with
the same key returns the original payment instead of collecting twice. API clients
should send and retain this key until success is confirmed. Amounts use at most
two decimal places; concurrent payments cannot exceed the outstanding balance.

Report ranges and month boundaries use Asia/Dhaka time independent of the host.
Summary, category breakdown, monthly charts and ledger honor the same range.
List APIs accept `page` and `limit` (1–200) and return `total` and `pages`;
the fees/finance UI follows all pages for full lists, totals and printing.

## Verification

Run `npm test` from `server/` and `npm run build` from the project root.
Tests create a separate temporary replica set and never seed, clear or connect
to the configured school database.

For optional browser verification, install Playwright in your developer tooling
and its Chromium browser, then run `npm run test:ui` from `server/`. You can set
`PLAYWRIGHT_PATH` to an external Playwright installation and `PLAYWRIGHT_CHANNEL`
to an installed supported browser channel. The test uses its own database,
walks the billing workflow and writes ignored screenshots and a receipt PDF to
`artifacts/fees-ui/`.


### Per-fee timing in a single schedule

New schedules store a billing rule for each selected component: its first invoice date and an interval of 0 (one time) or 1?12 months. For example, tuition every month, exams every four months, and admission once can share one schedule and student selection. Dates must stay within the schedule and academic year. Charges falling on the same date are combined into one invoice per student. Month-end dates clamp to the last valid day while retaining the original anchor.

The preview shows whole-schedule totals and an expandable invoice breakdown for each student. Fee-specific concessions apply only on dates containing that fee; general concessions apply to every invoice. Fixed concessions exceeding an applicable invoice amount are rejected. Existing schedules without component rules retain their original frequency and generation keys. Approved schedules remain immutable; this change does not merge existing approved schedules or replace issued invoices. Overlapping approved schedules are still blocked, including paused schedules.


### Cancelling a schedule

Administrators can preview and confirm cancellation with a reason. Cancellation permanently stops generation and cancels all remaining invoices in one transaction, recording approved cancellation adjustments and rejecting pending adjustments for those invoices. Retained payments must first be refunded through the existing approval flow; otherwise cancellation is rejected without changing anything. Pause remains available while refunds are handled. Cancelled schedules cannot resume and do not block replacement approval. They are hidden from the default schedule list; Show cancelled schedules exposes the history. Existing receipts and invoice records are never deleted. Generation writes a shared schedule revision inside its invoice transaction so an in-flight worker cannot issue new bills after cancellation.


### Payment entry corrections

Staff can request Correct payment beside a receipt in student history or invoice details. Enter the full corrected amount (including zero for an entirely erroneous entry), with a reason. Administrators approve/reject under Adjustments & refunds. Approval transactionally updates the same payment and invoice net paid amount, preserving receipt number, original amount, payment date, and an embedded audit history plus the reviewed adjustment. Corrections restate Finance totals on the original payment date; they do not represent a refund or new cash collection. Account ledger payment rows use the corrected amount; correction audit rows have zero debit/credit to avoid double counting. Requests are revalidated on approval for stale amounts, refunds and outstanding balance. Original payment request retries still match the original amount and cannot create another receipt.
