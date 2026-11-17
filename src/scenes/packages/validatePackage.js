import { validatePresentation } from './presentation.js';
import { defaultCameraLimits } from './cameraConfig.js';

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
export function validatePackage(data) {
  if (data?.version !== 1 || typeof data.name !== 'string' || !Array.isArray(data.models) || !data.models.length) throw Error('场景包需要 version: 1、name 和 models。');
  if (!vector(data.camera?.position) || !Number.isFinite(data.camera.fov) || data.camera.fov < 30 || data.camera.fov > 100) throw Error('场景相机配置无效。');
  for (const key of ['yaw', 'pitch']) if (data.camera[key] !== undefined && !Number.isFinite(data.camera[key])) throw Error('相机角度无效。');
  const { limits } = data.camera;
  if (limits !== undefined) {
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) throw Error('camera.limits 必须是对象。');
    for (const field of Object.keys(defaultCameraLimits)) {
      const range = limits[field];
      if (range === undefined) continue;
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > range[1]) {
        throw Error(`camera.limits.${field} 必须填写有序的 [最小值, 最大值]。`);
      }
      const [min, max] = range;
      if (field === 'fov' && (min < 30 || max > 100)) throw Error('camera.limits.fov 必须在 30–100° 内。');
    }
  }
  if (data.outdoorRain !== undefined) {
    const { min, max } = data.outdoorRain ?? {};
    if (!vector(min) || !vector(max) || max.some((value, axis) => value <= min[axis])) {
      throw Error('outdoorRain 必须填写有效的三维 min 和 max，且每个轴的 max 必须大于 min。');
    }
  }
  const ids = new Set();
  for (const m of data.models) {
    if (typeof m.id !== 'string' || !m.id.trim() || ids.has(m.id)) throw Error('模型 id 必须唯一。');
    ids.add(m.id);
    if (m.feature !== undefined && m.feature !== null && typeof m.feature !== 'string') throw Error('feature 必须为功能 ID 字符串或 null。');
    if (typeof m.file !== 'string' || !/\.glb$/i.test(m.file) || m.file.split('/').some(p => p === '..') || m.file.startsWith('/') || m.file.includes(':')) throw Error('模型必须使用包内 GLB 相对路径。');
    if (m.previewFile !== undefined && (typeof m.previewFile !== 'string' || !/\.glb$/i.test(m.previewFile) || /[:\\?#]/.test(m.previewFile) || m.previewFile.split('/').some(p => !p || p === '.' || p === '..'))) throw Error('展示模型必须使用包内 GLB 相对路径。');
    if (m.qualityFiles !== undefined) {
      const files = m.qualityFiles;
      if (!files || typeof files !== 'object' || Array.isArray(files) || Object.entries(files).some(([quality, file]) =>
        !['low', 'medium'].includes(quality) || typeof file !== 'string' || !/\.glb$/i.test(file) || /[:\\?#]/.test(file) ||
        file.split('/').some(part => !part || part === '.' || part === '..'))) throw Error(`模型 ${m.id} 的 qualityFiles 必须为包内低/中画质 GLB 路径。`);
    }
    if (m.lod !== undefined) {
      const lod = m.lod;
      if (!lod || !Number.isInteger(lod.vertexCount) || lod.vertexCount < 1 ||
          !Number.isInteger(lod.sourceTriangles) || lod.sourceTriangles < 1 ||
          !Array.isArray(lod.levels) || lod.levels.length < 1 || lod.levels.length > 3) throw Error(`模型 ${m.id} 的 LOD 配置无效。`);
      let previous = lod.sourceTriangles;
      for (const level of lod.levels) {
        if (!level || typeof level.file !== 'string' || !/\.bin$/i.test(level.file) || /[:\\?#]/.test(level.file) ||
            level.file.split('/').some(part => !part || part === '.' || part === '..') ||
            !Number.isInteger(level.triangles) || level.triangles < 1 || level.triangles >= previous ||
            !Number.isFinite(level.error) || level.error < 0 || level.error > 1) throw Error(`模型 ${m.id} 的 LOD 级别无效。`);
        previous = level.triangles;
      }
    }
    if (!vector(m.position) || !(Number.isFinite(m.width) && m.width > 0) || (m.rotation && !vector(m.rotation))) throw Error(`模型 ${m.id} 的位置、宽度或旋转无效。`);
    if (m.surfaceCeiling !== undefined && !Number.isFinite(m.surfaceCeiling)) throw Error('承托高度无效。');
  }
  for (const m of data.models) if (m.support && (!ids.has(m.support) || m.support === m.id)) throw Error('承托模型不存在或引用自身。');
  validatePresentation(data, ids);
  return data;
}
