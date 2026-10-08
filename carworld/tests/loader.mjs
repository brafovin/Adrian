// Node-Loader für Tests: bildet die Import-Map des Browsers ('three', 'three/addons/') auf das mitgelieferte vendor/-Verzeichnis ab.
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const vendor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../vendor');

export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: pathToFileURL(path.join(vendor, 'three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(path.join(vendor, 'addons', specifier.slice('three/addons/'.length))).href, shortCircuit: true };
  return next(specifier, context);
}
