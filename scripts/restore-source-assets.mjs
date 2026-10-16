import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(root, 'source-assets/manifest.json'), 'utf8'));
const verifyOnly = process.argv.includes('--verify-only');
if (manifest.format !== 1 || !Array.isArray(manifest.assets)) throw new Error('Unsupported source asset manifest.');
const digest = (data) => createHash('sha256').update(data).digest('hex');
const resolveInside = (relative, directory) => {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.join(root, directory) + path.sep)) throw new Error(`Invalid asset path: ${relative}`);
  return resolved;
};
let restored = 0;
for (const asset of manifest.assets) {
  const destination = resolveInside(asset.path, 'public');
  if (!Number.isSafeInteger(asset.size) || asset.size < 0 || !/^[a-f0-9]{64}$/.test(asset.sha256) || !/^[a-f0-9]{40}$/.test(asset.sha)) throw new Error(`Invalid asset manifest: ${asset.path}`);
  if (!verifyOnly && existsSync(destination)) {
    const current = readFileSync(destination);
    if (current.length !== asset.size || digest(current) !== asset.sha256) throw new Error(`Existing media differs from the backup: ${asset.path}. Preserve your edit and update the source asset manifest before restoring.`);
    continue;
  }
  const bytes = Buffer.concat(asset.chunks.map((relative) => {
    const encoded = readFileSync(resolveInside(relative, 'source-assets'), 'utf8').trim();
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) throw new Error(`Invalid source asset part: ${relative}`);
    return decoded;
  }));
  const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (bytes.length !== asset.size || digest(bytes) !== asset.sha256 || gitHash !== asset.sha) throw new Error(`Source asset integrity check failed: ${asset.path}`);
  if (!verifyOnly) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: 'wx' });
    restored++;
  }
}
console.log(verifyOnly ? `Verified ${manifest.assets.length} source media files.` : `Source media ready (${restored} restored).`);
