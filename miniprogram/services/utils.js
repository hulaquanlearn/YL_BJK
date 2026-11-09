function formatDigitInput(inputValue) {
  return String(inputValue || '')
    .replace(/[^\d.]/g, '')
    .replace(/^\./g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/(\d+\.\d+)\./g, '$1');
}

function isEmptyValue(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function decodeQueryValue(value) {
  try { return decodeURIComponent(String(value || '')); }
  catch (_) { return String(value || ''); }
}

module.exports = { formatDigitInput, isEmptyValue, decodeQueryValue };
