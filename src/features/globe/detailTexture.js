import { CanvasTexture, SRGBColorSpace, Vector4 } from 'three';
import { polygons } from './geographyMath.js';
import { atlasPalette } from './palette.js';
export function detailTexture(region, world) {
  if(!region || !world.length || region.bbox[2]-region.bbox[0]>170)return null;
  const [w,s,e,n]=region.bbox, margin=Math.max(e-w,n-s)*.65;
  const bounds=[Math.max(-180,w-margin),Math.max(-90,s-margin),Math.min(180,e+margin),Math.min(90,n+margin)];
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const ctx=canvas.getContext('2d');
  ctx.fillStyle=atlasPalette.ocean;ctx.fillRect(0,0,2048,2048);
  const draw=(geometry,fill)=>{ctx.beginPath();for(const polygon of polygons(geometry))for(const ring of polygon){ring.forEach(([lon,lat],i)=>{const x=(lon-bounds[0])/(bounds[2]-bounds[0])*2048,y=(bounds[3]-lat)/(bounds[3]-bounds[1])*2048;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});ctx.closePath()}ctx.fillStyle=fill;ctx.fill('evenodd');};
  for(const f of world) draw(f.geometry,atlasPalette.land);
  if(region.geometry)draw(region.geometry,'#719b94');
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;
  return {texture,bounds:new Vector4(...bounds)};
}
export function applyDetail(shader, detail) {
  if(!detail)return;
  shader.uniforms.regionTexture={value:detail.texture};shader.uniforms.regionBounds={value:detail.bounds};
  shader.vertexShader='varying vec3 atlasPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\natlasPosition=position;');
  shader.fragmentShader='varying vec3 atlasPosition;\nuniform sampler2D regionTexture;\nuniform vec4 regionBounds;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    vec3 dir=normalize(atlasPosition);
    vec2 lnglat=vec2(atan(-dir.z,dir.x),asin(clamp(dir.y,-1.0,1.0)))*57.295779513;
    vec2 detailUV=(lnglat-regionBounds.xy)/(regionBounds.zw-regionBounds.xy);
    if(all(greaterThanEqual(detailUV,vec2(0.0)))&&all(lessThanEqual(detailUV,vec2(1.0)))) diffuseColor.rgb=texture2D(regionTexture,detailUV).rgb;
  `);
}
