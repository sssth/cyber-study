const providers = new Map([
  ['claude', { name: 'Claude', models: ['claude-sonnet-4-6'], url: 'https://api.anthropic.com/v1/messages' }],
  ['openai', { name: 'ChatGPT（OpenAI）', models: ['gpt-4.1-mini', 'gpt-4.1'], url: 'https://api.openai.com/v1/chat/completions' }],
  ['gemini', { name: 'Gemini', models: ['gemini-4-hydrogen'], url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' }],
  ['deepseek', { name: 'DeepSeek', models: ['deepseek-flash', 'deepseek-v4-pro'], url: 'https://api.deepseek.com/chat/completions' }],
  ['glm', { name: '智谱 GLM', models: ['glm-5.3', 'glm-5.3-flash'], url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' }],
  ['kimi', { name: 'Kimi', models: ['kimi-k2.5'], url: 'https://api.moonshot.cn/v1/chat/completions' }]
]);

function listProviders() {
  return Array.from(providers, ([id, { name, models }]) => ({ id, name, models: [...models] }));
}

// messages 包含按时间排列的 user / assistant 文本，最后一条为本次提问。
async function chat(input, request = fetch, onText) {
  const { provider, model, apiKey, messages, system = '' } = input || {};
  const config = providers.get(provider);
  if (!config) throw new Error('请选择支持的 AI 厂商。');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请输入该厂商的 API Key。');
  if (typeof model !== 'string' || !model.trim()) throw new Error('请选择或填写模型 ID。');
  if (typeof system !== 'string' || !Array.isArray(messages) || messages.at(-1)?.role !== 'user'
      || !messages.every(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())) {
    throw new Error('请提供有效的对话记录，并以用户提问结束。');
  }

  const history = messages.map(({ role, content }) => ({ role, content }));
  const headers = { 'Content-Type': 'application/json' };
  const body = { model: model.trim(), messages: history };
  if (provider === 'claude') {
    headers['x-api-key'] = apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body.max_tokens = 4096;
    if (system) body.system = system;
  } else {
    headers.Authorization = 'Bearer ' + apiKey.trim();
    if (system) history.unshift({ role: 'system', content: system });
  }

  if (onText) body.stream = true;
  let response, data;
  try {
    response = await request(config.url, {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'error',
      signal: AbortSignal.timeout(120000)
    });
    if (response.ok && !onText) data = await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('AI 请求超时，请稍后重试。');
    if (error instanceof SyntaxError) throw new Error('厂商返回了无法解析的回复。');
    throw new Error('无法连接到 ' + config.name + '，请检查网络连接。');
  }
  if (!response.ok) {
    const hints = { 400: '请检查模型和消息格式', 401: '请检查 API Key', 402: '请检查账户余额',
      403: '请检查账户权限', 404: '请检查模型 ID', 429: '请检查额度或稍后重试' };
    throw new Error(config.name + ' 请求失败（' + response.status + '），' + (hints[response.status] || '请稍后重试') + '。');
  }
  if (onText) return require('./aiStream.cjs').readReply(response.body, onText);
  const text = provider === 'claude'
    ? data?.content?.filter(part => part.type === 'text').map(part => part.text).join('')
    : data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回可显示的文本。');
  return { role: 'assistant', content: text };
}

module.exports = { chat, listProviders };
