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

module.exports = { formatDigitInput, isEmptyValue };
