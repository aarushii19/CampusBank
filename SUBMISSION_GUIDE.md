# CampusBank — Setup, Demonstration, and Viva Guide

## Scope

CampusBank is an academic student banking and personal finance simulation using fictional data. It retains the existing banking workflow and adds student profile fields, allowance/income and expense categories, student monthly reports, and savings goals. It does not connect to real banks or process real money. Authentication and student-level authorization are not implemented.

The initial six-table design is documented in [PHASE1_DATABASE_DESIGN.md](./PHASE1_DATABASE_DESIGN.md); its CampusBank addendum documents the student finance extensions. The root [bank_management.sql](./bank_management.sql) contains the expanded fresh schema, 10+ sample records per core table, database objects, and query examples. The additive upgrade is [001_campusbank_student_finance.sql](./migrations/001_campusbank_student_finance.sql).

## Setup

### Fresh database

1. Use a MySQL 8.0+ server and an account with permission to create the `bank_management` database and objects.
2. Execute `bank_management.sql` once against a fresh/empty `bank_management` schema (MySQL Workbench: open the file and execute it; CLI: `mysql -u root -p < bank_management.sql`). The script no longer drops a database. It is a one-time schema bootstrap; use the migration for an existing schema.
3. Copy `backend/.env.example` to `backend/.env` and configure the MySQL credentials and database name.
4. From `backend/`, run `npm ci`, then `npm start`. Verify `GET http://localhost:3001/api/health`.
5. From `frontend/`, run `npm ci`, then `npm run dev`; visit `http://localhost:5173`.

### Existing Bank Management database

Back up the database, then execute `migrations/001_campusbank_student_finance.sql` exactly once in the existing `bank_management` schema. It adds student columns, category lookup/foreign key, the category validation trigger, and savings goals without dropping or rewriting existing transaction/account/loan rows.

## Demo sequence

1. Open Overview and select a student and month. Review available balance, categorized income, categorized spending, and goal progress.
2. Create or edit a student profile with a unique Student ID, institution, course, and graduation year.
3. Open the Student Savings page, create a goal, and link it to an account owned by the selected student. Change that account's balance with an actual deposit or withdrawal to see the estimate update.
4. Record an allowance deposit using an income category. Record spending using Food/Travel/Hostel/Books/College Fees/Entertainment/Other. Filter transaction history by student, category, type, status, and month.
5. Transfer between accounts and verify the transfer appears in account history but not monthly income or categorized expenses.
6. Exercise existing account management, loan tracking, and loan repayments. Attempt an overdrawn withdrawal/transfer and an invalid account. Confirm the API returns an error and no failed ledger row is committed.
7. Execute the student monthly, category aggregate, savings progress, branch, transaction type, and loan payment queries in the SQL file. Capture query result grids for the live viva.

Savings progress equals the lesser of the linked account's current available balance and the goal target. The goal does not reserve funds; multiple goals may reference the same balance. Monthly income includes posted categorized deposits; expenses include posted categorized withdrawals. Transfers and loan repayments are deliberately omitted from spending totals.

## Current verification record

- API test suite: 15 tests passed, including prior CRUD/transaction rollback checks and new student profile validation, categorized deposit validation, categorized monthly report behavior, and account-owner validation for goal creation.
- Frontend production build: passed with the existing Rollup setup.
- SQL syntax/runtime and live API-to-MySQL behavior: not verified in this environment because valid MySQL credentials were unavailable. Configure the database and run `GET /api/health` before claiming a live integration check.
- The screenshots currently in `evidence/screenshots/` are previews from browser sessions and are not live database evidence. Capture fresh CampusBank screenshots with a configured backend during the demonstration.

## Viva notes

1. **How is 3NF maintained?** Student profile attributes remain with the existing customer/student entity; category names and category types are stored once in a lookup table; goals reference student and account keys. Posted financial facts remain in the transaction ledger.
2. **How do monthly summaries avoid double counting?** Only categorized posted deposits count as income and categorized posted withdrawals count as spending. Transfers and loan repayments are outside those aggregates.
3. **What does a savings goal's progress mean?** It is an estimate computed from a real linked account's available balance, capped at the target. It never changes or reserves account money.
4. **How do banking operations remain atomic?** The Express API begins a MySQL transaction, locks accounts in stable ID order for transfers, validates account status/funds, writes ledger records, commits, or rolls back on error.
5. **How do the existing database objects help?** `AccountSummaryView` derives balances; `TransferFunds` demonstrates stored procedures; triggers validate ledger/account/category rules; foreign keys and checks protect relationships/domains.
6. **What remains outside scope?** No real payments, authentication, authorization, student isolation, loan amortization engine, regulatory workflow, or production security controls.

## Remaining limitations

The live database migration and full end-to-end browser/database flow require valid local MySQL credentials and a live demonstration run. Existing non-fixture customer rows receive null student profile fields until maintained by an operator. Branch CRUD remains available through the API; the retained UI focuses on student, account, transaction, loan, and report workflows.
