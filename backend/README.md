# CampusBank API

Express API for the CampusBank academic simulation. Existing customer/account/branch/transaction/loan/payment endpoints remain available. Student CRUD is also exposed at `/api/students`; savings goals, finance categories, and monthly student reports extend the service.

## Database upgrade

- Fresh database: execute root `bank_management.sql` against an empty `bank_management` schema.
- Existing Bank Management System database: back it up, then execute `../migrations/001_campusbank_student_finance.sql` once. The migration adds student columns, categories, transaction classification, and savings goals without dropping or rewriting existing records.

Configure credentials in `.env` from `.env.example`. Run `npm ci`, then `npm start`. Verify `GET /api/health`.

## Added endpoints

- `GET, POST /api/students`; `GET, PATCH, DELETE /api/students/:id` (student profile CRUD using existing customer IDs)
- `GET /api/expense-categories?type=income|expense`
- `GET, POST /api/savings-goals`; `GET, PATCH, DELETE /api/savings-goals/:id`; optional `?studentId=` filter
- `GET /api/reports/students/:id/monthly?month=YYYY-MM`
- Deposit/withdrawal accept optional `expenseCategoryId`; category type is validated in API and database trigger.

Monthly income includes posted, categorized deposits. Spending includes posted, categorized withdrawals. Transfers and loan repayments are not included. Savings progress reads the linked account balance and does not earmark or modify it. No authentication/authorization layer is present; this is not a production service.

Existing deposit, withdrawal, transfer, loan repayment, CRUD, reports, parameterized SQL, and row locking remain in place. Run `npm test` for the API test suite.
