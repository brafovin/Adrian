// Liest die Produktdaten aus onlineshop/index.html (zwischen CATALOG:START und CATALOG:END)
// und schreibt sie nach onlineshop/chat-catalog.json. Daraus baut api/chat.js das Wissen des KI-Assistenten.
// Aufruf nach jeder Änderung an Produkten, Farben oder Versandwerten:  node onlineshop/tools/export-catalog.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'index.html');
const outPath = path.join(__dirname, '..', 'chat-catalog.json');

function exportCatalog() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = /\/\* CATALOG:START \*\/([\s\S]*?)\/\* CATALOG:END \*\//.exec(html);
  if (!m) throw new Error('CATALOG-Marker in index.html nicht gefunden.');
  const data = vm.runInNewContext(m[1] + '\n;({COLORS,PRODUCTS,CATS,FREE_FROM,SHIP_STD,SHIP_EXP,COUPON})', {});
  const cats = Object.fromEntries(data.CATS);
  return {
    shop: 'JWG.onlineshop',
    currency: 'EUR',
    shipping: { standardEur: data.SHIP_STD, expressEur: data.SHIP_EXP, freeFromEur: data.FREE_FROM, couponCode: data.COUPON, couponPercent: 10 },
    colors: Object.fromEntries(Object.entries(data.COLORS).map(([k, c]) => [k, { name: c.name, code: c.code }])),
    products: data.PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      short: p.short,
      category: cats[p.cat] || p.cat,
      priceEur: p.price,
      weightGsm: p.weight || null,
      isNew: !!p.isNew,
      colors: p.colors,
      originalColor: p.orig,
      realPhoto: !!p.photo,
      allColorsRecolored: !!p.allRecolored,
      sizes: p.sizes,
      sizeTable: p.table,
      tagline: p.tag,
      description: p.lead,
      features: p.points,
      note: p.note || null,
      material: p.material,
      fit: p.fit,
      care: p.care,
      washTempC: p.temp,
      composition: p.compo,
    })),
  };
}

if (require.main === module) {
  const catalog = exportCatalog();
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`${catalog.products.length} Produkte nach ${path.relative(process.cwd(), outPath)} geschrieben.`);
}
module.exports = { exportCatalog };
