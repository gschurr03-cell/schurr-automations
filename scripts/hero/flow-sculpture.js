/**
 * A single, closed chrome ribbon. No renderer, lights, assets, or animation loop.
 *
 * const sculpture = createFlowSculpture(THREE);
 * scene.add(sculpture.object);
 * sculpture.update(scrollProgress); // normalized 0..1; entirely deterministic
 * sculpture.dispose();
 *
 * The path and section are periodic and share their seam vertices. Keeping the
 * sculpture rigid makes its broad reflection bands behave like polished metal.
 */
export function createFlowSculpture(THREE) {
  const longitudinalSegments = 256;
  const faceSegments = 12;
  const edgeSegments = 8;
  const halfWidth = 0.43;
  const halfThickness = 0.052;
  const crown = 0.013;
  const flatHalfWidth = halfWidth - halfThickness;
  const profile = [];

  // Clockwise section: two subtly crowned broad faces, two rounded edges.
  // Crown slopes vanish at the edge transitions, avoiding a bevel highlight.
  for (let j = 0; j < faceSegments; j++) {
    const t = -1 + (2 * j) / faceSegments;
    profile.push([flatHalfWidth * t, halfThickness + crown * (1 - t * t) ** 2]);
  }
  for (let j = 0; j < edgeSegments; j++) {
    const a = Math.PI / 2 - (Math.PI * j) / edgeSegments;
    profile.push([
      flatHalfWidth + halfThickness * Math.cos(a),
      halfThickness * Math.sin(a),
    ]);
  }
  for (let j = 0; j < faceSegments; j++) {
    const t = 1 - (2 * j) / faceSegments;
    profile.push([flatHalfWidth * t, -halfThickness - crown * (1 - t * t) ** 2]);
  }
  for (let j = 0; j < edgeSegments; j++) {
    const a = -Math.PI / 2 - (Math.PI * j) / edgeSegments;
    profile.push([
      -flatHalfWidth + halfThickness * Math.cos(a),
      halfThickness * Math.sin(a),
    ]);
  }

  const radialSegments = profile.length;
  const positions = new Float32Array(longitudinalSegments * radialSegments * 3);
  const indices = new Uint16Array(longitudinalSegments * radialSegments * 6);
  const tangent = new THREE.Vector3();
  const widthAxis = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const widthRolled = new THREE.Vector3();
  const normalRolled = new THREE.Vector3();
  const worldZ = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < longitudinalSegments; i++) {
    const t = (i / longitudinalSegments) * Math.PI * 2;
    const sin = Math.sin(t);
    const cos = Math.cos(t);
    const sin2 = Math.sin(2 * t);
    const cos2 = Math.cos(2 * t);

    // The right lobe rises and opens slightly more than the left. At the
    // projected crossing, opposite portions of the ribbon are 1.48 units apart.
    const x = 2.58 * sin;
    const y = 1.02 * sin2 * (1 + 0.17 * sin) + 0.30 * sin;
    const z = 0.74 * cos + 0.09 * sin2;

    tangent.set(
      2.58 * cos,
      2.04 * cos2 * (1 + 0.17 * sin) + 0.1734 * sin2 * cos + 0.30 * cos,
      -0.74 * sin + 0.18 * cos2,
    ).normalize();

    // This closed analytic frame is smooth everywhere on this path. Its XY
    // derivative never vanishes, so the projected normal has no pole or flip.
    widthAxis.crossVectors(worldZ, tangent).normalize();
    faceNormal.crossVectors(tangent, widthAxis).normalize();
    const roll = 0.75 * sin + 0.52 * sin2 - 0.34 * cos;
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    widthRolled.copy(widthAxis).multiplyScalar(cr).addScaledVector(faceNormal, sr);
    normalRolled.copy(faceNormal).multiplyScalar(cr).addScaledVector(widthAxis, -sr);
    const widthScale = 0.98 + 0.075 * sin - 0.025 * cos2;

    for (let j = 0; j < radialSegments; j++) {
      const [u, v] = profile[j];
      const offset = (i * radialSegments + j) * 3;
      positions[offset] = x + widthRolled.x * u * widthScale + normalRolled.x * v;
      positions[offset + 1] = y + widthRolled.y * u * widthScale + normalRolled.y * v;
      positions[offset + 2] = z + widthRolled.z * u * widthScale + normalRolled.z * v;

      const nextI = (i + 1) % longitudinalSegments;
      const nextJ = (j + 1) % radialSegments;
      const a = i * radialSegments + j;
      const b = nextI * radialSegments + j;
      const c = nextI * radialSegments + nextJ;
      const d = i * radialSegments + nextJ;
      const index = (i * radialSegments + j) * 6;
      indices.set([a, b, d, b, c, d], index);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = "Afterhours / continuous rounded ribbon";
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshPhysicalMaterial({
    name: "Afterhours / polished silver",
    color: 0xc9cdd2,
    metalness: 1,
    roughness: 0.20,
    clearcoat: 0.18,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.1,
    side: THREE.FrontSide,
  });
  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.name = "Afterhours chrome ribbon";
  ribbon.castShadow = true;
  ribbon.receiveShadow = false;

  const object = new THREE.Group();
  object.name = "Afterhours flow sculpture";
  object.add(ribbon);
  object.userData.flowSculpture = {
    longitudinalSegments,
    profileSegments: radialSegments,
    triangles: indices.length / 3,
    closed: true,
    dimensions: geometry.boundingBox.getSize(new THREE.Vector3()).toArray(),
    section: { width: halfWidth * 2, edgeThickness: halfThickness * 2, crown },
  };

  let disposed = false;
  let lastProgress = NaN;

  function update(progress = 0) {
    if (disposed) return;
    const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    if (clamped === lastProgress) return;
    lastProgress = clamped;
    const p = clamped * clamped * (3 - 2 * clamped);
    // A deliberate 40-degree reveal across the complete scroll passage. No
    // elapsed-time term, spring, wobble, scale pulse, or geometry reallocation.
    object.rotation.set(-0.10 + 0.24 * p, -0.22 + 0.70 * p, -0.08 + 0.13 * p);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material.dispose();
  }

  update(0);
  return { object, update, dispose };
}
