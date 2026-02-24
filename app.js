const ws = new WebSocket(`ws://${location.host}`);
const logEl = document.getElementById('log');
const cmdEl = document.getElementById('cmd');
const runBtn = document.getElementById('run');
const commLogEl = document.getElementById('commLog');

function now() {
  return new Date().toLocaleTimeString();
}

function addLog(text, type = 'ok') {
  const div = document.createElement('div');
  div.className = `item ${type}`;
  div.textContent = text;
  logEl.prepend(div);
}

function addComm(direction, payload) {
  const div = document.createElement('div');
  div.className = `item ${direction === 'SEND' ? 'ok' : 'err'}`;
  div.textContent = `[${now()}] ${direction} ${payload}`;
  commLogEl.prepend(div);
}

ws.onopen = () => {
  addLog('WebSocket 已连接');
  addComm('RECV', 'connected');
};
ws.onmessage = (evt) => {
  addComm('RECV', evt.data.length > 300 ? `${evt.data.slice(0, 300)}...` : evt.data);
  try {
    const msg = JSON.parse(evt.data);
    const mark = msg.ok ? '✅' : '❌';
    addLog(`${mark} ${msg.message}${msg.data ? `\n${JSON.stringify(msg.data, null, 2)}` : ''}`, msg.ok ? 'ok' : 'err');
  } catch {
    addLog(evt.data);
  }
};
ws.onerror = () => {
  addLog('连接异常', 'err');
  addComm('RECV', 'socket error');
};

runBtn.addEventListener('click', () => {
  const command = cmdEl.value.trim();
  if (!command) return;
  const payload = JSON.stringify({ type: 'command', command });
  addComm('SEND', payload);
  ws.send(payload);
  cmdEl.value = '';
});

cmdEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runBtn.click();
});
