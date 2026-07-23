import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { createWorker } from 'tesseract.js';
import '../../detection/geometry.js';
import './fields.js';
import './ocr.js';

const G = globalThis.PaniniGeometry;
const O = globalThis.PaniniOcr;

const VALID_CODES = new Set(['TUN','MEX','RSA','KOR','CZE','CAN','BIH','QAT','SUI','BRA','MAR','HAI','SCO','USA','PAR','AUS','TUR','GER','CUW','ECU','NED','JPN','SWE','BEL','EGY','IRN','NZL','ESP','CPV','KSA','URU','FRA','SEN','IRQ','NOR','ARG','ALG','AUT','JOR','POR','COD','UZB','COL','ENG','CRO','GHA','PAN']);

// Ground Truth per Sichtpruefung der Fixture-Fotos (siehe Konversation).
const CASES = [
  { file: '20260723_073545.jpg', code: 'MAR', missing: [5, 6, 10, 13, 15, 20] },
  { file: '20260723_073550.jpg', code: 'HAI', missing: [2, 4, 11, 14, 15, 16, 17, 18, 19, 20] },
  { file: '20260723_073555.jpg', code: 'SCO', missing: [1, 2, 3, 9, 12, 18] },
  { file: '20260723_073559.jpg', code: 'USA', missing: [1, 2, 4, 6, 9, 10, 16] },
  { file: '20260723_073604.jpg', code: 'PAR', missing: [5, 10, 13, 15, 17, 18, 20] },
  { file: '20260723_073609.jpg', code: 'AUS', missing: [1, 4, 6, 7, 9, 10, 13, 14, 15] },
];

const FIXTURES_DIR = process.env.PANINI_FIXTURES_DIR || 'C:\\panini-fehlbilder-app-fixtures';

function decode(path) { return jpeg.decode(readFileSync(path), { useTArray: true, maxMemoryUsageInMB: 1024 }); }

function downscale(pixels, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(pixels.width, pixels.height));
  if (scale >= 1) return pixels;
  const outW = Math.round(pixels.width * scale), outH = Math.round(pixels.height * scale);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const sx = Math.min(pixels.width - 1, Math.round(x / scale)), sy = Math.min(pixels.height - 1, Math.round(y / scale));
    const si = (sy * pixels.width + sx) * 4, di = (y * outW + x) * 4;
    out[di] = pixels.data[si]; out[di + 1] = pixels.data[si + 1]; out[di + 2] = pixels.data[si + 2]; out[di + 3] = 255;
  }
  return { data: out, width: outW, height: outH };
}

async function processFile(worker, file) {
  const full = decode(`${FIXTURES_DIR}\\${file}`);
  const small = downscale(full, 900);
  const bounds = G.detectPageBounds(small);
  const scaleBack = full.width / small.width;
  const cornersFull = bounds.corners.map(p => ({ x: p.x * scaleBack, y: p.y * scaleBack }));
  const page = G.dewarpPerspective(full, cornersFull, 1200, 900);

  const regions = O.findCandidateRegions(page, { topN: 25, margin: 0.4 });
  const found = [];
  for (const region of regions) {
    const bin = O.cropAndBinarize(page, region, 3, 150);
    const tmpPath = new URL('_validate-tmp.jpg', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    writeFileSync(tmpPath, jpeg.encode(bin, 85).data);
    const result = await worker.recognize(tmpPath);
    found.push(...O.parseCodeNumberPairs(result.data.text, VALID_CODES));
  }
  return found;
}

async function main() {
  const worker = await createWorker('eng', 1, { logger: () => {} });
  let totalTP = 0, totalFP = 0, totalMissing = 0;
  for (const testCase of CASES) {
    const found = await processFile(worker, testCase.file);
    const byCode = {};
    for (const p of found) (byCode[p.code] ??= new Set()).add(p.num);
    const foundNums = [...(byCode[testCase.code] || [])].sort((a, b) => a - b);
    const truePositives = foundNums.filter(n => testCase.missing.includes(n));
    const falsePositives = foundNums.filter(n => !testCase.missing.includes(n));
    totalTP += truePositives.length; totalFP += falsePositives.length; totalMissing += testCase.missing.length;
    console.log(`${testCase.file} (${testCase.code}): Ground Truth=${JSON.stringify(testCase.missing)} Gefunden=${JSON.stringify(foundNums)} Richtig=${JSON.stringify(truePositives)} Falsch=${JSON.stringify(falsePositives)}`);
  }
  console.log(`\nGESAMT: ${totalTP}/${totalMissing} richtig gefunden (Recall ${(totalTP / totalMissing * 100).toFixed(0)}%), ${totalFP} falsche Treffer`);
  await worker.terminate();
}

main();
