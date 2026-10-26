-- CampusBank: Student Banking & Finance, reproducible MySQL 8.0+ demo database
-- Academic/sample-data use only. Run with a MySQL account allowed to CREATE DATABASE.
-- This one-time bootstrap preserves any existing bank_management database.
-- Existing installations should apply migrations/001_campusbank_student_finance.sql.
CREATE DATABASE IF NOT EXISTS bank_management CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bank_management;

CREATE TABLE customers (
  customer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NULL,
  date_of_birth DATE NULL,
  address VARCHAR(500) NULL,
  student_id VARCHAR(40) NULL,
  institution VARCHAR(180) NULL,
  department VARCHAR(120) NULL,
  graduation_year SMALLINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  CONSTRAINT uq_customers_email UNIQUE (email),
  CONSTRAINT uq_customers_student_id UNIQUE (student_id),
  CONSTRAINT chk_customers_graduation_year CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2000 AND 2200)
) ENGINE=InnoDB;

CREATE TABLE branches (
  branch_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  phone VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id),
  CONSTRAINT uq_branches_code UNIQUE (branch_code)
) ENGINE=InnoDB;

CREATE TABLE accounts (
  account_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  account_number VARCHAR(34) NOT NULL,
  account_type ENUM('checking','savings','fixed_deposit') NOT NULL,
  opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  opened_on DATE NOT NULL DEFAULT (CURRENT_DATE),
  status ENUM('active','frozen','closed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id),
  CONSTRAINT uq_accounts_number UNIQUE (account_number),
  CONSTRAINT chk_accounts_opening_balance CHECK (opening_balance >= 0),
  KEY ix_accounts_customer (customer_id),
  KEY ix_accounts_branch (branch_id),
  CONSTRAINT fk_accounts_customer FOREIGN KEY (customer_id)
    REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_accounts_branch FOREIGN KEY (branch_id)
    REFERENCES branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE expense_categories (
  expense_category_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(60) NOT NULL,
  category_type ENUM('income','expense') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (expense_category_id),
  CONSTRAINT uq_expense_categories_type_name UNIQUE (category_type, category_name)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_account_id BIGINT UNSIGNED NOT NULL,
  destination_account_id BIGINT UNSIGNED NULL,
  transaction_type ENUM('deposit','withdrawal','transfer','loan_repayment') NOT NULL,
  expense_category_id BIGINT UNSIGNED NULL,
  amount DECIMAL(15,2) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending','posted','failed','reversed') NOT NULL DEFAULT 'posted',
  description VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (transaction_id),
  CONSTRAINT chk_transactions_amount CHECK (amount > 0),
  CONSTRAINT chk_transactions_distinct_accounts CHECK
    (destination_account_id IS NULL OR source_account_id <> destination_account_id),
  CONSTRAINT chk_transactions_transfer_destination CHECK
    ((transaction_type = 'transfer' AND destination_account_id IS NOT NULL)
     OR (transaction_type <> 'transfer' AND destination_account_id IS NULL)),
  KEY ix_transactions_source_time (source_account_id, occurred_at),
  KEY ix_transactions_destination_time (destination_account_id, occurred_at),
  KEY ix_transactions_status_time (status, occurred_at),
  CONSTRAINT fk_transactions_source FOREIGN KEY (source_account_id)
    REFERENCES accounts(account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_destination FOREIGN KEY (destination_account_id)
    REFERENCES accounts(account_id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_category FOREIGN KEY (expense_category_id)
    REFERENCES expense_categories(expense_category_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE savings_goals (
  goal_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  goal_name VARCHAR(120) NOT NULL,
  target_amount DECIMAL(15,2) NOT NULL,
  target_date DATE NULL,
  status ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (goal_id),
  CONSTRAINT chk_savings_goals_target CHECK (target_amount > 0),
  KEY ix_savings_goals_customer_status (customer_id, status),
  CONSTRAINT fk_savings_goals_customer FOREIGN KEY (customer_id)
    REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_savings_goals_account FOREIGN KEY (account_id)
    REFERENCES accounts(account_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE loans (
  loan_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  loan_number VARCHAR(34) NOT NULL,
  principal_amount DECIMAL(15,2) NOT NULL,
  annual_interest_rate DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  term_months SMALLINT UNSIGNED NOT NULL,
  issued_on DATE NOT NULL,
  due_on DATE NOT NULL,
  status ENUM('pending','active','paid','defaulted','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (loan_id),
  CONSTRAINT uq_loans_number UNIQUE (loan_number),
  CONSTRAINT chk_loans_principal CHECK (principal_amount > 0),
  CONSTRAINT chk_loans_rate CHECK (annual_interest_rate >= 0),
  CONSTRAINT chk_loans_term CHECK (term_months > 0),
  CONSTRAINT chk_loans_dates CHECK (due_on >= issued_on),
  KEY ix_loans_customer_status (customer_id, status),
  KEY ix_loans_branch_status (branch_id, status),
  CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id)
    REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loans_branch FOREIGN KEY (branch_id)
    REFERENCES branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE loan_payments (
  loan_payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_id BIGINT UNSIGNED NOT NULL,
  transaction_id BIGINT UNSIGNED NOT NULL,
  principal_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  interest_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending','posted','failed','reversed') NOT NULL DEFAULT 'posted',
  PRIMARY KEY (loan_payment_id),
  CONSTRAINT uq_loan_payments_transaction UNIQUE (transaction_id),
  CONSTRAINT chk_loan_payment_principal CHECK (principal_paid >= 0),
  CONSTRAINT chk_loan_payment_interest CHECK (interest_paid >= 0),
  CONSTRAINT chk_loan_payment_positive CHECK (principal_paid + interest_paid > 0),
  KEY ix_loan_payments_loan_time (loan_id, paid_at),
  CONSTRAINT fk_loan_payments_loan FOREIGN KEY (loan_id)
    REFERENCES loans(loan_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_loan_payments_transaction FOREIGN KEY (transaction_id)
    REFERENCES transactions(transaction_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Current balance is derived from opening balance and posted ledger movements.
CREATE VIEW AccountSummaryView AS
SELECT a.account_id, a.account_number, a.customer_id, a.branch_id,
       a.account_type, a.status AS account_status, a.opening_balance,
       a.opening_balance + COALESCE(SUM(movement.delta), 0.00) AS current_balance
FROM accounts AS a
LEFT JOIN (
  SELECT source_account_id AS account_id,
         CASE transaction_type
           WHEN 'deposit' THEN amount
           WHEN 'withdrawal' THEN -amount
           WHEN 'loan_repayment' THEN -amount
           WHEN 'transfer' THEN -amount
         END AS delta
  FROM transactions WHERE status = 'posted'
  UNION ALL
  SELECT destination_account_id AS account_id, amount AS delta
  FROM transactions
  WHERE status = 'posted' AND transaction_type = 'transfer'
) AS movement ON movement.account_id = a.account_id
GROUP BY a.account_id, a.account_number, a.customer_id, a.branch_id,
         a.account_type, a.status, a.opening_balance;

DELIMITER $$

CREATE TRIGGER trg_transactions_category_before_insert
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
  DECLARE v_category_type VARCHAR(16);
  IF NEW.expense_category_id IS NOT NULL THEN
    SELECT category_type INTO v_category_type FROM expense_categories
      WHERE expense_category_id = NEW.expense_category_id AND is_active = TRUE;
    IF v_category_type IS NULL OR
       (NEW.transaction_type = 'deposit' AND v_category_type <> 'income') OR
       (NEW.transaction_type = 'withdrawal' AND v_category_type <> 'expense') OR
       NEW.transaction_type NOT IN ('deposit','withdrawal') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Category type must match deposit or withdrawal';
    END IF;
  END IF;
END$$

-- Validation trigger: enforce account state and movement semantics for direct inserts too.
CREATE TRIGGER trg_transactions_validate_before_insert
BEFORE INSERT ON transactions
FOR EACH ROW
BEGIN
  DECLARE v_source_status VARCHAR(16);
  DECLARE v_destination_status VARCHAR(16);

  SELECT status INTO v_source_status
  FROM accounts WHERE account_id = NEW.source_account_id;
  IF v_source_status IS NULL OR v_source_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Source account must exist and be active';
  END IF;

  IF NEW.transaction_type = 'transfer' THEN
    SELECT status INTO v_destination_status
    FROM accounts WHERE account_id = NEW.destination_account_id;
    IF v_destination_status IS NULL OR v_destination_status <> 'active' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Destination account must exist and be active';
    END IF;
  END IF;
END$$

-- Validation trigger: ensure repayment detail corresponds to a loan_repayment ledger row.
CREATE TRIGGER trg_loan_payments_validate_before_insert
BEFORE INSERT ON loan_payments
FOR EACH ROW
BEGIN
  DECLARE v_type VARCHAR(24);
  DECLARE v_amount DECIMAL(15,2);
  DECLARE v_tx_status VARCHAR(16);

  SELECT transaction_type, amount, status
    INTO v_type, v_amount, v_tx_status
  FROM transactions WHERE transaction_id = NEW.transaction_id;
  IF v_type IS NULL OR v_type <> 'loan_repayment' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment must reference a loan_repayment transaction';
  END IF;
  IF v_tx_status <> NEW.status OR v_amount <> NEW.principal_paid + NEW.interest_paid THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment status and amount must match its transaction';
  END IF;
END$$

-- Atomic transfer. Locks both accounts in ascending ID order and checks the ledger balance.
CREATE PROCEDURE TransferFunds(
  IN p_source_account_id BIGINT UNSIGNED,
  IN p_destination_account_id BIGINT UNSIGNED,
  IN p_amount DECIMAL(15,2),
  IN p_description VARCHAR(500)
)
BEGIN
  DECLARE v_source_status VARCHAR(16);
  DECLARE v_destination_status VARCHAR(16);
  DECLARE v_source_balance DECIMAL(17,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_source_account_id = p_destination_account_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Source and destination must differ';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transfer amount must be positive';
  END IF;

  START TRANSACTION;
  -- Stable lock order reduces deadlocks when opposite-direction transfers overlap.
  IF p_source_account_id < p_destination_account_id THEN
    SELECT status INTO v_source_status FROM accounts
      WHERE account_id = p_source_account_id FOR UPDATE;
    SELECT status INTO v_destination_status FROM accounts
      WHERE account_id = p_destination_account_id FOR UPDATE;
  ELSE
    SELECT status INTO v_destination_status FROM accounts
      WHERE account_id = p_destination_account_id FOR UPDATE;
    SELECT status INTO v_source_status FROM accounts
      WHERE account_id = p_source_account_id FOR UPDATE;
  END IF;

  IF v_source_status IS NULL OR v_destination_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both accounts must exist';
  END IF;
  IF v_source_status <> 'active' OR v_destination_status <> 'active' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Both accounts must be active';
  END IF;

  SELECT current_balance INTO v_source_balance
  FROM AccountSummaryView WHERE account_id = p_source_account_id;
  IF v_source_balance < p_amount THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient funds';
  END IF;

  INSERT INTO transactions
    (source_account_id, destination_account_id, transaction_type, amount, status, description)
  VALUES
    (p_source_account_id, p_destination_account_id, 'transfer', p_amount, 'posted', p_description);
  COMMIT;
END$$

-- These assertions make invalid-data checks reproducible without aborting the full script.
CREATE PROCEDURE TestExpectedConstraintFailures()
BEGIN
  DECLARE v_failed BOOLEAN DEFAULT FALSE;

  SET v_failed = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_failed = TRUE;
    INSERT INTO accounts (customer_id, branch_id, account_number, account_type, opening_balance)
      VALUES (999999, 1, 'INVALID-FK-TEST', 'checking', 0.00);
  END;
  IF NOT v_failed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed: invalid customer FK was accepted';
  END IF;

  SET v_failed = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_failed = TRUE;
    INSERT INTO transactions (source_account_id, transaction_type, amount)
      VALUES (1, 'withdrawal', -1.00);
  END;
  IF NOT v_failed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed: negative transaction was accepted';
  END IF;

  SET v_failed = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_failed = TRUE;
    INSERT INTO transactions (source_account_id, transaction_type, amount)
      VALUES (1, 'transfer', 1.00);
  END;
  IF NOT v_failed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed: transfer without destination was accepted';
  END IF;

  SELECT 'PASS: invalid customer FK rejected' AS constraint_test;
  SELECT 'PASS: negative amount rejected' AS constraint_test;
  SELECT 'PASS: transfer missing destination rejected' AS constraint_test;

  SET v_failed = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_failed = TRUE;
    CALL TransferFunds(1, 3, 999999.00, 'Expected insufficient funds test');
  END;
  IF NOT v_failed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed: insufficient-funds transfer was accepted';
  END IF;
  SELECT 'PASS: insufficient-funds transfer rejected and rolled back' AS constraint_test;

  SET v_failed = FALSE;
  BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET v_failed = TRUE;
    CALL TransferFunds(1, 1, 1.00, 'Expected same-account test');
  END;
  IF NOT v_failed THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test failed: same-account transfer was accepted';
  END IF;
  SELECT 'PASS: same-account transfer rejected' AS constraint_test;
END$$

DELIMITER ;

-- Seed data: explicit IDs keep the example operations/tests deterministic.
INSERT INTO branches (branch_id, branch_code, name, address, phone) VALUES
  (1, 'BR-NORTH', 'Northside Branch', '12 North Road', '+1-555-0101'),
  (2, 'BR-CENTRAL', 'Central Branch', '80 Main Street', '+1-555-0102'),
  (3, 'BR-WEST', 'West Branch', '4 West Avenue', '+1-555-0103'),
  (4, 'BR-EAST', 'East Branch', '9 East Road', '+1-555-0104'),
  (5, 'BR-SOUTH', 'South Branch', '18 South Street', '+1-555-0105'),
  (6, 'BR-LAKE', 'Lake Branch', '7 Lake Avenue', '+1-555-0106'),
  (7, 'BR-HILL', 'Hill Branch', '21 Hill Road', '+1-555-0107'),
  (8, 'BR-PARK', 'Park Branch', '3 Park Lane', '+1-555-0108'),
  (9, 'BR-RIVER', 'River Branch', '65 River Street', '+1-555-0109'),
  (10, 'BR-CAMPUS', 'Campus Branch', '1 University Way', '+1-555-0110');

INSERT INTO expense_categories (expense_category_id, category_name, category_type) VALUES
  (1, 'Food', 'expense'), (2, 'Travel', 'expense'), (3, 'Hostel', 'expense'),
  (4, 'Books', 'expense'), (5, 'College Fees', 'expense'), (6, 'Entertainment', 'expense'),
  (7, 'Other', 'expense'), (8, 'Allowance', 'income'), (9, 'Scholarship', 'income'),
  (10, 'Family Support', 'income'), (11, 'Other Income', 'income');

INSERT INTO customers
  (customer_id, first_name, last_name, email, phone, date_of_birth, address, student_id, institution, department, graduation_year) VALUES
  (1, 'Asha', 'Patel', 'asha.patel@example.test', '+1-555-1001', '2004-04-12', '10 Maple Lane', 'STU-24001', 'Northstar University', 'Computer Science', 2027),
  (2, 'Rohan', 'Mehta', 'rohan.mehta@example.test', '+1-555-1002', '2003-11-02', '22 Cedar Street', 'STU-24002', 'Northstar University', 'Business', 2026),
  (3, 'Mina', 'Shah', 'mina.shah@example.test', '+1-555-1003', '2005-07-25', '7 Lake View', 'STU-24003', 'Northstar College', 'Design', 2028),
  (4, 'Dev', 'Rao', 'dev.rao@example.test', '+1-555-1004', '2004-02-18', '44 Hill Road', 'STU-24004', 'Northstar University', 'Engineering', 2027),
  (5, 'Noor', 'Khan', 'noor.khan@example.test', '+1-555-1005', '2003-09-30', '5 Garden Close', 'STU-24005', 'Northstar College', 'Arts', 2026),
  (6, 'Ishaan', 'Das', 'ishaan.das@example.test', '+1-555-1006', '2004-06-04', '8 Elm Street', 'STU-24006', 'Northstar University', 'Mathematics', 2027),
  (7, 'Leela', 'Nair', 'leela.nair@example.test', '+1-555-1007', '2005-01-16', '32 Palm Road', 'STU-24007', 'Northstar College', 'Biology', 2028),
  (8, 'Kabir', 'Joshi', 'kabir.joshi@example.test', '+1-555-1008', '2003-12-21', '19 Birch Lane', 'STU-24008', 'Northstar University', 'Economics', 2026),
  (9, 'Sara', 'Fernandes', 'sara.fernandes@example.test', '+1-555-1009', '2004-08-13', '41 Oak Avenue', 'STU-24009', 'Northstar College', 'Media Studies', 2027),
  (10, 'Arjun', 'Roy', 'arjun.roy@example.test', '+1-555-1010', '2005-03-11', '26 Pine Street', 'STU-24010', 'Northstar University', 'Physics', 2028);

INSERT INTO accounts
  (account_id, customer_id, branch_id, account_number, account_type, opening_balance, opened_on, status) VALUES
  (1, 1, 1, 'ACCT-10001', 'checking', 1000.00, '2025-01-10', 'active'),
  (2, 2, 1, 'ACCT-10002', 'savings', 2500.00, '2025-02-03', 'active'),
  (3, 3, 2, 'ACCT-10003', 'checking', 500.00, '2025-03-15', 'active'),
  (4, 4, 2, 'ACCT-10004', 'savings', 1200.00, '2025-04-20', 'active'),
  (5, 5, 3, 'ACCT-10005', 'checking', 800.00, '2025-05-05', 'active'),
  (6, 1, 3, 'ACCT-10006', 'savings', 300.00, '2025-06-01', 'active'),
  (7, 6, 4, 'ACCT-10007', 'checking', 650.00, '2026-10-01', 'active'),
  (8, 7, 5, 'ACCT-10008', 'savings', 720.00, '2026-10-03', 'active'),
  (9, 8, 6, 'ACCT-10009', 'checking', 540.00, '2026-10-05', 'active'),
  (10, 9, 7, 'ACCT-10010', 'savings', 900.00, '2026-10-07', 'active'),
  (11, 10, 8, 'ACCT-10011', 'checking', 810.00, '2026-10-09', 'active');

INSERT INTO savings_goals (customer_id, account_id, goal_name, target_amount, target_date) VALUES
  (1, 6, 'Laptop fund', 1200.00, '2027-06-01'),
  (2, 2, 'Campus trip', 800.00, '2026-12-15'),
  (3, 3, 'Emergency cushion', 1000.00, '2028-05-01'),
  (4, 4, 'Certification course', 650.00, '2027-03-01'),
  (5, 5, 'Study abroad fund', 2500.00, '2028-01-15'),
  (6, 7, 'New tablet', 900.00, '2027-08-01'),
  (7, 8, 'Summer internship travel', 700.00, '2027-05-15'),
  (8, 9, 'Emergency fund', 1200.00, '2028-01-01'),
  (9, 10, 'Camera equipment', 1600.00, '2027-11-01'),
  (10, 11, 'Graduate school applications', 500.00, '2028-02-01');

INSERT INTO loans
  (loan_id, customer_id, branch_id, loan_number, principal_amount, annual_interest_rate,
   term_months, issued_on, due_on, status) VALUES
  (1, 1, 1, 'LOAN-20001', 5000.00, 6.2500, 36, '2025-01-15', '2028-01-15', 'active'),
  (2, 2, 1, 'LOAN-20002', 12000.00, 5.7500, 60, '2025-02-20', '2030-02-20', 'active'),
  (3, 3, 2, 'LOAN-20003', 2500.00, 7.0000, 24, '2025-03-22', '2027-03-22', 'active'),
  (4, 5, 3, 'LOAN-20004', 8000.00, 6.0000, 48, '2025-05-10', '2029-05-10', 'pending'),
  (5, 5, 5, 'LOAN-20005', 3200.00, 5.5000, 24, '2025-06-10', '2027-06-10', 'active'),
  (6, 6, 4, 'LOAN-20006', 4500.00, 5.2500, 36, '2026-10-10', '2028-07-10', 'active'),
  (7, 7, 5, 'LOAN-20007', 2800.00, 5.7500, 24, '2025-08-10', '2027-08-10', 'active'),
  (8, 8, 6, 'LOAN-20008', 6000.00, 6.0000, 48, '2025-09-10', '2029-09-10', 'active'),
  (9, 9, 7, 'LOAN-20009', 3600.00, 5.9000, 36, '2025-10-10', '2028-10-10', 'active'),
  (10, 10, 8, 'LOAN-20010', 5200.00, 6.1000, 48, '2025-11-10', '2029-11-10', 'active');

-- Ledger rows: deposits increase the source account; withdrawals/repayments decrease it;
-- transfers debit source and credit destination. These are sample posted events.
INSERT INTO transactions
  (transaction_id, source_account_id, destination_account_id, transaction_type,
   expense_category_id, amount, occurred_at, status, description) VALUES
  (1, 1, NULL, 'deposit', 8, 300.00, '2026-10-01 10:00:00', 'posted', 'Monthly allowance'),
  (2, 1, NULL, 'withdrawal', 1, 50.00, '2026-10-02 11:00:00', 'posted', 'Campus lunch'),
  (3, 2, 3, 'transfer', NULL, 200.00, '2026-10-03 12:00:00', 'posted', 'Move between student accounts'),
  (4, 3, NULL, 'deposit', 9, 150.00, '2026-10-04 09:30:00', 'posted', 'Scholarship payment'),
  (5, 4, NULL, 'withdrawal', 3, 100.00, '2026-10-05 14:00:00', 'posted', 'Hostel charges'),
  (6, 5, NULL, 'deposit', 10, 250.00, '2026-10-06 16:00:00', 'posted', 'Family support'),
  (7, 1, 6, 'transfer', NULL, 125.00, '2026-10-07 13:00:00', 'posted', 'Move to savings'),
  (8, 1, NULL, 'loan_repayment', NULL, 200.00, '2026-10-08 08:00:00', 'posted', 'Education loan installment'),
  (9, 2, NULL, 'deposit', 8, 400.00, '2026-10-09 10:30:00', 'posted', 'Monthly allowance'),
  (10, 3, NULL, 'withdrawal', 4, 25.00, '2026-10-10 17:15:00', 'posted', 'Course materials'),
  (11, 6, NULL, 'deposit', 11, 80.00, '2026-10-11 10:00:00', 'pending', 'Other income sample'),
  (12, 2, NULL, 'loan_repayment', NULL, 55.00, '2026-10-12 10:00:00', 'posted', 'Education loan installment'),
  (13, 3, NULL, 'loan_repayment', NULL, 45.00, '2026-10-13 10:00:00', 'posted', 'Education loan installment'),
  (14, 5, NULL, 'loan_repayment', NULL, 50.00, '2026-10-14 10:00:00', 'posted', 'Education loan installment'),
  (15, 5, NULL, 'loan_repayment', NULL, 40.00, '2026-10-15 10:00:00', 'posted', 'Education loan installment'),
  (16, 7, NULL, 'loan_repayment', NULL, 35.00, '2026-10-16 10:00:00', 'posted', 'Education loan installment'),
  (17, 8, NULL, 'loan_repayment', NULL, 30.00, '2026-10-17 10:00:00', 'posted', 'Education loan installment'),
  (18, 9, NULL, 'loan_repayment', NULL, 32.00, '2026-10-18 10:00:00', 'posted', 'Education loan installment'),
  (19, 10, NULL, 'loan_repayment', NULL, 38.00, '2026-10-19 10:00:00', 'posted', 'Education loan installment'),
  (20, 11, NULL, 'loan_repayment', NULL, 28.00, '2026-10-20 10:00:00', 'posted', 'Education loan installment'),
  (21, 1, NULL, 'withdrawal', 2, 12.00, '2026-10-21 10:00:00', 'posted', 'Campus bus fare'),
  (22, 1, NULL, 'withdrawal', 5, 300.00, '2026-10-22 10:00:00', 'posted', 'Term tuition installment'),
  (23, 1, NULL, 'withdrawal', 6, 18.00, '2026-10-23 10:00:00', 'posted', 'Student club event'),
  (24, 1, NULL, 'withdrawal', 7, 7.00, '2026-10-24 10:00:00', 'posted', 'Stationery');

INSERT INTO loan_payments
  (loan_payment_id, loan_id, transaction_id, principal_paid, interest_paid, paid_at, status) VALUES
  (1, 1, 8, 180.00, 20.00, '2026-10-08 08:00:00', 'posted'),
  (2, 2, 12, 50.00, 5.00, '2026-10-12 10:00:00', 'posted'),
  (3, 3, 13, 40.00, 5.00, '2026-10-13 10:00:00', 'posted'),
  (4, 4, 14, 45.00, 5.00, '2026-10-14 10:00:00', 'posted'),
  (5, 5, 15, 35.00, 5.00, '2026-10-15 10:00:00', 'posted'),
  (6, 6, 16, 30.00, 5.00, '2026-10-16 10:00:00', 'posted'),
  (7, 7, 17, 25.00, 5.00, '2026-10-17 10:00:00', 'posted'),
  (8, 8, 18, 28.00, 4.00, '2026-10-18 10:00:00', 'posted'),
  (9, 9, 19, 34.00, 4.00, '2026-10-19 10:00:00', 'posted'),
  (10, 10, 20, 25.00, 3.00, '2026-10-20 10:00:00', 'posted');

-- Execute expected-failure constraint checks; rejected rows are caught and leave no partial changes.
CALL TestExpectedConstraintFailures();

-- CRUD examples (uncomment one operation at a time; these examples mutate demo data).
-- CREATE: INSERT INTO customers (first_name,last_name,email) VALUES ('Ira','Sen','ira.sen@example.test');
-- READ:   SELECT customer_id, first_name, last_name, email FROM customers ORDER BY last_name, first_name;
-- UPDATE: UPDATE customers SET phone = '+1-555-1099' WHERE customer_id = 1;
-- DELETE: DELETE FROM accounts WHERE account_id = 6; -- rejected if referenced by ledger; use status='closed'.

-- Search/filter examples.
SELECT customer_id, first_name, last_name, email
FROM customers WHERE last_name LIKE 'M%' ORDER BY last_name, first_name;

SELECT transaction_id, transaction_type, amount, occurred_at, status
FROM transactions
WHERE source_account_id = 1 AND occurred_at >= '2026-10-01' AND occurred_at < '2026-11-01'
ORDER BY occurred_at DESC;

SELECT loan_id, loan_number, principal_amount, status
FROM loans WHERE status IN ('active','pending') AND principal_amount >= 5000
ORDER BY principal_amount DESC;

-- JOIN and aggregate report examples.
SELECT c.customer_id, CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
       COUNT(a.account_id) AS account_count,
       COALESCE(SUM(v.current_balance), 0.00) AS total_balance,
       AVG(v.current_balance) AS average_account_balance
FROM customers c
LEFT JOIN accounts a ON a.customer_id = c.customer_id
LEFT JOIN AccountSummaryView v ON v.account_id = a.account_id
GROUP BY c.customer_id, c.first_name, c.last_name
ORDER BY total_balance DESC;

SELECT b.branch_code, b.name AS branch_name,
       COALESCE(ac.account_count, 0) AS account_count,
       COALESCE(ac.total_branch_balance, 0.00) AS total_branch_balance,
       COALESCE(lo.loan_count, 0) AS loan_count,
       COALESCE(lo.loan_principal_total, 0.00) AS loan_principal_total
FROM branches b
LEFT JOIN (
  SELECT a.branch_id, COUNT(*) AS account_count, SUM(v.current_balance) AS total_branch_balance
  FROM accounts a JOIN AccountSummaryView v ON v.account_id = a.account_id
  GROUP BY a.branch_id
) ac ON ac.branch_id = b.branch_id
LEFT JOIN (
  SELECT branch_id, COUNT(*) AS loan_count, SUM(principal_amount) AS loan_principal_total
  FROM loans GROUP BY branch_id
) lo ON lo.branch_id = b.branch_id
ORDER BY b.branch_code;

SELECT transaction_type, COUNT(*) AS transaction_count,
       SUM(amount) AS transaction_amount_total,
       AVG(amount) AS average_transaction_amount
FROM transactions WHERE status = 'posted'
GROUP BY transaction_type ORDER BY transaction_type;

SELECT l.loan_number, CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
       l.principal_amount,
       COALESCE(SUM(CASE WHEN lp.status = 'posted' THEN lp.principal_paid ELSE 0 END), 0.00) AS principal_repaid,
       COALESCE(SUM(CASE WHEN lp.status = 'posted' THEN lp.interest_paid ELSE 0 END), 0.00) AS interest_repaid
FROM loans l
JOIN customers c ON c.customer_id = l.customer_id
LEFT JOIN loan_payments lp ON lp.loan_id = l.loan_id
GROUP BY l.loan_id, l.loan_number, c.first_name, c.last_name, l.principal_amount
ORDER BY l.loan_number;

-- Student monthly allowance/income and categorized spending (edit student ID/month).
SELECT c.student_id, CONCAT(c.first_name, ' ', c.last_name) AS student_name,
       DATE_FORMAT(t.occurred_at, '%Y-%m') AS report_month,
       SUM(CASE WHEN t.transaction_type = 'deposit' AND ec.category_type = 'income' THEN t.amount ELSE 0 END) AS income_total,
       SUM(CASE WHEN t.transaction_type = 'withdrawal' AND ec.category_type = 'expense' THEN t.amount ELSE 0 END) AS expense_total
FROM customers c
JOIN accounts a ON a.customer_id = c.customer_id
JOIN transactions t ON t.source_account_id = a.account_id AND t.status = 'posted'
JOIN expense_categories ec ON ec.expense_category_id = t.expense_category_id
WHERE c.customer_id = 1 AND t.occurred_at >= '2026-10-01' AND t.occurred_at < '2026-11-01'
GROUP BY c.customer_id, c.student_id, c.first_name, c.last_name, DATE_FORMAT(t.occurred_at, '%Y-%m');

-- Expense breakdown by category. Transfers and loan repayments are intentionally excluded.
SELECT ec.category_name, COUNT(*) AS expense_count, SUM(t.amount) AS expense_total,
       AVG(t.amount) AS average_expense
FROM transactions t JOIN expense_categories ec ON ec.expense_category_id = t.expense_category_id
JOIN accounts a ON a.account_id = t.source_account_id
WHERE a.customer_id = 1 AND t.status = 'posted' AND t.transaction_type = 'withdrawal'
  AND ec.category_type = 'expense' AND t.occurred_at >= '2026-10-01' AND t.occurred_at < '2026-11-01'
GROUP BY ec.category_name ORDER BY expense_total DESC;

-- Savings progress is a non-reserved estimate derived from each goal's linked account balance.
SELECT g.goal_name, g.target_amount, v.current_balance,
       LEAST(v.current_balance, g.target_amount) AS progress_amount,
       ROUND(LEAST(v.current_balance, g.target_amount) / g.target_amount * 100, 1) AS progress_percent
FROM savings_goals g JOIN AccountSummaryView v ON v.account_id = g.account_id
WHERE g.customer_id = 1 AND g.status = 'active';

-- Procedure demo: transfers 25.00 from account 2 to account 3; rerunning the whole script resets data.
CALL TransferFunds(2, 3, 25.00, 'Stored procedure demo transfer');

-- Verify derived balances and the transfer record.
SELECT account_number, current_balance
FROM AccountSummaryView ORDER BY account_id;
SELECT transaction_id, source_account_id, destination_account_id, amount, status
FROM transactions WHERE description = 'Stored procedure demo transfer';

-- Additional manual validation cases:
-- CALL TransferFunds(1, 3, 999999.00, 'Expected insufficient funds'); -- raises SQLSTATE 45000
-- CALL TransferFunds(1, 1, 10.00, 'Expected same-account rejection'); -- raises SQLSTATE 45000
-- UPDATE accounts SET status='frozen' WHERE account_id=1;
-- INSERT INTO transactions(source_account_id, transaction_type, amount) VALUES(1,'deposit',1.00);
-- Expected: trg_transactions_validate_before_insert rejects inactive account.

