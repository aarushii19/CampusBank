-- CampusBank migration 001: apply once to an existing bank_management database.
-- Non-destructive: adds nullable student fields and new tables/columns only.
USE bank_management;

ALTER TABLE customers
  ADD COLUMN student_id VARCHAR(40) NULL,
  ADD COLUMN institution VARCHAR(180) NULL,
  ADD COLUMN department VARCHAR(120) NULL,
  ADD COLUMN graduation_year SMALLINT UNSIGNED NULL,
  ADD CONSTRAINT uq_customers_student_id UNIQUE (student_id),
  ADD CONSTRAINT chk_customers_graduation_year
    CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2000 AND 2200);

-- Backfill only the known fictional seed profiles; user/customer data is left untouched.
UPDATE customers SET student_id = 'STU-24001', institution = 'Northstar University', department = 'Computer Science', graduation_year = 2027 WHERE email = 'asha.patel@example.test' AND student_id IS NULL;
UPDATE customers SET student_id = 'STU-24002', institution = 'Northstar University', department = 'Business', graduation_year = 2026 WHERE email = 'rohan.mehta@example.test' AND student_id IS NULL;
UPDATE customers SET student_id = 'STU-24003', institution = 'Northstar College', department = 'Design', graduation_year = 2028 WHERE email = 'mina.shah@example.test' AND student_id IS NULL;
UPDATE customers SET student_id = 'STU-24004', institution = 'Northstar University', department = 'Engineering', graduation_year = 2027 WHERE email = 'dev.rao@example.test' AND student_id IS NULL;
UPDATE customers SET student_id = 'STU-24005', institution = 'Northstar College', department = 'Arts', graduation_year = 2026 WHERE email = 'noor.khan@example.test' AND student_id IS NULL;

CREATE TABLE expense_categories (
  expense_category_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(60) NOT NULL,
  category_type ENUM('income','expense') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (expense_category_id),
  CONSTRAINT uq_expense_categories_type_name UNIQUE (category_type, category_name)
) ENGINE=InnoDB;

INSERT INTO expense_categories (category_name, category_type) VALUES
  ('Food','expense'), ('Travel','expense'), ('Hostel','expense'), ('Books','expense'),
  ('College Fees','expense'), ('Entertainment','expense'), ('Other','expense'),
  ('Allowance','income'), ('Scholarship','income'), ('Family Support','income'), ('Other Income','income');

ALTER TABLE transactions
  ADD COLUMN expense_category_id BIGINT UNSIGNED NULL,
  ADD KEY ix_transactions_category_time (expense_category_id, occurred_at),
  ADD CONSTRAINT fk_transactions_category FOREIGN KEY (expense_category_id)
    REFERENCES expense_categories(expense_category_id) ON UPDATE CASCADE ON DELETE RESTRICT;

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
DELIMITER ;
