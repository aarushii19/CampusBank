# CampusBank — Student Banking & Finance

React app for a fictional student banking and personal finance simulation. It extends the original customer/accounts/transactions/branches/loans model with student profile fields, allowance/income and expense categories, student monthly summaries, and linked-account savings goals.

## Run locally

1. For a fresh database, execute the root `bank_management.sql` once against an empty `bank_management` schema. It no longer drops an existing database. For the previous project schema, take a backup and execute `../migrations/001_campusbank_student_finance.sql` once.
2. Copy `backend/.env.example` to `backend/.env` and configure MySQL. Start the backend from `backend/` using `npm ci` and `npm start`.
3. Run `npm ci` and `npm run dev` from `frontend/`; open `http://localhost:5173`.

The database migration is additive and preserves existing accounts, transactions, and loans. Student profiles extend the existing customers table. Savings goal progress is an estimate based on the linked account's current balance; it does not reserve or move funds. Monthly income counts categorized deposits and monthly spending counts categorized withdrawals. Internal transfers and loan repayments are excluded from student spending totals.

All data is fictional. No real bank connection, real money processing, authentication, or student-level authorization is provided; use only for an academic demo.
