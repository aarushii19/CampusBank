const express = require('express');
const { HttpError, asyncRoute, errorHandler } = require('./errors');
const { positiveId, requiredString, positiveAmount, nonNegativeAmount, enumValue, hasOnly } = require('./validation');
const { postDepositOrWithdrawal, transferFunds, createLoanPayment } = require('./operations');

const resourceDefinitions = {
  customers: {
    table: 'customers', id: 'customer_id',
    fields: ['first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'address', 'student_id', 'institution', 'department', 'graduation_year'],
    required: ['first_name', 'last_name', 'email'],
    validate: {
      first_name: (v) => requiredString(v, 'first_name', 80),
      last_name: (v) => requiredString(v, 'last_name', 80),
      email: (v) => requiredString(v, 'email', 254),
      phone: (v) => v == null || v === '' ? null : requiredString(v, 'phone', 32),
      date_of_birth: (v) => v == null || v === '' ? null : v,
      address: (v) => v == null || v === '' ? null : requiredString(v, 'address', 500),
      student_id: (v) => v == null ? null : requiredString(v, 'student_id', 40),
      institution: (v) => v == null || v === '' ? null : requiredString(v, 'institution', 180),
      department: (v) => v == null || v === '' ? null : requiredString(v, 'department', 120),
      graduation_year: (v) => {
        if (v == null || v === '') return null;
        const year = Number(v);
        if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new HttpError(400, 'graduation_year must be a year from 2000 to 2200', 'VALIDATION_ERROR');
        return year;
      }
    }
  },
  branches: {
    table: 'branches', id: 'branch_id',
    fields: ['branch_code', 'name', 'address', 'phone'],
    required: ['branch_code', 'name', 'address'],
    validate: {
      branch_code: (v) => requiredString(v, 'branch_code', 20),
      name: (v) => requiredString(v, 'name', 120),
      address: (v) => requiredString(v, 'address', 500),
      phone: (v) => v == null ? null : requiredString(v, 'phone', 32)
    }
  },
  accounts: {
    table: 'accounts', id: 'account_id',
    fields: ['customer_id', 'branch_id', 'account_number', 'account_type', 'opening_balance', 'opened_on', 'status'],
    required: ['customer_id', 'branch_id', 'account_number', 'account_type'],
    validate: {
      customer_id: (v) => positiveId(v, 'customer_id'),
      branch_id: (v) => positiveId(v, 'branch_id'),
      account_number: (v) => requiredString(v, 'account_number', 34),
      account_type: (v) => enumValue(v, ['checking', 'savings', 'fixed_deposit'], 'account_type'),
      opening_balance: (v) => v == null ? '0.00' : nonNegativeAmount(v, 'opening_balance'),
      opened_on: (v) => v == null ? new Date().toISOString().slice(0, 10) : v,
      status: (v) => v == null ? 'active' : enumValue(v, ['active', 'frozen', 'closed'], 'status')
    }
  },
  loans: {
    table: 'loans', id: 'loan_id',
    fields: ['customer_id', 'branch_id', 'loan_number', 'principal_amount', 'annual_interest_rate', 'term_months', 'issued_on', 'due_on', 'status'],
    required: ['customer_id', 'branch_id', 'loan_number', 'principal_amount', 'term_months', 'issued_on', 'due_on'],
    validate: {
      customer_id: (v) => positiveId(v, 'customer_id'),
      branch_id: (v) => positiveId(v, 'branch_id'),
      loan_number: (v) => requiredString(v, 'loan_number', 34),
      principal_amount: (v) => positiveAmount(v, 'principal_amount'),
      annual_interest_rate: (v) => {
        const n = Number(v ?? 0);
        if (!Number.isFinite(n) || n < 0 || n > 999.9999) throw new HttpError(400, 'annual_interest_rate must be between 0 and 999.9999', 'VALIDATION_ERROR');
        return n.toFixed(4);
      },
      term_months: (v) => positiveId(v, 'term_months'),
      issued_on: (v) => v,
      due_on: (v) => v,
      status: (v) => v == null ? 'active' : enumValue(v, ['pending', 'active', 'paid', 'defaulted', 'cancelled'], 'status')
    }
  }
};

function cleanPayload(definition, body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object', 'VALIDATION_ERROR');
  hasOnly(body, definition.fields);
  if (!partial) {
    const missing = definition.required.filter((field) => body[field] === undefined);
    if (missing.length) throw new HttpError(400, `Missing required field(s): ${missing.join(', ')}`, 'VALIDATION_ERROR');
  }
  const output = {};
  for (const [field, value] of Object.entries(body)) {
    output[field] = definition.validate[field] ? definition.validate[field](value) : value;
  }
  return output;
}

function registerCrud(router, pool, name, definition) {
  router.get(`/${name}`, asyncRoute(async (req, res) => {
    const conditions = [];
    const values = [];
    if ((name === 'customers' || name === 'students') && req.query.q) {
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR student_id LIKE ? OR institution LIKE ?)');
      const term = `%${String(req.query.q).slice(0, 100)}%`;
      values.push(term, term, term, term, term);
    }
    if (name === 'branches' && req.query.q) {
      conditions.push('(branch_code LIKE ? OR name LIKE ?)');
      const term = `%${String(req.query.q).slice(0, 100)}%`;
      values.push(term, term);
    }
    if (name === 'accounts') {
      for (const [queryName, column] of [['customerId', 'customer_id'], ['branchId', 'branch_id']]) {
        if (req.query[queryName] !== undefined) { conditions.push(`${column} = ?`); values.push(positiveId(req.query[queryName], queryName)); }
      }
      if (req.query.status !== undefined) {
        conditions.push('status = ?'); values.push(enumValue(req.query.status, ['active', 'frozen', 'closed'], 'status'));
      }
    }
    if (name === 'loans') {
      for (const [queryName, column] of [['customerId', 'customer_id'], ['branchId', 'branch_id']]) {
        if (req.query[queryName] !== undefined) { conditions.push(`${column} = ?`); values.push(positiveId(req.query[queryName], queryName)); }
      }
      if (req.query.status !== undefined) {
        conditions.push('status = ?'); values.push(enumValue(req.query.status, ['pending', 'active', 'paid', 'defaulted', 'cancelled'], 'status'));
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(`SELECT * FROM ${definition.table} ${where} ORDER BY ${definition.id} DESC`, values);
    res.json({ data: rows });
  }));
  router.post(`/${name}`, asyncRoute(async (req, res) => {
    const data = cleanPayload(definition, req.body);
    const columns = Object.keys(data);
    const [result] = await pool.execute(
      `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => data[column])
    );
    const [rows] = await pool.execute(`SELECT * FROM ${definition.table} WHERE ${definition.id} = ?`, [result.insertId]);
    res.status(201).json({ data: rows[0] });
  }));
  router.get(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    const [rows] = await pool.execute(`SELECT * FROM ${definition.table} WHERE ${definition.id} = ?`, [id]);
    if (!rows.length) throw new HttpError(404, `${name.slice(0, -1)} not found`, 'NOT_FOUND');
    res.json({ data: rows[0] });
  }));
  router.patch(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    const data = cleanPayload(definition, req.body, true);
    const columns = Object.keys(data);
    if (!columns.length) throw new HttpError(400, 'Provide at least one field to update', 'VALIDATION_ERROR');
    const [result] = await pool.execute(
      `UPDATE ${definition.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${definition.id} = ?`,
      [...columns.map((column) => data[column]), id]
    );
    if (!result.affectedRows) throw new HttpError(404, `${name.slice(0, -1)} not found`, 'NOT_FOUND');
    const [rows] = await pool.execute(`SELECT * FROM ${definition.table} WHERE ${definition.id} = ?`, [id]);
    res.json({ data: rows[0] });
  }));
  router.delete(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    const [result] = await pool.execute(`DELETE FROM ${definition.table} WHERE ${definition.id} = ?`, [id]);
    if (!result.affectedRows) throw new HttpError(404, `${name.slice(0, -1)} not found`, 'NOT_FOUND');
    res.status(204).end();
  }));
}

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const router = express.Router();
  router.get('/health', asyncRoute(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  }));

  for (const [name, definition] of Object.entries(resourceDefinitions)) registerCrud(router, pool, name, definition);
  registerCrud(router, pool, 'students', { ...resourceDefinitions.customers, required: ['first_name', 'last_name', 'email', 'student_id'] });

  router.get('/expense-categories', asyncRoute(async (req, res) => {
    const values = [];
    let where = 'WHERE is_active = TRUE';
    if (req.query.type !== undefined) { where += ' AND category_type = ?'; values.push(enumValue(req.query.type, ['income', 'expense'], 'type')); }
    const [rows] = await pool.execute(`SELECT expense_category_id, category_name, category_type FROM expense_categories ${where} ORDER BY category_type, category_name`, values);
    res.json({ data: rows });
  }));

  router.get('/savings-goals', asyncRoute(async (req, res) => {
    const values = [];
    let where = '';
    if (req.query.studentId !== undefined) { where = 'WHERE g.customer_id = ?'; values.push(positiveId(req.query.studentId, 'studentId')); }
    const [rows] = await pool.execute(`SELECT g.*, a.account_number, v.current_balance,
        LEAST(v.current_balance, g.target_amount) AS progress_amount,
        ROUND(LEAST(v.current_balance, g.target_amount) / g.target_amount * 100, 1) AS progress_percent
      FROM savings_goals g JOIN accounts a ON a.account_id = g.account_id
      JOIN AccountSummaryView v ON v.account_id = g.account_id ${where} ORDER BY g.goal_id DESC`, values);
    res.json({ data: rows });
  }));
  router.get('/savings-goals/:id', asyncRoute(async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM savings_goals WHERE goal_id = ?', [positiveId(req.params.id)]);
    if (!rows.length) throw new HttpError(404, 'Savings goal not found', 'NOT_FOUND');
    res.json({ data: rows[0] });
  }));
  router.post('/savings-goals', asyncRoute(async (req, res) => {
    hasOnly(req.body, ['customer_id', 'account_id', 'goal_name', 'target_amount', 'target_date', 'status']);
    const studentId = positiveId(req.body?.customer_id, 'customer_id');
    const accountId = positiveId(req.body?.account_id, 'account_id');
    const name = requiredString(req.body?.goal_name, 'goal_name', 120);
    const amount = positiveAmount(req.body?.target_amount, 'target_amount');
    const targetDate = req.body?.target_date || null;
    const status = req.body?.status == null ? 'active' : enumValue(req.body.status, ['active', 'completed', 'cancelled'], 'status');
    const [owners] = await pool.execute('SELECT customer_id FROM accounts WHERE account_id = ?', [accountId]);
    if (!owners.length) throw new HttpError(404, 'Account not found', 'NOT_FOUND');
    if (Number(owners[0].customer_id) !== studentId) throw new HttpError(400, 'Savings account must belong to the selected student', 'INVALID_GOAL_ACCOUNT');
    const [result] = await pool.execute('INSERT INTO savings_goals (customer_id, account_id, goal_name, target_amount, target_date, status) VALUES (?, ?, ?, ?, ?, ?)', [studentId, accountId, name, amount, targetDate, status]);
    res.status(201).json({ data: { goal_id: result.insertId, customer_id: studentId, account_id: accountId, goal_name: name, target_amount: amount, target_date: targetDate, status } });
  }));
  router.patch('/savings-goals/:id', asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    hasOnly(req.body, ['goal_name', 'target_amount', 'target_date', 'status']);
    const fields = {};
    if (req.body.goal_name !== undefined) fields.goal_name = requiredString(req.body.goal_name, 'goal_name', 120);
    if (req.body.target_amount !== undefined) fields.target_amount = positiveAmount(req.body.target_amount, 'target_amount');
    if (req.body.target_date !== undefined) fields.target_date = req.body.target_date || null;
    if (req.body.status !== undefined) fields.status = enumValue(req.body.status, ['active', 'completed', 'cancelled'], 'status');
    const columns = Object.keys(fields);
    if (!columns.length) throw new HttpError(400, 'Provide at least one field to update', 'VALIDATION_ERROR');
    const [result] = await pool.execute(`UPDATE savings_goals SET ${columns.map((key) => `${key} = ?`).join(', ')} WHERE goal_id = ?`, [...columns.map((key) => fields[key]), id]);
    if (!result.affectedRows) throw new HttpError(404, 'Savings goal not found', 'NOT_FOUND');
    const [rows] = await pool.execute('SELECT * FROM savings_goals WHERE goal_id = ?', [id]);
    res.json({ data: rows[0] });
  }));
  router.delete('/savings-goals/:id', asyncRoute(async (req, res) => {
    const [result] = await pool.execute('DELETE FROM savings_goals WHERE goal_id = ?', [positiveId(req.params.id)]);
    if (!result.affectedRows) throw new HttpError(404, 'Savings goal not found', 'NOT_FOUND');
    res.status(204).end();
  }));

  router.get('/reports/students/:id/monthly', asyncRoute(async (req, res) => {
    const studentId = positiveId(req.params.id, 'studentId');
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'month must use YYYY-MM format', 'VALIDATION_ERROR');
    const [students] = await pool.execute('SELECT customer_id, first_name, last_name FROM customers WHERE customer_id = ?', [studentId]);
    if (!students.length) throw new HttpError(404, 'Student not found', 'NOT_FOUND');
    const [[balanceRows], [monthlyRows], [categoryRows]] = await Promise.all([
      pool.execute('SELECT COALESCE(SUM(v.current_balance), 0.00) AS available_balance FROM accounts a JOIN AccountSummaryView v ON v.account_id = a.account_id WHERE a.customer_id = ?', [studentId]),
      pool.execute(`SELECT COALESCE(SUM(CASE WHEN t.transaction_type = 'deposit' AND c.category_type = 'income' THEN t.amount ELSE 0 END),0.00) AS income_total,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'withdrawal' AND c.category_type = 'expense' THEN t.amount ELSE 0 END),0.00) AS expense_total,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'loan_repayment' THEN t.amount ELSE 0 END),0.00) AS loan_repayment_total
        FROM transactions t JOIN accounts a ON a.account_id = t.source_account_id
        LEFT JOIN expense_categories c ON c.expense_category_id = t.expense_category_id
        WHERE a.customer_id = ? AND t.status = 'posted' AND t.occurred_at >= ? AND t.occurred_at < DATE_ADD(?, INTERVAL 1 MONTH)`, [studentId, `${month}-01`, `${month}-01`]),
      pool.execute(`SELECT c.expense_category_id, c.category_name, SUM(t.amount) AS amount_total, COUNT(*) AS transaction_count
        FROM transactions t JOIN accounts a ON a.account_id = t.source_account_id
        JOIN expense_categories c ON c.expense_category_id = t.expense_category_id
        WHERE a.customer_id = ? AND t.status = 'posted' AND t.transaction_type = 'withdrawal' AND c.category_type = 'expense'
          AND t.occurred_at >= ? AND t.occurred_at < DATE_ADD(?, INTERVAL 1 MONTH)
        GROUP BY c.expense_category_id, c.category_name ORDER BY amount_total DESC`, [studentId, `${month}-01`, `${month}-01`])
    ]);
    res.json({ data: { student: students[0], month, ...balanceRows[0], ...monthlyRows[0], categories: categoryRows } });
  }));

  router.get('/account-summary', asyncRoute(async (_req, res) => {
    const [rows] = await pool.execute('SELECT * FROM AccountSummaryView ORDER BY account_id');
    res.json({ data: rows });
  }));

  router.get('/reports/summary', asyncRoute(async (_req, res) => {
    const [[branchRows], [transactionRows], [loanRows]] = await Promise.all([
      pool.execute(`SELECT b.branch_id, b.branch_code, b.name,
          COALESCE(a.account_count, 0) AS account_count,
          COALESCE(a.total_balance, 0.00) AS total_balance,
          COALESCE(l.loan_count, 0) AS loan_count,
          COALESCE(l.principal_total, 0.00) AS principal_total
        FROM branches b
        LEFT JOIN (SELECT x.branch_id, COUNT(*) AS account_count, SUM(v.current_balance) AS total_balance
          FROM accounts x JOIN AccountSummaryView v ON v.account_id = x.account_id GROUP BY x.branch_id) a
          ON a.branch_id = b.branch_id
        LEFT JOIN (SELECT branch_id, COUNT(*) AS loan_count, SUM(principal_amount) AS principal_total
          FROM loans GROUP BY branch_id) l ON l.branch_id = b.branch_id
        ORDER BY b.name`),
      pool.execute(`SELECT transaction_type, COUNT(*) AS transaction_count, SUM(amount) AS amount_total,
          AVG(amount) AS average_amount FROM transactions WHERE status = 'posted'
        GROUP BY transaction_type ORDER BY transaction_type`),
      pool.execute(`SELECT l.status, COUNT(*) AS loan_count, SUM(l.principal_amount) AS principal_total,
          COALESCE(SUM(p.principal_paid), 0.00) AS principal_repaid,
          COALESCE(SUM(p.interest_paid), 0.00) AS interest_repaid
        FROM loans l LEFT JOIN (SELECT loan_id, SUM(CASE WHEN status = 'posted' THEN principal_paid ELSE 0 END) AS principal_paid,
          SUM(CASE WHEN status = 'posted' THEN interest_paid ELSE 0 END) AS interest_paid
          FROM loan_payments GROUP BY loan_id) p ON p.loan_id = l.loan_id
        GROUP BY l.status ORDER BY l.status`)
    ]);
    res.json({ data: { branches: branchRows, transactions: transactionRows, loans: loanRows } });
  }));

  router.get('/reports/daily-transactions', asyncRoute(async (req, res) => {
    const days = req.query.days === undefined ? 14 : Number(req.query.days);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new HttpError(400, 'days must be an integer from 1 to 90', 'VALIDATION_ERROR');
    const [rows] = await pool.execute(`SELECT DATE(occurred_at) AS transaction_date, COUNT(*) AS transaction_count,
        SUM(amount) AS amount_total FROM transactions WHERE status = 'posted'
        AND occurred_at >= DATE_SUB(CURRENT_DATE, INTERVAL ? DAY)
      GROUP BY DATE(occurred_at) ORDER BY transaction_date`, [days]);
    res.json({ data: rows });
  }));

  router.get('/transactions', asyncRoute(async (req, res) => {
    const conditions = [];
    const values = [];
    if (req.query.accountId !== undefined) {
      const id = positiveId(req.query.accountId, 'accountId');
      conditions.push('(source_account_id = ? OR destination_account_id = ?)');
      values.push(id, id);
    }
    if (req.query.type !== undefined) {
      conditions.push('transaction_type = ?');
      values.push(enumValue(req.query.type, ['deposit', 'withdrawal', 'transfer', 'loan_repayment'], 'type'));
    }
    if (req.query.status !== undefined) {
      conditions.push('status = ?');
      values.push(enumValue(req.query.status, ['pending', 'posted', 'failed', 'reversed'], 'status'));
    }
    if (req.query.expenseCategoryId !== undefined) {
      conditions.push('expense_category_id = ?');
      values.push(positiveId(req.query.expenseCategoryId, 'expenseCategoryId'));
    }
    if (req.query.from !== undefined) { conditions.push('occurred_at >= ?'); values.push(req.query.from); }
    if (req.query.to !== undefined) { conditions.push('occurred_at < ?'); values.push(req.query.to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(`SELECT t.*, c.category_name, c.category_type FROM transactions t
      LEFT JOIN expense_categories c ON c.expense_category_id = t.expense_category_id ${where} ORDER BY occurred_at DESC`, values);
    res.json({ data: rows });
  }));
  router.get('/transactions/:id', asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    const [rows] = await pool.execute('SELECT * FROM transactions WHERE transaction_id = ?', [id]);
    if (!rows.length) throw new HttpError(404, 'Transaction not found', 'NOT_FOUND');
    res.json({ data: rows[0] });
  }));
  router.post('/transactions/deposit', asyncRoute(async (req, res) => {
    hasOnly(req.body, ['accountId', 'amount', 'description', 'expenseCategoryId']);
    const result = await postDepositOrWithdrawal(pool, { ...req.body, type: 'deposit' });
    res.status(201).json({ data: result });
  }));
  router.post('/transactions/withdrawal', asyncRoute(async (req, res) => {
    hasOnly(req.body, ['accountId', 'amount', 'description', 'expenseCategoryId']);
    const result = await postDepositOrWithdrawal(pool, { ...req.body, type: 'withdrawal' });
    res.status(201).json({ data: result });
  }));
  router.post('/transactions/transfer', asyncRoute(async (req, res) => {
    hasOnly(req.body, ['sourceAccountId', 'destinationAccountId', 'amount', 'description']);
    const result = await transferFunds(pool, req.body || {});
    res.status(201).json({ data: result });
  }));

  router.get('/loans/:id/payments', asyncRoute(async (req, res) => {
    const loanId = positiveId(req.params.id, 'loanId');
    const [rows] = await pool.execute(
      'SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY paid_at DESC', [loanId]
    );
    res.json({ data: rows });
  }));
  router.get('/payments', asyncRoute(async (req, res) => {
    let rows;
    if (req.query.loanId !== undefined) {
      [rows] = await pool.execute('SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY paid_at DESC', [positiveId(req.query.loanId, 'loanId')]);
    } else {
      [rows] = await pool.execute('SELECT * FROM loan_payments ORDER BY paid_at DESC');
    }
    res.json({ data: rows });
  }));
  router.get('/payments/:id', asyncRoute(async (req, res) => {
    const id = positiveId(req.params.id);
    const [rows] = await pool.execute('SELECT * FROM loan_payments WHERE loan_payment_id = ?', [id]);
    if (!rows.length) throw new HttpError(404, 'Payment not found', 'NOT_FOUND');
    res.json({ data: rows[0] });
  }));
  router.post('/payments', asyncRoute(async (req, res) => {
    hasOnly(req.body, ['loanId', 'accountId', 'principalPaid', 'interestPaid', 'description']);
    const result = await createLoanPayment(pool, req.body || {});
    res.status(201).json({ data: result });
  }));

  app.use('/api', router);
  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found', 'NOT_FOUND')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, cleanPayload, resourceDefinitions };
