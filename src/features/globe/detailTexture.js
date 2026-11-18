import { CanvasTexture, Color, LinearFilter, SRGBColorSpace, Vector4 } from 'three';
import { polygons } from './geographyMath.js';
import { atlasPalette } from './palette.js';
function paintRegion(ctx, geometry, [west, south, east, north], color) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = color;
  for (const polygon of polygons(geometry)) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon, lat], index) => {
        const x = (lon - west) / (east - west) * width;
        const y = (north - lat) / (north - south) * height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
}

// Repaint only when the hovered feature changes. Local bounds keep small provinces sharp.
export function createHoverMask() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const texture = new CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  return { texture, bounds: new Vector4(200, 100, 201, 101) };
}

export function updateHoverMask(mask, feature) {
  if (!feature) {
    mask.bounds.set(200, 100, 201, 101);
    return;
  }
  const [w, s, e, n] = feature.bbox;
  const canvas = mask.texture.image;
  // Leave two transparent texels on every side for clamp-to-edge sampling.
  const padX = Math.max(e - w, .001) * 2 / (canvas.width - 4);
  const padY = Math.max(n - s, .001) * 2 / (canvas.height - 4);
  const bounds = [w - padX, s - padY, e + padX, n + padY];
  mask.bounds.set(...bounds);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintRegion(ctx, feature.geometry, bounds, '#fff');
  mask.texture.needsUpdate = true;
}

export function detailTexture(region, world) {
  if(!region || !world.length || region.bbox[2]-region.bbox[0]>170)return null;
  const [w,s,e,n]=region.bbox, margin=Math.max(e-w,n-s)*.65;
  const bounds=[Math.max(-180,w-margin),Math.max(-90,s-margin),Math.min(180,e+margin),Math.min(90,n+margin)];
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const ctx=canvas.getContext('2d');
  ctx.fillStyle=atlasPalette.ocean;ctx.fillRect(0,0,2048,2048);
  for (const feature of world) paintRegion(ctx, feature.geometry, bounds, atlasPalette.land);
  if (region.geometry) paintRegion(ctx, region.geometry, bounds, atlasPalette.region);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;
  return {texture,bounds:new Vector4(...bounds)};
}
export function applyDetail(shader, detail, mask) {
  shader.uniforms.hoverMask = {value: mask.texture};
  shader.uniforms.hoverBounds = {value: mask.bounds};
  shader.uniforms.hoverColor = {value: new Color(atlasPalette.hover)};
  if (detail) {
    shader.uniforms.regionTexture={value:detail.texture};shader.uniforms.regionBounds={value:detail.bounds};
  }
  shader.vertexShader='varying vec3 atlasPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\natlasPosition=position;');
  shader.fragmentShader='varying vec3 atlasPosition;\nuniform sampler2D hoverMask;\nuniform vec4 hoverBounds;\nuniform vec3 hoverColor;\nuniform sampler2D regionTexture;\nuniform vec4 regionBounds;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    vec3 dir=normalize(atlasPosition);
    vec2 lnglat=vec2(atan(-dir.z,dir.x),asin(clamp(dir.y,-1.0,1.0)))*57.295779513;
    ${detail ? `vec2 detailUV=(lnglat-regionBounds.xy)/(regionBounds.zw-regionBounds.xy);
    if(all(greaterThanEqual(detailUV,vec2(0.0)))&&all(lessThanEqual(detailUV,vec2(1.0)))) diffuseColor.rgb=texture2D(regionTexture,detailUV).rgb;` : ''}
    vec2 hoverUV = (lnglat - hoverBounds.xy) / (hoverBounds.zw - hoverBounds.xy);
    if (all(greaterThanEqual(hoverUV, vec2(0.0))) && all(lessThanEqual(hoverUV, vec2(1.0)))) {
      diffuseColor.rgb = mix(diffuseColor.rgb, hoverColor, texture2D(hoverMask, hoverUV).a * 0.78);
    }
  `);
}
