import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DynamicDrawUsage, NormalBlending } from 'three';
import { frameProfiler } from './frameProfiler.js';

export default function OutdoorRain({ bounds, density = 1 }) {
  const attribute = useRef(null);
  const { count: baseCount = 480, color = '#a0c5de', opacity = 0.32 } = bounds;
  const count = Math.max(1, Math.round(baseCount * density));
  const { drops, positions } = useMemo(() => {
    const drops = Array.from({ length: count }, (_, index) => {
      const regions = bounds.regions ?? [bounds];
      const {min, max} = regions[index % regions.length];
      const [short, long] = bounds.length ?? [0.09, 0.22];
      return {
        x: min[0] + Math.random() * (max[0] - min[0]),
        z: min[2] + Math.random() * (max[2] - min[2]),
        bottom: min[1], top: max[1], height: max[1] - min[1],
        offset: Math.random() * (max[1] - min[1]),
        length: short + Math.random() * (long - short),
        speed: bounds.speed ?? 5 + Math.random() * 3
      };
    });
    const positions = new Float32Array(count * 6);
    drops.forEach((drop, index) => {
      const start = index * 6;
      positions[start] = drop.x;
      positions[start + 2] = positions[start + 5] = drop.z;
      positions[start + 3] = drop.x + drop.length * 0.12;
    });
    return { drops, positions };
  }, [bounds, count]);

  // Advance on every rendered frame, independently of camera input.
  useFrame((_, delta) => {
    frameProfiler.measureZone('scene:rain', () => {
      const step = Math.min(delta, 0.05);
      drops.forEach((drop, index) => {
        const { height } = drop;
        drop.offset = (drop.offset + height - (drop.speed * step) % height) % height;
        const y = drop.bottom + drop.offset;
        const start = index * 6;
        positions[start + 1] = y;
        positions[start + 4] = Math.min(y + drop.length, drop.top);
      });
      attribute.current.needsUpdate = true;
    });
  });

  return (
    <lineSegments frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute ref={attribute} attach="attributes-position" args={[positions, 3]} usage={DynamicDrawUsage} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} blending={bounds.regions ? AdditiveBlending : NormalBlending} depthWrite={false} />
    </lineSegments>
  );
}
