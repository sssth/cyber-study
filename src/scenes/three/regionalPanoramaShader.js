// Each face keeps native regional pixels. The front photograph is sampled directly.
export const regionalPanoramaVertex = `
  varying vec2 screenPosition;
  void main() {
    screenPosition = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;
export const regionalPanoramaFragment = `
  uniform sampler2D faceFront, faceRight, faceBack, faceLeft, faceUp, faceDown;
  uniform sampler2D frontImage;
  uniform sampler2D skyRepair;
  uniform float hasSkyRepair;
  uniform float faceTanHalfFov, faceAspect, frontTanHalfFov, frontAspect, frontBlend;
  uniform mat4 inverseProjection, cameraRotation;
  varying vec2 screenPosition;

  vec4 region(sampler2D image, vec3 localRay, float dominant) {
    vec2 uv = vec2(localRay.x, localRay.y * faceAspect) /
      (max(localRay.z, 0.00001) * 2.0 * faceTanHalfFov) + 0.5;
    vec2 edge = min(uv, 1.0 - uv);
    float available = smoothstep(0.0, 0.015, min(edge.x, edge.y));
    float weight = smoothstep(0.0, 0.04, localRay.z - dominant + 0.04) * available;
    return vec4(texture2D(image, clamp(uv, 0.0, 1.0)).rgb * weight, weight);
  }
  vec3 environmentColor(vec3 ray) {
    float dominant = max(max(abs(ray.x), abs(ray.y)), abs(ray.z));
    vec4 sum = region(faceFront, vec3(ray.x, ray.y, -ray.z), dominant);
    sum += region(faceRight, vec3(ray.z, ray.y, ray.x), dominant);
    sum += region(faceBack, vec3(-ray.x, ray.y, ray.z), dominant);
    sum += region(faceLeft, vec3(-ray.z, ray.y, -ray.x), dominant);
    sum += region(faceUp, vec3(ray.x, ray.z, ray.y), dominant);
    sum += region(faceDown, vec3(ray.x, -ray.z, -ray.y), dominant);
    return sum.rgb / max(sum.a, 0.00001);
  }
  float roofEdge(vec2 p, vec2 a, vec2 b) {
    vec2 e = b - a;
    return (e.y * (p.x - a.x) - e.x * (p.y - a.y)) / length(e);
  }
  float skyRepairMask(vec2 p) {
    // Pixel coordinates in the 1774 x 887 upward reference view. Keep the
    // repair within sky, with conservative exclusions around foliage and roofs.
    float leftEdge = p.y < 400.0 ? 75.0 + p.y * 0.78 :
      (p.y < 570.0 ? 387.0 : mix(387.0, 355.0, clamp((p.y - 570.0) / 175.0, 0.0, 1.0)));
    float mask = smoothstep(0.0, 65.0, p.x - leftEdge) *
      (1.0 - smoothstep(1700.0, 1774.0, p.x)) *
      smoothstep(170.0, 300.0, p.y) * (1.0 - smoothstep(650.0, 745.0, p.y));
    float towerDistance = roofEdge(p, vec2(1217.0, 553.0), vec2(1254.0, 562.0));
    towerDistance = max(towerDistance, roofEdge(p, vec2(1254.0, 562.0), vec2(1350.0, 887.0)));
    towerDistance = max(towerDistance, roofEdge(p, vec2(1350.0, 887.0), vec2(1245.0, 887.0)));
    towerDistance = max(towerDistance, roofEdge(p, vec2(1245.0, 887.0), vec2(1200.0, 615.0)));
    towerDistance = max(towerDistance, roofEdge(p, vec2(1200.0, 615.0), vec2(1217.0, 553.0)));
    mask *= smoothstep(0.0, 45.0, towerDistance);
    float rightRoofDistance = max(1540.0 + max(p.y - 675.0, 0.0) * 0.6 - p.x, 675.0 - p.y);
    mask *= smoothstep(0.0, 18.0, rightRoofDistance);
    float smallRoofDistance = max(max(1120.0 - p.x, p.x - 1210.0), 715.0 - p.y);
    return mask * smoothstep(0.0, 12.0, smallRoofDistance);
  }
  void main() {
    vec4 viewRay = inverseProjection * vec4(screenPosition, 1.0, 1.0);
    vec3 ray = normalize(mat3(cameraRotation) * viewRay.xyz);
    vec3 color = environmentColor(ray);
    vec2 photoUV = vec2(ray.x, ray.y * frontAspect) /
      (max(-ray.z, 0.00001) * 2.0 * frontTanHalfFov) + 0.5;
    vec2 edge = min(photoUV, 1.0 - photoUV);
    // A narrow reflected sky strip makes the photo boundary continuous without
    // stretching edge pixels. It fades into generated sky outside the source.
    if (ray.z < 0.0 && photoUV.y > 1.0 - frontBlend && photoUV.x > 0.16 && photoUV.x < 1.0) {
      float skyV = 1.0 - abs(photoUV.y - 1.0);
      vec3 borderSky = texture2D(frontImage, vec2(photoUV.x, skyV)).rgb;
      // The tallest original tower nearly reaches the top border. Only use
      // adjacent sky there so its roof cannot be reflected into the extension.
      float towerMask = smoothstep(0.69, 0.705, photoUV.x) *
        (1.0 - smoothstep(0.765, 0.78, photoUV.x)) * (1.0 - smoothstep(0.98, 0.995, skyV));
      vec3 adjacentSky = mix(texture2D(frontImage, vec2(0.685, skyV)).rgb,
        texture2D(frontImage, vec2(0.79, skyV)).rgb, clamp((photoUV.x - 0.685) / 0.105, 0.0, 1.0));
      borderSky = mix(borderSky, adjacentSky, towerMask);
      float correction = (1.0 - smoothstep(0.0, 0.18, photoUV.y - 1.0)) *
        smoothstep(0.16, 0.22, photoUV.x) * (1.0 - smoothstep(0.97, 1.0, photoUV.x));
      color = mix(color, borderSky, correction);
    }
    float photoWeight = step(0.0, -ray.z) * smoothstep(0.0, frontBlend, min(edge.x, edge.y));
    color = mix(color, texture2D(frontImage, clamp(photoUV, 0.0, 1.0)).rgb, photoWeight);
    if (hasSkyRepair > 0.5) {
      // The edit is a perspective photograph facing forward, pitched up 45°,
      // with 64° vertical FOV. One shared patch crosses the old sky junction.
      float depth = (ray.y - ray.z) * 0.70710678118;
      float localY = (ray.y + ray.z) * 0.70710678118;
      vec2 repairUV = vec2(ray.x / 2.0, localY) /
        (2.0 * max(depth, 0.00001) * 0.6248693519) + 0.5;
      float repairWeight = step(0.0, depth) * skyRepairMask(vec2(repairUV.x, 1.0 - repairUV.y) * vec2(1774.0, 887.0));
      color = mix(color, texture2D(skyRepair, clamp(repairUV, 0.0, 1.0)).rgb, repairWeight);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
