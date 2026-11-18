import GlobePanel from './GlobePanel.jsx';
import TypewriterPanel from './TypewriterPanel.jsx';
import { useEffect, useState } from 'react';
import { FeaturePanel } from './ui.jsx';
import { loadPlant } from '../data/plantStore.js';
import { loadPet } from '../data/petStore.js';
import CareModelPreview from '../scenes/three/CareModelPreview.jsx';

function useCareClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function PetPanel({ onClose, model, theme }) {
  const pet = loadPet(useCareClock());
  return (
    <FeaturePanel title="书房猫" kicker="Quiet Companion" description="在书房里双击猫咪，就能抚摸一次。" onClose={onClose}>
      <CareModelPreview feature="pet" model={model} theme={theme} label="猫咪" />
      <div className="stat-row">
        <span>心情 {Math.round(pet.mood)}</span>
        <span>亲密 {Math.round(pet.bond)}</span>
        <span>抚摸 {pet.pets} 次</span>
      </div>
    </FeaturePanel>
  );
}

function PlantPanel({ onClose, model, theme }) {
  const plant = loadPlant(useCareClock());
  return (
    <FeaturePanel title="书房植物" kicker="Growth Plant" description="在书房里双击植物，就能浇水一次。" onClose={onClose}>
      <CareModelPreview feature="plant" model={model} theme={theme} label="植物" />
      <div className="stat-row">
        <span>水分 {Math.round(plant.water)}/100</span>
        <span>近 24 小时专注 {Math.floor(plant.recentFocusMinutes + 1e-9)} 分钟</span>
        <span>成长值 {plant.growth.toFixed(1)}</span>
      </div>
    </FeaturePanel>
  );
}

export { GlobePanel, TypewriterPanel, PetPanel, PlantPanel };
