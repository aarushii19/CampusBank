const { HttpError } = require('./errors');
const { positiveId, positiveAmount, nonNegativeAmount, moneyToCents, requiredString } = require('./validation');

async function withTransaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Rollback failed:', rollbackError); }
    throw err;
  } finally {
    connection.release();
  }
}

async function lockActiveAccount(connection, accountId) {
  const [rows] = await connection.execute(
    'SELECT account_id, customer_id, status FROM accounts WHERE account_id = ? FOR UPDATE',
    [accountId]
  );
  if (!rows.length) throw new HttpError(404, 'Account not found', 'NOT_FOUND');
  if (rows[0].status !== 'active') throw new HttpError(409, 'Account is not active', 'ACCOUNT_INACTIVE');
  return rows[0];
}

async function readBalance(connection, accountId) {
  const [rows] = await connection.execute(
    'SELECT current_balance FROM AccountSummaryView WHERE account_id = ?',
    [accountId]
  );
  if (!rows.length) throw new HttpError(404, 'Account not found', 'NOT_FOUND');
  return Number(rows[0].current_balance);
}

async function postDepositOrWithdrawal(pool, { accountId: rawAccountId, amount: rawAmount, type, description, expenseCategoryId: rawCategoryId }) {
  const accountId = positiveId(rawAccountId, 'accountId');
  const amount = positiveAmount(rawAmount);
  if (!['deposit', 'withdrawal'].includes(type)) throw new HttpError(400, 'Invalid transaction type', 'VALIDATION_ERROR');
  const memo = description == null ? null : requiredString(description, 'description', 500);
  const categoryId = rawCategoryId == null || rawCategoryId === '' ? null : positiveId(rawCategoryId, 'expenseCategoryId');

  return withTransaction(pool, async (connection) => {
    await lockActiveAccount(connection, accountId);
    if (categoryId !== null) {
      const [categories] = await connection.execute('SELECT category_type FROM expense_categories WHERE expense_category_id = ? AND is_active = TRUE', [categoryId]);
      const expected = type === 'deposit' ? 'income' : 'expense';
      if (!categories.length || categories[0].category_type !== expected) throw new HttpError(400, `Selected category must be an active ${expected} category`, 'INVALID_CATEGORY');
    }
    if (type === 'withdrawal') {
      const balance = await readBalance(connection, accountId);
      if (moneyToCents(balance) < moneyToCents(amount)) throw new HttpError(409, 'Insufficient funds', 'INSUFFICIENT_FUNDS');
    }
    const [result] = await connection.execute(
      `INSERT INTO transactions
       (source_account_id, destination_account_id, transaction_type, expense_category_id, amount, status, description)
       VALUES (?, NULL, ?, ?, ?, 'posted', ?)`,
      [accountId, type, categoryId, amount, memo]
    );
    return { transactionId: result.insertId, accountId, type, amount, status: 'posted' };
  });
}

async function transferFunds(pool, input) {
  const sourceId = positiveId(input.sourceAccountId, 'sourceAccountId');
  const destinationId = positiveId(input.destinationAccountId, 'destinationAccountId');
  const amount = positiveAmount(input.amount);
  const memo = input.description == null ? null : requiredString(input.description, 'description', 500);
  if (sourceId === destinationId) throw new HttpError(400, 'Source and destination accounts must differ', 'VALIDATION_ERROR');

  return withTransaction(pool, async (connection) => {
    // Always lock the lower account ID first to reduce deadlocks between opposing transfers.
    const firstId = Math.min(sourceId, destinationId);
    const secondId = Math.max(sourceId, destinationId);
    await lockActiveAccount(connection, firstId);
    await lockActiveAccount(connection, secondId);
    const sourceBalance = await readBalance(connection, sourceId);
    if (moneyToCents(sourceBalance) < moneyToCents(amount)) throw new HttpError(409, 'Insufficient funds', 'INSUFFICIENT_FUNDS');

    const [result] = await connection.execute(
      `INSERT INTO transactions
       (source_account_id, destination_account_id, transaction_type, amount, status, description)
       VALUES (?, ?, 'transfer', ?, 'posted', ?)`,
      [sourceId, destinationId, amount, memo]
    );
    return { transactionId: result.insertId, sourceAccountId: sourceId, destinationAccountId: destinationId, amount, status: 'posted' };
  });
}

async function createLoanPayment(pool, input) {
  const loanId = positiveId(input.loanId, 'loanId');
  const accountId = positiveId(input.accountId, 'accountId');
  const principalPaid = input.principalPaid == null ? '0.00' : nonNegativeAmount(input.principalPaid, 'principalPaid');
  const interestPaid = input.interestPaid == null ? '0.00' : nonNegativeAmount(input.interestPaid, 'interestPaid');
  const totalCents = moneyToCents(principalPaid) + moneyToCents(interestPaid);
  if (totalCents <= 0n) throw new HttpError(400, 'Payment total must be positive', 'VALIDATION_ERROR');
  const amount = `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, '0')}`;
  const memo = input.description == null ? `Loan ${loanId} repayment` : requiredString(input.description, 'description', 500);

  return withTransaction(pool, async (connection) => {
    const account = await lockActiveAccount(connection, accountId);
    const [loans] = await connection.execute('SELECT customer_id, status FROM loans WHERE loan_id = ? FOR UPDATE', [loanId]);
    if (!loans.length) throw new HttpError(404, 'Loan not found', 'NOT_FOUND');
    if (!['active', 'pending'].includes(loans[0].status)) throw new HttpError(409, 'Loan cannot receive payments in its current status', 'LOAN_INACTIVE');
    if (Number(loans[0].customer_id) !== Number(account.customer_id)) {
      throw new HttpError(400, 'Payment account must belong to the loan customer', 'INVALID_PAYMENT_ACCOUNT');
    }
    const balance = await readBalance(connection, accountId);
    if (moneyToCents(balance) < totalCents) throw new HttpError(409, 'Insufficient funds', 'INSUFFICIENT_FUNDS');

    const [tx] = await connection.execute(
      `INSERT INTO transactions
       (source_account_id, destination_account_id, transaction_type, amount, status, description)
       VALUES (?, NULL, 'loan_repayment', ?, 'posted', ?)`,
      [accountId, amount, memo]
    );
    const [payment] = await connection.execute(
      `INSERT INTO loan_payments
       (loan_id, transaction_id, principal_paid, interest_paid, status)
       VALUES (?, ?, ?, ?, 'posted')`,
      [loanId, tx.insertId, principalPaid, interestPaid]
    );
    return { loanPaymentId: payment.insertId, transactionId: tx.insertId, loanId, accountId, principalPaid, interestPaid, amount, status: 'posted' };
  });
}

module.exports = { withTransaction, postDepositOrWithdrawal, transferFunds, createLoanPayment };
