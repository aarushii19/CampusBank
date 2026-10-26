const { HttpError } = require('./errors');

const positiveId = (value, field = 'id') => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`, 'VALIDATION_ERROR');
  }
  return parsed;
};

const requiredString = (value, field, max = 255) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `${field} is required and must be at most ${max} characters`, 'VALIDATION_ERROR');
  }
  return value.trim();
};

const positiveAmount = (value, field = 'amount') => {
  const normalized = normalizeMoney(value, field, false);
  if (normalized === '0.00') throw new HttpError(400, `${field} must be positive`, 'VALIDATION_ERROR');
  return normalized;
};

const nonNegativeAmount = (value, field) => {
  return normalizeMoney(value, field, true);
};

function normalizeMoney(value, field, allowZero) {
  const raw = String(value);
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(raw)) {
    throw new HttpError(400, `${field} must be a ${allowZero ? 'non-negative' : 'positive'} amount with at most two decimal places`, 'VALIDATION_ERROR');
  }
  const [whole, fraction = ''] = raw.split('.');
  const normalized = `${whole}.${fraction.padEnd(2, '0')}`;
  if (!allowZero && /^0+\.00$/.test(normalized)) {
    throw new HttpError(400, `${field} must be positive`, 'VALIDATION_ERROR');
  }
  return normalized;
}

function moneyToCents(value) {
  const [whole, fraction] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt((fraction || '').padEnd(2, '0'));
}

const enumValue = (value, allowed, field) => {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(', ')}`, 'VALIDATION_ERROR');
  }
  return value;
};

const hasOnly = (body, fields) => {
  const unknown = Object.keys(body || {}).filter((key) => !fields.includes(key));
  if (unknown.length) throw new HttpError(400, `Unsupported field(s): ${unknown.join(', ')}`, 'VALIDATION_ERROR');
};

module.exports = { positiveId, requiredString, positiveAmount, nonNegativeAmount, moneyToCents, enumValue, hasOnly };
