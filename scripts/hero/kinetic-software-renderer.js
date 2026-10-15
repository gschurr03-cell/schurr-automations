import * as THREE from 'three';

// A small, transparent CPU renderer for rigid, decorative THREE mesh scenes.
// The same scene transforms and camera drive both this and the WebGL renderer.
export class SoftwareRenderer {
  constructor(options = {}) {
    this.domElement = options.canvas || (options.getContext ? options : document.createElement('canvas'));
    this.context = this.domElement.getContext('2d', { alpha: true });
    if (!this.context) throw new Error('Canvas 2D is unavailable');
    this.pixelRatio = 1;
    this.width = this.height = 1;
    this.cache = new WeakMap();
    this.mv = new THREE.Matrix4();
    this.normal = new THREE.Matrix3();
    this.outputColorSpace = THREE.SRGBColorSpace;
    this.shadowMap = { enabled: false };
  }

  setPixelRatio(ratio) {
    this.pixelRatio = Math.max(0.5, Math.min(2, ratio || 1));
    this.setSize(this.width, this.height, false);
  }

  setSize(width, height, updateStyle = true) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.domElement.width = Math.round(this.width * this.pixelRatio);
    this.domElement.height = Math.round(this.height * this.pixelRatio);
    if (updateStyle) {
      this.domElement.style.width = `${this.width}px`;
      this.domElement.style.height = `${this.height}px`;
    }
  }

  setClearColor() { /* The hero always has a transparent background. */ }
  dispose() { this.cache = new WeakMap(); }

  render(scene, camera) {
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const ctx = this.context, w = this.width, h = this.height;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const projection = camera.projectionMatrix.elements;
    const faces = [];
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const geometry = mesh.geometry, position = geometry.attributes.position;
      const normals = geometry.attributes.normal, index = geometry.index;
      let saved = this.cache.get(mesh);
      if (!saved || saved.count !== position.count) {
        saved = { count: position.count, vertices: new Float64Array(position.count * 6) };
        this.cache.set(mesh, saved);
      }
      const vertices = saved.vertices;
      this.mv.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
      this.normal.getNormalMatrix(this.mv);
      const m = this.mv.elements, n = this.normal.elements;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i), k = i * 6;
        vertices[k] = m[0]*x + m[4]*y + m[8]*z + m[12];
        vertices[k+1] = m[1]*x + m[5]*y + m[9]*z + m[13];
        vertices[k+2] = m[2]*x + m[6]*y + m[10]*z + m[14];
        if (normals) {
          const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
          vertices[k+3] = n[0]*nx + n[3]*ny + n[6]*nz;
          vertices[k+4] = n[1]*nx + n[4]*ny + n[7]*nz;
          vertices[k+5] = n[2]*nx + n[5]*ny + n[8]*nz;
        }
      }
      const count = index ? index.count : position.count;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      const start = geometry.drawRange.start || 0, end = Math.min(count, start + geometry.drawRange.count);
      for (const group of groups) {
        const material = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
        if (!material || material.visible === false || material.opacity === 0) continue;
        const stop = Math.min(end, group.start + group.count);
        for (let i = Math.max(start, group.start); i + 2 < stop; i += 3) {
          const a = (index ? index.getX(i) : i) * 6;
          const b = (index ? index.getX(i+1) : i+1) * 6;
          const c = (index ? index.getX(i+2) : i+2) * 6;
          const ax = vertices[a], ay = vertices[a+1], az = vertices[a+2];
          const ux = vertices[b]-ax, uy = vertices[b+1]-ay, uz = vertices[b+2]-az;
          const vx = vertices[c]-ax, vy = vertices[c+1]-ay, vz = vertices[c+2]-az;
          let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
          const facing = camera.isOrthographicCamera ? nz : -(nx*ax + ny*ay + nz*az);
          const back = facing < 0;
          if ((material.side === THREE.FrontSide && back) || (material.side === THREE.BackSide && !back)) continue;
          if (normals) {
            nx = vertices[a+3]+vertices[b+3]+vertices[c+3];
            ny = vertices[a+4]+vertices[b+4]+vertices[c+4];
            nz = vertices[a+5]+vertices[b+5]+vertices[c+5];
          }
          const length = Math.hypot(nx, ny, nz) || 1, sign = back ? -1 : 1;
          nx = nx/length*sign; ny = ny/length*sign; nz = nz/length*sign;
          let polygon = [a,b,c].map(k => [vertices[k],vertices[k+1],vertices[k+2]]);
          // Clip near-plane crossings rather than dropping partially visible faces.
          const clipped = [], near = -camera.near;
          for (let j = 0; j < polygon.length; j++) {
            const p = polygon[j], q = polygon[(j+1)%polygon.length];
            const pin = p[2] <= near, qin = q[2] <= near;
            if (pin) clipped.push(p);
            if (pin !== qin) {
              const t = (near-p[2])/(q[2]-p[2]);
              clipped.push([p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t, near]);
            }
          }
          if (clipped.length < 3) continue;
          polygon = clipped;
          const px = (ax+vertices[b]+vertices[c])/3, py = (ay+vertices[b+1]+vertices[c+1])/3;
          const pz = (az+vertices[b+2]+vertices[c+2])/3;
          const color = metalColor(nx, ny, nz, px, py, pz, material);
          const points = polygon.map(p => {
            const d = projection[3]*p[0]+projection[7]*p[1]+projection[11]*p[2]+projection[15];
            return [(projection[0]*p[0]+projection[4]*p[1]+projection[8]*p[2]+projection[12])/d*w/2+w/2,
              -(projection[1]*p[0]+projection[5]*p[1]+projection[9]*p[2]+projection[13])/d*h/2+h/2];
          });
          faces.push({ points, depth: pz, color, opacity: material.opacity ?? 1 });
        }
      }
    });
    faces.sort((a,b) => a.depth-b.depth);
    ctx.lineWidth = 0.55;
    ctx.lineJoin = 'round';
    for (const face of faces) {
      ctx.globalAlpha = face.opacity;
      ctx.fillStyle = ctx.strokeStyle = face.color;
      ctx.beginPath();
      face.points.forEach((p,i) => i ? ctx.lineTo(p[0],p[1]) : ctx.moveTo(p[0],p[1]));
      ctx.closePath();
      ctx.fill();
      // Subpixel overlap prevents hairline gaps between adjacent coplanar triangles.
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function metalColor(nx, ny, nz, px, py, pz, material) {
  const length = Math.hypot(px,py,pz) || 1;
  const vx = -px/length, vy = -py/length, vz = -pz/length;
  const nv = Math.max(0, nx*vx+ny*vy+nz*vz);
  const rx = 2*nv*nx-vx, ry = 2*nv*ny-vy;
  const roughness = Math.max(0.05, material.roughness ?? 0.25);
  const band = (value, center, width) => Math.exp(-(((value-center)/width)**2));
  const white = 1.15*band(rx,-0.43,0.16+roughness*0.25) + 0.5*band(ry,0.72,0.24);
  const warm = 0.75*band(rx,0.64,0.20+roughness*0.2);
  const diffuse = Math.max(0,-nx*0.48+ny*0.72+nz*0.5)*0.18;
  const edge = Math.pow(1-nv,3)*0.18;
  const base = material.color || { r: 0.65, g: 0.67, b: 0.7 };
  const emissive = material.emissive || { r: 0, g: 0, b: 0 };
  const strength = material.emissiveIntensity ?? 1;
  const channels = ['r','g','b'].map((key,i) => {
    const light = 0.12+diffuse+white+warm*[1,0.79,0.52][i]+edge;
    const linear = Math.max(0,base[key]*light + white*0.10 + emissive[key]*strength);
    return Math.round(Math.min(255, Math.pow(linear/(1+linear)*1.4,1/2.2)*255));
  });
  return `rgb(${channels.join(',')})`;
}

export default SoftwareRenderer;
