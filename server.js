const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Cache ──────────────────────────────────────────────────────────────
const cache = {};
const CACHE_TTL = 15 * 60 * 1000;
function cached(key) { const e = cache[key]; if (e && Date.now() - e.ts < CACHE_TTL) return e.data; return null; }
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }

// ─── Admin Price Overrides (persist to JSON file) ───────────────────────
const OVERRIDES_FILE = path.join(__dirname, 'price_overrides.json');
let priceOverrides = {};
try { priceOverrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')); } catch(e) {}

function saveOverrides() {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(priceOverrides, null, 2));
}

// Admin API: GET current overrides
app.get('/api/admin/overrides', (req, res) => {
  res.json(priceOverrides);
});

// Admin API: POST new override
app.post('/api/admin/overrides', (req, res) => {
  const { location, resource, currency, price } = req.body;
  if (!location || !resource || !currency || price === undefined) {
    return res.status(400).json({ error: 'location, resource, currency, price are required' });
  }
  if (!priceOverrides[location]) priceOverrides[location] = {};
  priceOverrides[location][resource] = { currency, price: Number(price) };
  saveOverrides();
  res.json({ success: true, overrides: priceOverrides });
});

// Admin API: DELETE an override
app.delete('/api/admin/overrides/:location/:resource', (req, res) => {
  const { location, resource } = req.params;
  if (priceOverrides[location] && priceOverrides[location][resource]) {
    delete priceOverrides[location][resource];
    if (Object.keys(priceOverrides[location]).length === 0) delete priceOverrides[location];
    saveOverrides();
  }
  res.json({ success: true, overrides: priceOverrides });
});

// ─── CloudSigma Locations (with PRG, ATH, NEXT) ───────────────────────────
const EXTRA_LOCATIONS = [
  { api_endpoint: 'https://prg1.t-cloud.eu/api/2.0/', country_code: 'CZ', display_name: 'Prague, Czech Republic', id: 'PRG' },
  { api_endpoint: 'https://gr.t-cloud.eu/api/2.0/', country_code: 'GR', display_name: 'Athens, Greece', id: 'ATH' },
  { api_endpoint: 'https://next.cloudsigma.com/api/2.0/', country_code: 'BG', display_name: 'Sofia, Bulgaria (NEXT)', id: 'NEXT' },
];

app.get('/api/locations', async (req, res) => {
  try {
    const hit = cached('locations');
    if (hit) return res.json(hit);
    const r = await fetch('https://zrh.cloudsigma.com/api/2.0/locations/?format=json');
    const data = await r.json();
    const existingIds = new Set(data.objects.map(o => o.id));
    for (const loc of EXTRA_LOCATIONS) {
      if (!existingIds.has(loc.id)) { data.objects.push(loc); data.meta.total_count++; }
    }
    data.objects.sort((a, b) => a.display_name.localeCompare(b.display_name));
    setCache('locations', data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Pricing per location (with overrides applied) ──────────────────────
app.get('/api/pricing/:endpoint', async (req, res) => {
  try {
    const endpoint = req.params.endpoint;
    const key = `pricing_${endpoint}`;
    const hit = cached(key);
    if (hit) return res.json(hit);

    const url = `https://${endpoint}/api/2.0/pricing/?format=json`;
    const r = await fetch(url, { timeout: 15000 });
    const raw = await r.json();

    // Apply overrides
    const locOverrides = priceOverrides[endpoint] || {};
    for (const [resource, override] of Object.entries(locOverrides)) {
      // Override level-0 price for this resource
      const existing = raw.objects.find(o => o.resource === resource && o.level === 0 && o.currency === override.currency);
      if (existing) {
        existing.price = String(override.price);
        existing._overridden = true;
      } else {
        raw.objects.push({
          resource, currency: override.currency, price: String(override.price),
          level: 0, unit: 'custom', multiplier: 1, _overridden: true
        });
      }
    }

    // Build resource_types index
    const resourceTypes = {};
    for (const obj of raw.objects) {
      if (!resourceTypes[obj.resource]) resourceTypes[obj.resource] = { unit: obj.unit, currencies: [] };
      if (!resourceTypes[obj.resource].currencies.includes(obj.currency)) resourceTypes[obj.resource].currencies.push(obj.currency);
    }
    raw.resource_types = resourceTypes;

    // CPU frequency limits per location (GHz per core)
    const CPU_FREQ = {
      'zrh.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'per.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'cai.cloudadore.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'wdc.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'sjc.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'hnl.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'tyo.cloudsigma.com':          { min: 0.5, max: 2.5, default: 2.0 },
      'mel.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'sof.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'sto.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'ams.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'dub.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'jhb.cloudsigma.com':          { min: 0.5, max: 2.0, default: 2.0 },
      'mnl.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'mnl2.cloudsigma.com':         { min: 0.5, max: 2.5, default: 2.0 },
      'kul.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'dus.cloudsigma.com':          { min: 0.5, max: 5.0, default: 2.0 },
      'prg1.t-cloud.eu':            { min: 0.5, max: 2.5, default: 2.0 },
      'gr.t-cloud.eu':              { min: 0.5, max: 2.5, default: 2.0 },
      'next.cloudsigma.com':         { min: 0.5, max: 5.0, default: 2.0 },
      'ruh.cld.v2.sa':              { min: 0.5, max: 2.5, default: 2.0 },
      'ist.cloudsigma.com':          { min: 0.5, max: 2.5, default: 2.0 },
      'mty.stratospherecloud.com':   { min: 0.5, max: 2.5, default: 2.0 },
    };
    raw.cpu_frequency = CPU_FREQ[endpoint] || { min: 0.5, max: 5.0, default: 2.0 };

    setCache(key, raw);
    res.json(raw);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TaaS Models ────────────────────────────────────────────────────────
app.get('/api/taas/models', async (req, res) => {
  try {
    const hit = cached('taas_models');
    if (hit) return res.json(hit);
    const r = await fetch('https://taas.cloudsigma.com/v1/models');
    const data = await r.json();
    setCache('taas_models', data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Competitor Pricing ─────────────────────────────────────────────────
const COMPETITOR_REGIONS = {
  AU: {
    aws:   { region: 'ap-southeast-2', name: 'Sydney',       cpu: 0.0520, ram: 0.0070, ssd: 0.110, ip: 3.60, bandwidth: 0.098, gpu_a100: 4.10, gpu_l40s: 2.10, obj_storage: 0.025 },
    azure: { region: 'australiaeast',  name: 'Australia East', cpu: 0.0500, ram: 0.0067, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.80, gpu_l40s: 1.95, obj_storage: 0.023 },
    gcp:   { region: 'australia-southeast1', name: 'Sydney', cpu: 0.0490, ram: 0.0066, ssd: 0.110, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.67, gpu_l40s: 1.85, obj_storage: 0.023 },
  },
  BG: {
    aws:   { region: 'eu-central-1',   name: 'Frankfurt',    cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'westeurope',     name: 'West Europe',  cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',   name: 'Belgium',      cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  CZ: {
    aws:   { region: 'eu-central-1',   name: 'Frankfurt',    cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'germanywestcentral', name: 'Germany W.C.', cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west3',   name: 'Frankfurt',    cpu: 0.0450, ram: 0.0060, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  DE: {
    aws:   { region: 'eu-central-1',   name: 'Frankfurt',    cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'germanywestcentral', name: 'Germany W.C.', cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west3',   name: 'Frankfurt',    cpu: 0.0450, ram: 0.0060, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  GR: {
    aws:   { region: 'eu-south-1',     name: 'Milan',        cpu: 0.0504, ram: 0.0067, ssd: 0.125, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.90, gpu_l40s: 1.95, obj_storage: 0.024 },
    azure: { region: 'westeurope',     name: 'West Europe',  cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',   name: 'Belgium',      cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  US: {
    aws:   { region: 'us-east-1',      name: 'N. Virginia',  cpu: 0.0400, ram: 0.0053, ssd: 0.100, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'eastus',         name: 'East US',      cpu: 0.0420, ram: 0.0056, ssd: 0.105, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'us-central1',    name: 'Iowa',         cpu: 0.0350, ram: 0.0047, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  GB: {
    aws:   { region: 'eu-west-2',      name: 'London',       cpu: 0.0448, ram: 0.0060, ssd: 0.116, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.90, gpu_l40s: 1.95, obj_storage: 0.024 },
    azure: { region: 'uksouth',        name: 'UK South',     cpu: 0.0440, ram: 0.0059, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.60, gpu_l40s: 1.80, obj_storage: 0.022 },
    gcp:   { region: 'europe-west2',   name: 'London',       cpu: 0.0430, ram: 0.0058, ssd: 0.105, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.30, gpu_l40s: 1.65, obj_storage: 0.020 },
  },
};

app.get('/api/competitors/:countryCode', (req, res) => {
  const cc = req.params.countryCode.toUpperCase();
  const data = COMPETITOR_REGIONS[cc] || COMPETITOR_REGIONS['DE'];
  res.json(data);
});

app.get('/api/competitors', (req, res) => {
  res.json(COMPETITOR_REGIONS);
});

// ─── Quotes DB (JSON file) ───────────────────────────────────────────────
const QUOTES_FILE = path.join(__dirname, 'quotes.json');
let quotesDB = {};
try { quotesDB = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8')); } catch(e) {}

function saveQuotesDB() {
  fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesDB, null, 2));
}

// Save a quote (upsert by opportunityId)
app.post('/api/quotes', (req, res) => {
  const data = req.body;
  if (!data || !data.opportunityId) {
    return res.status(400).json({ error: 'opportunityId is required' });
  }
  const id = data.opportunityId;
  const isUpdate = !!quotesDB[id];
  data.savedAt = new Date().toISOString();
  if (isUpdate) {
    data.updatedAt = data.savedAt;
    data.createdAt = quotesDB[id].createdAt || data.savedAt;
  } else {
    data.createdAt = data.savedAt;
  }
  quotesDB[id] = data;
  saveQuotesDB();
  res.json({ success: true, opportunityId: id, action: isUpdate ? 'updated' : 'created' });
});

// Get all quotes (list)
app.get('/api/quotes', (req, res) => {
  const list = Object.values(quotesDB).map(q => {
    // Build resource summary
    const vmCount = (q.virtualMachines || []).length;
    const totalVMs = (q.virtualMachines || []).reduce((s, vm) => s + (vm.qty || 1), 0);
    return {
      opportunityId: q.opportunityId,
      customer: q.customer || '',
      opportunityName: q.opportunityName || '',
      location: q.location || '',
      currency: q.currency || '',
      grandTotalMonthly: q.totals ? q.totals.grandTotalMonthly : 0,
      resourceSummary: {
        vmConfigs: vmCount,
        totalVMs: totalVMs,
        hasPaas: q.paas && q.paas.total > 0,
        hasOmnifabric: q.omnifabric && q.omnifabric.total > 0,
        hasTaas: q.taas && q.taas.total > 0
      },
      savedAt: q.savedAt,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt || null
    };
  });
  list.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  res.json({ quotes: list, total: list.length });
});

// Get a single quote by opportunityId
app.get('/api/quotes/:id', (req, res) => {
  const q = quotesDB[req.params.id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  res.json(q);
});

// Delete a quote
app.delete('/api/quotes/:id', (req, res) => {
  const id = req.params.id;
  if (!quotesDB[id]) return res.status(404).json({ error: 'Quote not found' });
  delete quotesDB[id];
  saveQuotesDB();
  res.json({ success: true, deleted: id });
});

// ─── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ☁️  CloudSigma Pricing Calculator`);
  console.log(`  → Running on http://0.0.0.0:${PORT}\n`);
});