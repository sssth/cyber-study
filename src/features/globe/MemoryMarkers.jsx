import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { InstancedBufferAttribute, InstancedMesh, Object3D, Vector3 } from 'three';
import { globePosition } from './geo.js';

// Front-facing visibility is handled per instance, so the globe cannot clip a disc in half.
// Camera-facing discs: 24 CSS-pixel hit targets with smaller visible dots.
export default function MemoryMarkers({ places, highlighted, hovered, reduced, onClick, onPointerMove, onPointerOut }) {
  const mesh = useRef();
  const { camera, size, invalidate } = useThree();
  const state = useMemo(() => new InstancedBufferAttribute(new Float32Array(places.length * 2), 2), [places.length]);
  const scratch = useMemo(() => ({ dummy:new Object3D(), forward:new Vector3(), offset:new Vector3() }), []);
  useEffect(() => { invalidate(); }, [places, highlighted, hovered, size, invalidate]);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const { dummy, forward, offset } = scratch;
    camera.getWorldDirection(forward);
    let moving = false;
    places.forEach((place, i) => {
      dummy.position.fromArray(globePosition(place.latitude, place.longitude, 1.0015));
      const front = dummy.position.dot(camera.position) > 1.0015;
      const depth = offset.copy(dummy.position).sub(camera.position).dot(forward);
      const width = 24 * 2 * Math.max(.001,depth) * Math.tan(camera.fov * Math.PI / 360) / Math.max(1,size.height);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(front ? width : 0);
      dummy.updateMatrix(); mesh.current.setMatrixAt(i, dummy.matrix);
      const marked = place.photos.some(p => highlighted?.has(p.id));
      const targets = [marked ? 1 : 0, marked && place.id === hovered ? 1 : 0];
      targets.forEach((target, channel) => {
        const index=i*2+channel, old=state.array[index];
        state.array[index]=channel === 0 || !marked || reduced || Math.abs(target-old)<.01 ? target : old+(target-old)*(1-Math.exp(-Math.min(delta,.05)*22));
        if(Math.abs(target-state.array[index])>.001) moving=true;
      });
    });
    mesh.current.instanceMatrix.needsUpdate=true; mesh.current.computeBoundingSphere(); state.needsUpdate=true;
    if(moving) invalidate();
  });
  return <instancedMesh ref={mesh} args={[null,null,places.length]} key={places.length} frustumCulled={false} renderOrder={10} raycast={function(raycaster, intersections) {
    const hits = [];
    InstancedMesh.prototype.raycast.call(this, raycaster, hits);
    intersections.push(...hits.filter(hit => places[hit.instanceId]?.photos.some(p => highlighted?.has(p.id))));
  }} onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
    <planeGeometry args={[1,1]}><primitive object={state} attach="attributes-markerState" /></planeGeometry>
    <shaderMaterial transparent depthTest={false} depthWrite={false} toneMapped={false} vertexShader={`
      attribute vec2 markerState;
      varying vec2 pointUv; varying vec2 pointState;
      void main(){ pointUv=uv; pointState=markerState; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }
    `} fragmentShader={`
      varying vec2 pointUv; varying vec2 pointState;
      void main(){
        float marked=pointState.x, hover=pointState.y;
        float r=length((pointUv-.5)*24.0);
        float radius=2.8+marked*1.2+hover*.4;
        float disc=1.0-smoothstep(radius-.45,radius+.45,r);
        float edge=1.0-smoothstep(radius+.65,radius+1.35,r);
        float ringRadius=6.7+hover*1.2;
        float ring=(1.0-smoothstep(.45,1.05,abs(r-ringRadius)))*hover;
        vec3 ink=mix(vec3(.32,.38,.39),vec3(.35,.84,.73),marked);
        ink=mix(ink,vec3(.96,.97,.92),hover*.2);
        float alpha=max(edge,ring);
        if(alpha<.01) discard;
        vec3 color=mix(vec3(.035,.075,.09),ink,disc);
        color=mix(color,ink,ring);
        gl_FragColor=vec4(color,alpha);
      }
    `}/>
  </instancedMesh>;
}
