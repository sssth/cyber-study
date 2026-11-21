import { translate } from '../i18n/index.js';
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
    <FeaturePanel scopeId="pet" title="i18n.pet" kicker="Quiet Companion" description={translate("i18n.doubleClickTheCatInTheStudy")} onClose={onClose}>
      <CareModelPreview feature="pet" model={model} theme={theme} label={translate("i18n.pet")} />
      <div className="stat-row">
        <span>{translate("i18n.mood")}{' '}{Math.round(pet.mood)}</span>
        <span>{translate("i18n.bond2")}{' '}{Math.round(pet.bond)}</span>
        <span>{translate("i18n.timesPetted", pet.pets)}</span>
      </div>
    </FeaturePanel>
  );
}

function PlantPanel({ onClose, model, theme }) {
  const plant = loadPlant(useCareClock());
  return (
    <FeaturePanel scopeId="plant" title="i18n.plant" kicker="Growth Plant" description={translate("i18n.doubleClickThePlantInTheStudy")} onClose={onClose}>
      <CareModelPreview feature="plant" model={model} theme={theme} label={translate("i18n.plant")} />
      <div className="stat-row">
        <span>{translate("i18n.moisture")}{' '}{Math.round(plant.water)}/100</span>
        <span>{translate("i18n.focusInTheLast24Hours")}{' '}{Math.floor(plant.recentFocusMinutes + 1e-9)}{' '}{translate("i18n.min")}</span>
        <span>{translate("i18n.growth")}{' '}{plant.growth.toFixed(1)}</span>
      </div>
    </FeaturePanel>
  );
}

export { PetPanel, PlantPanel };
