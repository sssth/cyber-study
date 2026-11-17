const MAX_HISTORY = 240;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)));
  return sorted[index];
}

function round(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createGpuTimer(gl) {
  if (!gl || typeof gl.getContext !== 'function') return null;
  const context = gl.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext;
  if (!isWebGL2) return null;
  const ext = context.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;

  const pending = [];
  let activeQuery = null;

  return {
    supported: true,
    poll() {
      const completed = [];
      const disjoint = context.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const query = pending[0];
        const available = context.getQueryParameter(query, context.QUERY_RESULT_AVAILABLE);
        if (!available) break;
        pending.shift();
        const ns = disjoint ? null : context.getQueryParameter(query, context.QUERY_RESULT);
        context.deleteQuery(query);
        if (ns !== null && Number.isFinite(ns)) completed.push(ns / 1e6);
      }
      if (disjoint) {
        while (pending.length) context.deleteQuery(pending.shift());
      }
      return completed;
    },
    begin() {
      if (activeQuery || pending.length > 8) return;
      const query = context.createQuery();
      if (!query) return;
      context.beginQuery(ext.TIME_ELAPSED_EXT, query);
      activeQuery = query;
    },
    end() {
      if (!activeQuery) return;
      context.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(activeQuery);
      activeQuery = null;
    },
    dispose() {
      if (activeQuery) {
        try { context.endQuery(ext.TIME_ELAPSED_EXT); } catch {}
        pending.push(activeQuery);
        activeQuery = null;
      }
      while (pending.length) context.deleteQuery(pending.shift());
    }
  };
}

export function createFrameProfiler() {
  let leases = 0;
  let manualEnabled = false;
  let userTiming = false;
  let frameOpen = false;
  let frameStart = 0;
  let lastFrameStart = 0;
  let currentStages = Object.create(null);
  let activeZones = new Map();
  let lastGpuMs = null;
  let gpuSupported = false;

  const history = [];
  const listeners = new Set();

  const isActive = () => leases > 0 || manualEnabled;

  function notify() {
    for (const listener of listeners) listener(isActive());
  }

  function reset() {
    history.length = 0;
    frameOpen = false;
    frameStart = 0;
    lastFrameStart = 0;
    currentStages = Object.create(null);
    activeZones.clear();
    lastGpuMs = null;
  }

  function beginFrame(gpuSamples = []) {
    if (!isActive()) return;
    const t = nowMs();
    if (gpuSamples.length) {
      gpuSupported = true;
      lastGpuMs = gpuSamples[gpuSamples.length - 1];
    }
    frameStart = t;
    frameOpen = true;
    currentStages = Object.create(null);
    activeZones.clear();
    if (userTiming && typeof performance !== 'undefined' && performance.mark) {
      performance.mark('cyber-study:frame:start');
    }
  }

  function beginZone(name) {
    if (!isActive()) return;
    activeZones.set(name, nowMs());
    if (userTiming && typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`zone:${name}:start`);
    }
  }

  function endZone(name) {
    if (!isActive()) return 0;
    const start = activeZones.get(name);
    if (start === undefined) return 0;
    activeZones.delete(name);
    const elapsed = nowMs() - start;
    currentStages[name] = (currentStages[name] ?? 0) + elapsed;
    if (userTiming && typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(`zone:${name}`, `zone:${name}:start`);
      } catch {}
    }
    return elapsed;
  }

  function measureZone(name, fn) {
    if (!isActive()) return fn();
    beginZone(name);
    try {
      return fn();
    } finally {
      endZone(name);
    }
  }

  function commitFrame({ gl, scene, gpuAvailable = false } = {}) {
    if (!isActive()) return;
    if (gpuAvailable) gpuSupported = true;
    const end = nowMs();
    if (!frameOpen) frameStart = end;
    frameOpen = false;
    const cpuFrameMs = Math.max(0, end - frameStart);
    const intervalMs = lastFrameStart > 0 ? Math.max(0, frameStart - lastFrameStart) : null;
    lastFrameStart = frameStart;

    if (userTiming && typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure('cyber-study:frame', 'cyber-study:frame:start');
      } catch {}
    }

    const info = gl?.info;
    const heapBytes = typeof performance !== 'undefined' && performance.memory
      ? performance.memory.usedJSHeapSize
      : null;

    const record = {
      timestamp: end,
      intervalMs,
      cpuFrameMs,
      gpuMs: lastGpuMs,
      stages: currentStages,
      render: info ? {
        calls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? null
      } : null,
      optimization: scene?.userData?.renderOptimizationStats
        ? { ...scene.userData.renderOptimizationStats }
        : null,
      heapMb: heapBytes !== null ? round(heapBytes / (1024 * 1024), 1) : null
    };

    history.push(record);
    if (history.length > MAX_HISTORY) history.shift();
  }

  function summarize(sampleLimit = MAX_HISTORY) {
    const slice = history.slice(-sampleLimit);
    if (!slice.length) {
      return {
        active: isActive(),
        frameCount: 0,
        fps: 0,
        avgIntervalMs: null,
        p50Ms: null,
        p95Ms: null,
        p99Ms: null,
        maxIntervalMs: null,
        avgCpuFrameMs: null,
        avgGpuMs: null,
        gpuSupported,
        stages: [],
        render: null,
        optimization: null,
        heapMb: null
      };
    }

    const intervals = slice.map((item) => item.intervalMs).filter((v) => v !== null && v > 0);
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const avgIntervalMs = intervals.length
      ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
      : null;

    const cpuFrames = slice.map((item) => item.cpuFrameMs);
    const avgCpuFrameMs = cpuFrames.reduce((sum, value) => sum + value, 0) / cpuFrames.length;

    const gpuSamples = slice.map((item) => item.gpuMs).filter((v) => v !== null);
    const avgGpuMs = gpuSamples.length
      ? gpuSamples.reduce((sum, value) => sum + value, 0) / gpuSamples.length
      : null;

    const stageTotals = new Map();
    for (const item of slice) {
      for (const [name, duration] of Object.entries(item.stages)) {
        const entry = stageTotals.get(name) ?? { sum: 0, max: 0, count: 0 };
        entry.sum += duration;
        entry.max = Math.max(entry.max, duration);
        entry.count += 1;
        stageTotals.set(name, entry);
      }
    }

    const stages = [...stageTotals.entries()]
      .map(([name, entry]) => ({
        name,
        avgMs: round(entry.sum / slice.length, 2),
        maxMs: round(entry.max, 2)
      }))
      .sort((a, b) => b.avgMs - a.avgMs);

    const latest = slice[slice.length - 1];
    return {
      active: isActive(),
      frameCount: slice.length,
      fps: avgIntervalMs ? Math.round(1000 / avgIntervalMs) : 0,
      avgIntervalMs: round(avgIntervalMs, 1),
      p50Ms: intervals.length ? round(percentile(sortedIntervals, 0.5), 1) : null,
      p95Ms: intervals.length ? round(percentile(sortedIntervals, 0.95), 1) : null,
      p99Ms: intervals.length ? round(percentile(sortedIntervals, 0.99), 1) : null,
      maxIntervalMs: intervals.length ? round(sortedIntervals[sortedIntervals.length - 1], 1) : null,
      avgCpuFrameMs: round(avgCpuFrameMs, 2),
      avgGpuMs: round(avgGpuMs, 2),
      gpuSupported,
      stages,
      render: latest.render,
      optimization: latest.optimization,
      heapMb: latest.heapMb
    };
  }

  return {
    get active() { return isActive(); },
    get userTiming() { return userTiming; },
    retain() {
      leases += 1;
      notify();
      return () => {
        leases = Math.max(0, leases - 1);
        notify();
      };
    },
    enable() {
      manualEnabled = true;
      notify();
    },
    disable() {
      manualEnabled = false;
      notify();
    },
    setUserTiming(enabled) {
      userTiming = Boolean(enabled);
      if (!userTiming && typeof performance !== 'undefined' && performance.clearMarks) {
        performance.clearMarks();
        performance.clearMeasures();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset,
    beginFrame,
    beginZone,
    endZone,
    measureZone,
    commitFrame,
    summarize,
    snapshot() {
      return {
        summary: summarize(),
        recentFrames: history.slice(-60)
      };
    }
  };
}

export const frameProfiler = createFrameProfiler();

if (typeof window !== 'undefined') {
  window.cyberStudyProfiler = {
    enable: () => frameProfiler.enable(),
    disable: () => frameProfiler.disable(),
    setUserTiming: (enabled) => frameProfiler.setUserTiming(enabled),
    summary: (frames) => frameProfiler.summarize(frames),
    snapshot: () => frameProfiler.snapshot(),
    reset: () => frameProfiler.reset()
  };
}
