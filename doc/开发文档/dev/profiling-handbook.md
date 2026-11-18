# Cyber Study 性能统计与 Profile 手册

本文档提供 Electron + React + Three.js (`@react-three/fiber`) 架构下对标原生 C++ **Tracy / RenderDoc** 的完整抓帧、分阶段统计与卡顿定位方案。

---

## 1. 能力对照总览（Tracy → 本项目方案）

| 原生 C++ 手段 | 本项目对应能力 | 所在模块 | 用途 |
|---|---|---|---|
| Tracy 多线程时间线 | **Electron `contentTracing` + Perfetto** | `electron/profiler.cjs` | 抓取 Main / Renderer / GPU / Compositor / V8 GC / IPC 全进程时间线 |
| Tracy `ZoneScoped` | **`frameProfiler` + User Timing API** | `src/scenes/three/frameProfiler.js` | 拆分 `useFrame` 各子阶段耗时，并同步写入 Perfetto `Timings` 轨 |
| Tracy GPU Zones | **WebGL2 `EXT_disjoint_timer_query_webgl2`** | `src/scenes/three/frameProfiler.js` | 非阻塞异步读取单帧真实 GPU 渲染耗时 (`gpuMs`) |
| Tracy Plot / 实时 HUD | **Profiler HUD (`F9`) + 画质检测面板** | `src/ui/ProfilerHud.jsx`, `src/scenes/three/GraphicsMonitor.jsx` | 实时查看 FPS、P50/P95/P99、DrawCalls、Triangles、Culling、Heap |
| RenderDoc / Nsight | **RenderDoc 直连 ANGLE / Spector.js** | `CYBER_STUDY_RENDERDOC=1` | Windows 下抓 D3D11 单帧 DrawCall、Shader 与 RenderTarget 开销 |

---

## 2. 快速上手：快捷键与启动环境变量

### 2.1 窗口快捷键（开发模式或 `CYBER_STUDY_PROFILE=1` 时启用）

- **`F9`**：开关 **Profiler HUD** 悬浮面板（默认关闭，对正常用户零侵入）。
- **`F10`**：开始 / 停止 **Perfetto Trace** 录制，自动保存 JSON 到 `.user-data/traces/trace-YYYYMMDD-HHmmss.json`（打包版为 `<userData>/traces/`）。
- **`F12`**：开关 Chromium DevTools（可切到 `Performance` / `Memory` / `React Profiler`）。

### 2.2 启动环境变量

| 环境变量 | 示例值 | 说明 |
|---|---|---|
| `CYBER_STUDY_PROFILE` | `1` | 在打包产物中强制开启 `F9`/`F10`/`F12` 与 Trace/报告导出 |
| `CYBER_STUDY_ANGLE` | `d3d11` / `gl` / `vulkan` / `swiftshader` | 切换 Chromium ANGLE 后端，对比不同图形后端或软渲染基线 |
| `CYBER_STUDY_RENDERDOC` | `1` | 追加 `--disable-gpu-sandbox`，允许 RenderDoc 注入抓帧（仅限本地调试） |
| `CYBER_STUDY_IGNORE_GPU_BLOCKLIST` | `1` | 忽略 GPU 黑名单，验证特定显卡驱动表现 |

Windows CMD 示例：
```cmd
set CYBER_STUDY_PROFILE=1
set CYBER_STUDY_ANGLE=d3d11
pnpm dev
```

### 2.3 控制台调试 API (`window.cyberStudyProfiler`)

在 DevTools Console 中可直接调用：

```js
window.cyberStudyProfiler.toggleHud();       // 开关 HUD
window.cyberStudyProfiler.enable();          // 开启后台采样（无需打开 HUD）
window.cyberStudyProfiler.setUserTiming(true); // 写入 performance.mark/measure
window.cyberStudyProfiler.summary(120);      // 查看近 120 帧 P50/P95/P99 与阶段耗时
window.cyberStudyProfiler.snapshot();        // 导出包含最近 60 帧明细的 JSON 快照
```

---

## 3. 内置采样与统计架构

### 3.1 零开销设计

- `frameProfiler` 使用引用计数租约（`retain()`）。未打开 HUD、未进行画质检测且未录制 Trace 时，`frameProfiler.active === false`，每帧仅执行一次布尔判断，**不分配对象、不发起 GPU Timer Query、不写入 User Timing**。
- 当开启 HUD、`LiveGraphicsMonitor`、`GraphicsMonitor` 或 Trace 录制时自动激活。

### 3.2 每帧拆解阶段（Stage Breakdown）

`<FrameProfilerBridge />` 挂载在 `src/scenes/three/Furniture3DLayer.jsx` 的 `<Canvas>` 内部，通过 `useFrame(..., -100)` 与 `gl.render` 代理完成单帧切分：

1. `scene:camera`（`src/scenes/three/PackageCamera.jsx`）：相机平滑插值、漫游移动与边界约束。
2. `scene:cull`（`src/scenes/three/StaticSceneOptimizer.jsx`）：视锥剔除、遮挡体测试（48 个大面片遮挡物）、单面材质切换。
3. `scene:lod`（`src/scenes/three/ModelLod.jsx`）：屏幕像素占比计算与 LOD 几何体切换。
4. `scene:rain`（`src/scenes/three/OutdoorRain.jsx`）：雨滴粒子顶点缓冲更新与 `needsUpdate` 上传。
5. `three:render`（`GraphicsMonitor.jsx` 中的 `gl.render` 包装）：Three.js 场景遍历、阴影 Pass、WebGL DrawCall 提交 CPU 耗时。
6. `GPU 耗时`（`EXT_disjoint_timer_query_webgl2`）：异步轮询上一帧已完成的 GPU Query（避免 `gl.finish` 阻塞管线），自动处理 `GPU_DISJOINT_EXT` 丢弃异常采样。

### 3.3 `demand` 模式与「持续渲染」压测

`Furniture3DLayer.jsx` 在无雨景、无检测时使用 R3F `frameloop="demand"`（静止时不渲染，省电且低占用）。
- **HUD 默认被动采样**：拖动视角、切换分区或悬停交互时记录实际触发的渲染帧耗时。
- **勾选 HUD 右上角「持续渲染」**：临时将 `frameloop` 切为 `'always'`，用于稳定复现满载帧率、P95/P99 抖动与 GPU 瓶颈。

---

## 4. 卡顿归因决策树

观察 HUD 或「画质与流畅度 → 详细检测」结果按以下顺序定位：

1. **FPS 高但体感一卡一卡（`P95` / `P99` 尖刺 > 25ms）**
   - 录一段 `F10` Trace → 打开 `https://ui.perfetto.dev` 检查：
     - **V8 GC (`V8.GC_SCAVENGE` / `V8.GC_MC`)**：高频创建 `Vector3`/`Box3`/`new Set()` 导致 GC 停顿。
     - **Shader 编译 (`ShaderCompile` / `ProgramLink`)**：首次切换主题或模型入视野时阻塞主线程/GPU 线程。
     - **IPC / 文件 IO**：主进程同步读写或大 JSON 解析阻塞事件循环。
2. **`CPU 帧耗时` 低（< 4ms），但 `GPU 耗时` 高（> 14ms）或 FPS 低**
   - 属于 **GPU Bound（像素/填充率/阴影瓶颈）**。
   - 检查 `DrawCalls`、`Triangles` 与画质设置：优先调低 `dpr`（`2 -> 1.5 -> 1`）、`shadowSize`（`2048 -> 1024 -> 0`）、关闭 `antialias` 或降低 `rain`。
3. **`three:render` CPU 提交耗时高（> 8ms）且 `DrawCalls` 高**
   - 属于 **DrawCall / 状态切换瓶颈**。
   - 检查 HUD 中 `Cull` 计数（`遮挡 / 视锥外 / 单面`），排查模型是否合并、静态物体是否缺少 `performanceModel` 标记或材质过多。
4. **`scene:cull` / `scene:lod` / `scene:rain` 单项耗时 > 2ms**
   - 属于 **JS 业务循环瓶颈**，直接针对对应模块做矩阵缓存或减少遍历频率。
5. **HUD 指标正常但主线程卡顿 / UI 掉帧**
   - 用 DevTools `Performance` + `React DevTools Profiler` 检查 CSS `backdrop-filter` 合成开销或 React 顶层状态触发的整树重渲染。

---

## 5. Perfetto 抓帧实战流程

1. 启动应用（`pnpm dev`），按 **`F9`** 打开 HUD（可选，建议同时勾选「持续渲染」以观察连续帧）。
2. 在需要复现卡顿的场景操作前按 **`F10`** 开始录制（左上角出现 `● 正在录制 Trace` 提示，同时自动开启 `UserTiming` 埋点）。
3. 复现卡顿动作（如切日夜主题、拖动视角、开关书架/阅读器）约 3~8 秒。
4. 再次按 **`F10`** 停止录制（或点击 HUD 中的「录制 5s」自动停止）。
5. 点击 HUD 的 **「打开目录」** 找到 `trace-*.json`。
6. 浏览器打开 **[https://ui.perfetto.dev](https://ui.perfetto.dev)**，把 JSON 拖入页面：
   - 展开 **`CrRendererMain`**：查看 `zone:scene:camera`、`zone:scene:cull`、`zone:scene:lod`、`zone:three:render`、`cyber-study:frame` 以及 React / V8 函数调用栈。
   - 展开 **`CrGpuMain`**：查看命令缓冲区消费、ANGLE/D3D 提交与 Shader 编译尖刺。
   - 展开 **`Compositor` / `VizCompositorThread`**：确认是否发生掉帧（Frame Missed）或合成阻塞。

---

## 6. Windows RenderDoc / Spector.js 深度 GPU 抓帧

当需要逐个检查 WebGL DrawCall、Shader 指令与纹理分辨率时：

1. 安装 [RenderDoc](https://renderdoc.org/)。
2. 先执行一次构建或准备开发启动，设置环境变量关闭 GPU 沙箱：
   ```cmd
   set CYBER_STUDY_RENDERDOC=1
   ```
3. 在 RenderDoc 的 **Launch Application** 中配置：
   - **Executable Path**：`node_modules\electron\dist\electron.exe`
   - **Working Directory**：项目根目录
   - **Command-line Arguments**：`.`（生产模式）或配合 `VITE_DEV_SERVER_URL=http://127.0.0.1:5173`
   - 勾选 **Capture Child Processes**（关键：Electron 渲染与 GPU 在子进程中）。
4. 启动后按 `F12`（RenderDoc 默认抓帧键）截取单帧，在 **Event Browser** 中查看每个 DrawCall 对应的耗时、Mesh 与 FBO。

> 注意：若同时使用 Electron 的 `F12`（DevTools）与 RenderDoc 默认抓帧键冲突，可在 RenderDoc Settings 中修改抓帧热键（如改为 `PrintScreen`）。

---

## 7. 在新模块中添加自定义打点

在任何渲染循环或重逻辑处引入 `frameProfiler`：

```js
import { frameProfiler } from '../scenes/three/frameProfiler.js';

// 方式一：作用域自动计时（异常安全）
frameProfiler.measureZone('feature:globe-update', () => {
  // 重计算逻辑
});

// 方式二：手动成对打点
frameProfiler.beginZone('reader:parse-pdf');
// ...
frameProfiler.endZone('reader:parse-pdf');
```

命名约定：`<模块>:<子阶段>`（如 `scene:cull`、`three:render`、`globe:markers`），会自动出现在 `F9` HUD 柱状列表、JSON 报告与 Perfetto `zone:<名称>` 轨道中。
