// 桌面宠物 3D 层的公共显示设置。
export const pet3dConfig = {
  enabled: true,
  targetHeight: 1,
  // 相对选框中心的微调；只控制摆放位置，不修改模型材质。
  displayOffset: [0, 0, 0],
  // SVG 原始宠物选区。
  svgViewBox: { width: 1600, height: 900 },
  hotspotRect: { x: 58, y: 578, width: 245, height: 170 },
  displayPadding: { width: 1, height: 1 }
};

// public/models 中可切换的宠物。后续新增文件时在这里登记即可。
export const petModels = [
  {
    id: 'cat',
    label: '猫',
    description: '桌面的猫咪伙伴',
    modelUrl: './models/cat.glb',
    // 单位是角度，[前后翻转, 左右朝向, 侧面倾斜]
    orientationDegrees: [0, 0, 0]
  },
  {
    id: 'bird',
    label: '鸟',
    description: '桌面的鸟儿伙伴',
    modelUrl: './models/bird.glb',
    // 单位是角度，[前后翻转, 左右朝向, 侧面倾斜]
    orientationDegrees: [0, 90, 0]
  }
];

export function getPetModelById(modelId) {
  return petModels.find((model) => model.id === modelId) ?? petModels[0];
}

export const defaultPetState = {
  activePetId: 'cat',
  mood: 45,
  bond: 10,
  focusMinutes: 0,
  level: 1,
  state: 'idle'
};
