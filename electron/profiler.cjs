const { app, contentTracing, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const TRACE_CATEGORIES = [
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'v8',
  'v8.execute',
  'gpu',
  'viz',
  'cc',
  'ipc',
  'toplevel',
  'electron'
];

function isProfilingAllowed() {
  return !app.isPackaged || process.env.CYBER_STUDY_PROFILE === '1';
}

function formatStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function tracesDir() {
  const dir = path.join(app.getPath('userData'), 'traces');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function configureGpuSwitches() {
  if (process.env.CYBER_STUDY_ANGLE) {
    app.commandLine.appendSwitch('use-angle', process.env.CYBER_STUDY_ANGLE);
  }
  if (process.env.CYBER_STUDY_RENDERDOC === '1') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
  if (process.env.CYBER_STUDY_IGNORE_GPU_BLOCKLIST === '1') {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
  }
}

function registerProfiler(getMainWindow) {
  let recording = false;
  let startedAt = null;
  let lastFile = '';
  let autoStopTimer = null;

  const isTrusted = (event) => {
    const win = getMainWindow();
    return Boolean(win && event.sender === win.webContents && event.senderFrame === event.sender.mainFrame);
  };

  const broadcastState = () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('profiler:trace-state', {
        allowed: isProfilingAllowed(),
        recording,
        startedAt,
        lastFile
      });
    }
  };

  async function startTrace(options = {}) {
    if (!isProfilingAllowed()) return { ok: false, error: '当前运行模式未启用 Trace 录制。' };
    if (recording) return { ok: true, recording: true, startedAt };
    await contentTracing.startRecording({
      included_categories: TRACE_CATEGORIES,
      recording_mode: 'record-continuously'
    });
    recording = true;
    startedAt = Date.now();
    broadcastState();
    const durationMs = Number(options.durationMs);
    if (Number.isFinite(durationMs) && durationMs > 0) {
      clearTimeout(autoStopTimer);
      autoStopTimer = setTimeout(() => {
        stopTrace().catch(() => {});
      }, Math.min(durationMs, 60000));
    }
    return { ok: true, recording: true, startedAt };
  }

  async function stopTrace() {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
    if (!recording) return { ok: false, error: '当前没有正在录制的 Trace。' };
    const targetFile = path.join(tracesDir(), `trace-${formatStamp()}.json`);
    const resultPath = await contentTracing.stopRecording(targetFile);
    recording = false;
    startedAt = null;
    lastFile = resultPath;
    broadcastState();
    console.info(`[profiler] Trace saved: ${resultPath}`);
    return { ok: true, recording: false, filePath: resultPath };
  }

  async function toggleTrace() {
    return recording ? stopTrace() : startTrace();
  }

  ipcMain.handle('profiler:status', (event) => {
    if (!isTrusted(event)) return null;
    return { allowed: isProfilingAllowed(), recording, startedAt, lastFile };
  });

  ipcMain.handle('profiler:start-trace', (event, options) => {
    if (!isTrusted(event)) return { ok: false, error: 'Unauthorized' };
    return startTrace(options);
  });

  ipcMain.handle('profiler:stop-trace', (event) => {
    if (!isTrusted(event)) return { ok: false, error: 'Unauthorized' };
    return stopTrace();
  });

  ipcMain.handle('profiler:save-report', (event, snapshot) => {
    if (!isTrusted(event)) return { ok: false, error: 'Unauthorized' };
    if (!isProfilingAllowed()) return { ok: false, error: '当前运行模式未启用报告导出。' };
    const filePath = path.join(tracesDir(), `report-${formatStamp()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      savedAt: new Date().toISOString(),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      gpuFeatureStatus: app.getGPUFeatureStatus(),
      snapshot
    }, null, 2), 'utf8');
    console.info(`[profiler] Report saved: ${filePath}`);
    return { ok: true, filePath };
  });

  ipcMain.handle('profiler:gpu-info', async (event) => {
    if (!isTrusted(event)) return null;
    const info = await app.getGPUInfo('basic').catch(() => null);
    return {
      featureStatus: app.getGPUFeatureStatus(),
      info
    };
  });

  ipcMain.handle('profiler:open-traces', (event) => {
    if (!isTrusted(event)) return false;
    if (!isProfilingAllowed()) return false;
    if (lastFile && fs.existsSync(lastFile)) shell.showItemInFolder(lastFile);
    else shell.openPath(tracesDir());
    return true;
  });

  function attachWindowShortcuts(win) {
    if (!isProfilingAllowed()) return;
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) return;
      if (input.key === 'F9') {
        event.preventDefault();
        win.webContents.send('profiler:toggle-hud');
      } else if (input.key === 'F10') {
        event.preventDefault();
        toggleTrace().catch((error) => {
          console.error('[profiler] Failed to toggle trace:', error);
        });
      } else if (input.key === 'F12') {
        event.preventDefault();
        win.webContents.toggleDevTools();
      }
    });
  }

  return { attachWindowShortcuts };
}

module.exports = {
  configureGpuSwitches,
  registerProfiler,
  isProfilingAllowed
};
