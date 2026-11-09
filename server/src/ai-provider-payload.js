'use strict';
const {endpoint} = require('./ai-provider-transport');

// Keep the compatibility channel on the common Chat Completions surface. A
// provider accepting text does not establish JSON mode, tools or vision support.
function isDeepseek(config) {
 return config.apiUrl === 'https://api.deepseek.com/chat/completions' && (!config.provider && !config.transport || (config.provider || config.transport) === 'deepseek');
}
function validModelSettings(config) {
 if (!config.apiUrl || !config.model) return false;
 const provider = config.provider || config.transport || 'deepseek';
 if (provider === 'deepseek') return isDeepseek(config);
 if (provider !== 'openai-compatible') return false;
 try { return endpoint(config.apiUrl) === config.apiUrl; } catch { return false; }
}
function modelOptions(config, {maxTokens, temperature, json = false} = {}) {
 const deepseek = isDeepseek(config), options = {};
 if (Number.isSafeInteger(maxTokens) && maxTokens > 0) {
  const completionTokens = !deepseek && /^(?:gpt-[56](?:[.\-]|$)|o[134](?:[.\-]|$))/i.test(config.model || '');
  options[completionTokens ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
 }
 if (deepseek) {
  options.thinking = {type: 'disabled'};
  if (Number.isFinite(temperature)) options.temperature = temperature;
  if (json) options.response_format = {type: 'json_object'};
 }
 return options;
}
module.exports = {isDeepseek, modelOptions, validModelSettings};
