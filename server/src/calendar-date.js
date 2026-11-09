const { ApiError } = require('./utils');

function date(value) {
  const parsed = new Date(value + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== value) throw new ApiError(400, '日期无效');
  return value;
}

function week(value) {
  const parsed = new Date(date(value) + 'T00:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() - (parsed.getUTCDay() + 6) % 7);
  return parsed.toISOString().slice(0, 10);
}

function dayNumber(value){const s=value instanceof Date?value.toISOString().slice(0,10):String(value??'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return NaN;const n=Date.parse(s+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?n:NaN}
module.exports = { date, week, dayNumber };
