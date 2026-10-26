const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { transferFunds, postDepositOrWithdrawal } = require('../src/operations');
const { HttpError } = require('../src/errors');

async function request(app, path, { method = 'GET', body } = {}) {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, body: data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rejects unknown resource fields before querying the database', async () => {
  const app = createApp({ execute: async () => { throw new Error('database should not be called'); } });
  const response = await request(app, '/api/customers', { method: 'POST', body: {
    first_name: 'Asha', last_name: 'Patel', email: 'asha@example.test', 'email; DROP TABLE customers': 'x'
  } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('uses parameter placeholders for transaction filters', async () => {
  let call;
  const pool = { execute: async (sql, values) => { call = { sql, values }; return [[{ transaction_id: 7 }]]; } };
  const response = await request(createApp(pool), '/api/transactions?accountId=2&type=transfer');
  assert.equal(response.status, 200);
  assert.deepEqual(call.values, [2, 2, 'transfer']);
  assert.match(call.sql, /source_account_id = \? OR destination_account_id = \?/);
});

test('supports customer create, read, update, and delete with bound values', async () => {
  let record = null;
  const calls = [];
  const pool = {
    execute: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith('INSERT INTO customers')) {
        record = { customer_id: 17, first_name: values[0], last_name: values[1], email: values[2] };
        return [{ insertId: 17, affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT * FROM customers WHERE')) return [[record].filter(Boolean)];
      if (sql.startsWith('UPDATE customers SET')) {
        Object.assign(record, { first_name: values[0] });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM customers')) { record = null; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const app = createApp(pool);
  const created = await request(app, '/api/customers', { method: 'POST', body: { first_name: 'Ira', last_name: 'Sen', email: 'ira@example.test' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.customer_id, 17);
  const read = await request(app, '/api/customers/17');
  assert.equal(read.body.data.email, 'ira@example.test');
  const updated = await request(app, '/api/customers/17', { method: 'PATCH', body: { first_name: 'Ira K' } });
  assert.equal(updated.body.data.first_name, 'Ira K');
  const deleted = await request(app, '/api/customers/17', { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO customers') && call.values.includes('ira@example.test')));
  assert.ok(calls.some((call) => call.sql.includes('UPDATE customers SET first_name = ?')));
});

test('student profiles require a unique student identifier field on creation', async () => {
  let inserted;
  const pool = { execute: async (sql, values = []) => {
    if (sql.startsWith('INSERT INTO customers')) { inserted = values; return [{ insertId: 28 }]; }
    if (sql.includes('WHERE customer_id = ?')) return [[{ customer_id: 28, first_name: 'Ira', student_id: 'STU-28' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const app = createApp(pool);
  const rejected = await request(app, '/api/students', { method: 'POST', body: { first_name: 'Ira', last_name: 'Sen', email: 'ira@campus.test' } });
  assert.equal(rejected.status, 400);
  const created = await request(app, '/api/students', { method: 'POST', body: { first_name: 'Ira', last_name: 'Sen', email: 'ira@campus.test', student_id: 'STU-28', institution: 'Campus U', department: 'CS', graduation_year: 2028 } });
  assert.equal(created.status, 201);
  assert.ok(inserted.includes('STU-28'));
  assert.ok(inserted.includes('Campus U'));
});

test('monthly student report uses categorized deposits and withdrawals', async () => {
  const calls = [];
  const pool = { execute: async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.startsWith('SELECT customer_id, first_name')) return [[{ customer_id: 1, first_name: 'Asha', last_name: 'Patel' }]];
    if (sql.includes('available_balance')) return [[{ available_balance: '420.00' }]];
    if (sql.includes('income_total')) return [[{ income_total: '100.00', expense_total: '30.00' }]];
    if (sql.includes('category_name')) return [[{ category_name: 'Food', amount_total: '30.00', transaction_count: 2 }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const response = await request(createApp(pool), '/api/reports/students/1/monthly?month=2026-10');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.income_total, '100.00');
  assert.equal(response.body.data.expense_total, '30.00');
  assert.equal(response.body.data.categories[0].category_name, 'Food');
  assert.ok(calls.some((call) => call.sql.includes("t.transaction_type = 'deposit'")));
  assert.ok(calls.some((call) => call.sql.includes("t.transaction_type = 'withdrawal'")));
});

test('savings goal creation rejects an account owned by another student', async () => {
  let inserted = false;
  const pool = { execute: async (sql) => {
    if (sql.includes('SELECT customer_id FROM accounts')) return [[{ customer_id: 9 }]];
    if (sql.includes('INSERT INTO savings_goals')) inserted = true;
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const response = await request(createApp(pool), '/api/savings-goals', { method: 'POST', body: { customer_id: 1, account_id: 7, goal_name: 'Trip', target_amount: '500.00' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'INVALID_GOAL_ACCOUNT');
  assert.equal(inserted, false);
});

test('transfer locks accounts in stable order and commits one ledger row', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM accounts')) return [[{ account_id: params[0], status: 'active' }]];
      if (sql.includes('AccountSummaryView')) return [[{ current_balance: '100.00' }]];
      if (sql.includes('INSERT INTO transactions')) return [{ insertId: 42 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const result = await transferFunds({ getConnection: async () => connection }, {
    sourceAccountId: 9, destinationAccountId: 3, amount: '25.50', description: 'test'
  });
  const lockIds = calls.filter((entry) => typeof entry === 'object' && entry.sql.includes('FROM accounts')).map((entry) => entry.params[0]);
  assert.deepEqual(lockIds, [3, 9]);
  assert.equal(result.transactionId, 42);
  assert.ok(calls.includes('commit'));
  assert.ok(!calls.includes('rollback'));
});

test('rolls back a transfer when funds are insufficient', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      if (sql.includes('FROM accounts')) return [[{ account_id: params[0], status: 'active' }]];
      if (sql.includes('AccountSummaryView')) return [[{ current_balance: '2.00' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  await assert.rejects(
    transferFunds({ getConnection: async () => connection }, { sourceAccountId: 1, destinationAccountId: 2, amount: 3 }),
    (error) => error instanceof HttpError && error.code === 'INSUFFICIENT_FUNDS'
  );
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('posts a deposit inside a transaction and commits a parameterized ledger row', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM accounts')) return [[{ account_id: 4, status: 'active' }]];
      if (sql.includes('INSERT INTO transactions')) return [{ insertId: 51 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const result = await postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 4, amount: '0.29', type: 'deposit' });
  const insert = calls.find((entry) => typeof entry === 'object' && entry.sql.includes('INSERT INTO transactions'));
  assert.deepEqual(insert.params, [4, 'deposit', null, '0.29', null]);
  assert.equal(result.transactionId, 51);
  assert.ok(calls.includes('commit'));
});

test('categorizes a deposit only with an income category', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'), release: () => calls.push('release'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM accounts')) return [[{ account_id: 4, status: 'active' }]];
      if (sql.includes('FROM expense_categories')) return [[{ category_type: 'income' }]];
      if (sql.includes('INSERT INTO transactions')) return [{ insertId: 52 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  await postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 4, amount: '10.00', type: 'deposit', expenseCategoryId: 8 });
  const insert = calls.find((entry) => typeof entry === 'object' && entry.sql.includes('INSERT INTO transactions'));
  assert.deepEqual(insert.params, [4, 'deposit', 8, '10.00', null]);
  assert.ok(calls.includes('commit'));
});

test('rejects a mismatched finance category and rolls back', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'), release: () => calls.push('release'),
    execute: async (sql) => {
      if (sql.includes('FROM accounts')) return [[{ account_id: 4, status: 'active' }]];
      if (sql.includes('FROM expense_categories')) return [[{ category_type: 'expense' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  await assert.rejects(postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 4, amount: '10.00', type: 'deposit', expenseCategoryId: 1 }), (error) => error.code === 'INVALID_CATEGORY');
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('rejects an invalid account and rolls the operation back', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async () => [[]]
  };
  await assert.rejects(
    postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 999, amount: '5.00', type: 'withdrawal' }),
    (error) => error instanceof HttpError && error.status === 404
  );
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('rejects an inactive source account before creating a withdrawal', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async () => [[{ account_id: 4, status: 'frozen' }]]
  };
  await assert.rejects(
    postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 4, amount: '5.00', type: 'withdrawal' }),
    (error) => error instanceof HttpError && error.code === 'ACCOUNT_INACTIVE'
  );
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});

test('rolls back an insufficient-balance withdrawal without inserting a ledger row', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM accounts')) return [[{ account_id: 4, status: 'active' }]];
      if (sql.includes('AccountSummaryView')) return [[{ current_balance: '4.00' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  await assert.rejects(
    postDepositOrWithdrawal({ getConnection: async () => connection }, { accountId: 4, amount: '5.00', type: 'withdrawal' }),
    (error) => error instanceof HttpError && error.code === 'INSUFFICIENT_FUNDS'
  );
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
  assert.ok(!calls.some((sql) => typeof sql === 'string' && sql.includes('INSERT INTO transactions')));
});

test('rolls a transfer back when the destination account does not exist', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      if (sql.includes('FROM accounts') && params[0] === 2) return [[{ account_id: 2, status: 'active' }]];
      if (sql.includes('FROM accounts')) return [[]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  await assert.rejects(
    transferFunds({ getConnection: async () => connection }, { sourceAccountId: 2, destinationAccountId: 99, amount: '1.00' }),
    (error) => error instanceof HttpError && error.status === 404
  );
  assert.ok(calls.includes('rollback'));
  assert.ok(!calls.includes('commit'));
});
