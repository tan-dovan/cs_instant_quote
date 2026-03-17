require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');
const { execSync } = require('child_process');

const { init: initDb, get: dbGet, all: dbAll, run: dbRun } = require('./db');
const { sessionMiddleware, authRoutes, requireAuth, requireAdmin } = require('./auth');

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Session + Passport (must be before static so login page works)
sessionMiddleware(app);



// Public static files (login.html served without auth)
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes (/auth/google, /auth/google/callback, /auth/logout, /api/me)
authRoutes(app);

// ── Auth guard for the main SPA ──────────────────────────────────────
// Allow: /login.html, /auth/*, /api/* (handled below per-route), static assets
app.use(function(req, res, next) {
  const pub = ['/login.html', '/favicon.ico', '/logo-dark-bg.png', '/logo-white-bg.png'];
  if (pub.includes(req.path)) return next();
  if (req.path.startsWith('/auth/')) return next();
  if (req.path.startsWith('/api/')) return next();       // API routes handle auth themselves
  // HTML navigation — require login
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect('/login.html');
  }
  next();
});

// ─── Cache ──────────────────────────────────────────────────────────────
const cache = {};
const CACHE_TTL = 15 * 60 * 1000;
function cached(key) { const e = cache[key]; if (e && Date.now() - e.ts < CACHE_TTL) return e.data; return null; }
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }

// ─── Git info ────────────────────────────────────────────────────────────
function getGitInfo() {
  try {
    const sha     = execSync('git -C ' + __dirname + ' rev-parse HEAD',       { encoding: 'utf8' }).trim();
    const short   = execSync('git -C ' + __dirname + ' rev-parse --short HEAD',{ encoding: 'utf8' }).trim();
    const message = execSync('git -C ' + __dirname + ' log -1 --pretty=%s',    { encoding: 'utf8' }).trim();
    const date    = execSync('git -C ' + __dirname + ' log -1 --pretty=%ci',   { encoding: 'utf8' }).trim();
    return { sha, short, message, date };
  } catch(e) {
    return { sha: 'unknown', short: 'unknown', message: '', date: '' };
  }
}

app.get('/api/git-info', (req, res) => {
  res.json(getGitInfo());
});



// ─── Admin Price Overrides (persist to JSON file) ───────────────────────
const OVERRIDES_FILE = path.join(__dirname, 'price_overrides.json');
let priceOverrides = {};
try { priceOverrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')); } catch(e) {}

function saveOverrides() {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(priceOverrides, null, 2));
}

// ─── CPU Frequency config (persist to JSON, auto-populate from cloud_status) ─
const CPU_FREQ_FILE = path.join(__dirname, 'cpu_freq.json');
let cpuFreqConfig = {};
try { cpuFreqConfig = JSON.parse(fs.readFileSync(CPU_FREQ_FILE, 'utf8')); } catch(e) {}

function saveCpuFreqConfig() {
  fs.writeFileSync(CPU_FREQ_FILE, JSON.stringify(cpuFreqConfig, null, 2));
}

async function fetchCpuFreqFromCloudStatus(endpoint) {
  try {
    const url = `https://${endpoint}/api/2.0/cloud_status/?format=json`;
    const r = await fetch(url, { timeout: 10000 });
    if (!r.ok) return null;
    const data = await r.json();
    const mult = data.multipliers || {};
    const cpuTypes = [];
    if (mult.intel_cpu) cpuTypes.push('intel');
    if (mult.arm_cpu)   cpuTypes.push('arm');
    if (mult.amd_cpu)   cpuTypes.push('amd');
    if (mult.cpu_vmware) cpuTypes.push('vmware');
    return { cpuTypes, vmware: !!data.vmware, multipliers: mult };
  } catch(e) { return null; }
}

// Per-location CPU frequency defaults (fallback if cloud_status unavailable)
const CPU_FREQ_DEFAULTS = {
  'zrh.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'per.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'cai.cloudadore.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'wdc.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'sjc.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'hnl.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'tyo.cloudsigma.com':        { min: 0.5, max: 2.5, default: 2.0 },
  'mel.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'sof.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'sto.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'ams.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'dub.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'jhb.cloudsigma.com':        { min: 0.5, max: 2.0, default: 2.0 },
  'mnl.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'mnl2.cloudsigma.com':       { min: 0.5, max: 2.5, default: 2.0 },
  'kul.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'dus.cloudsigma.com':        { min: 0.5, max: 5.0, default: 2.0 },
  'prg1.t-cloud.eu':           { min: 0.5, max: 2.5, default: 2.0 },
  'gr.t-cloud.eu':             { min: 0.5, max: 2.5, default: 2.0 },
  'next.cloudsigma.com':       { min: 0.5, max: 5.0, default: 2.0 },
  'ruh.cld.v2.sa':             { min: 0.5, max: 2.5, default: 2.0 },
  'ist.cloudsigma.com':        { min: 0.5, max: 2.5, default: 2.0 },
  'mty.stratospherecloud.com': { min: 0.5, max: 2.5, default: 2.0 },
};

async function getCpuFreqForEndpoint(endpoint) {
  // 1. Check saved config (admin overrides take priority)
  if (cpuFreqConfig[endpoint]) return cpuFreqConfig[endpoint];
  // 2. Try to fetch from cloud_status to detect CPU types + capabilities
  const status = await fetchCpuFreqFromCloudStatus(endpoint);
  const base = CPU_FREQ_DEFAULTS[endpoint] || { min: 0.5, max: 5.0, default: 2.0 };
  const freq = { ...base };
  if (status) {
    if (status.cpuTypes && status.cpuTypes.length) freq.cpuTypes = status.cpuTypes;
    if (status.vmware !== undefined) freq.vmware = status.vmware;
  }
  // Cache to disk for future restarts
  cpuFreqConfig[endpoint] = freq;
  saveCpuFreqConfig();
  return freq;
}

// Admin API: GET/POST cpu frequency config
app.get('/api/admin/cpufreq', (req, res) => {
  res.json(cpuFreqConfig);
});

app.post('/api/admin/cpufreq', (req, res) => {
  const { endpoint, min, max, default: def } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  if (!cpuFreqConfig[endpoint]) cpuFreqConfig[endpoint] = {};
  if (min !== undefined) cpuFreqConfig[endpoint].min = Number(min);
  if (max !== undefined) cpuFreqConfig[endpoint].max = Number(max);
  if (def !== undefined) cpuFreqConfig[endpoint].default = Number(def);
  saveCpuFreqConfig();
  res.json({ success: true, config: cpuFreqConfig });
});

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
  { api_endpoint: 'https://gr.t-cloud.eu/api/2.0/',   country_code: 'GR', display_name: 'Athens, Greece',         id: 'ATH' },
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

    // Dynamic CPU frequency — fetched from cloud_status, cached to disk
    raw.cpu_frequency = await getCpuFreqForEndpoint(endpoint);

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
    aws:   { region: 'ap-southeast-2',       name: 'Sydney',        cpu: 0.0520, ram: 0.0070, ssd: 0.110, ip: 3.60, bandwidth: 0.098, gpu_a100: 4.10, gpu_l40s: 2.10, obj_storage: 0.025 },
    azure: { region: 'australiaeast',         name: 'Australia East',cpu: 0.0500, ram: 0.0067, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.80, gpu_l40s: 1.95, obj_storage: 0.023 },
    gcp:   { region: 'australia-southeast1',  name: 'Sydney',        cpu: 0.0490, ram: 0.0066, ssd: 0.110, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.67, gpu_l40s: 1.85, obj_storage: 0.023 },
  },
  BG: {
    aws:   { region: 'eu-central-1',          name: 'Frankfurt',     cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'westeurope',            name: 'West Europe',   cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',          name: 'Belgium',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  CZ: {
    aws:   { region: 'eu-central-1',          name: 'Frankfurt',     cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'germanywestcentral',    name: 'Germany W.C.',  cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west3',          name: 'Frankfurt',     cpu: 0.0450, ram: 0.0060, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  DE: {
    aws:   { region: 'eu-central-1',          name: 'Frankfurt',     cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'germanywestcentral',    name: 'Germany W.C.',  cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west3',          name: 'Frankfurt',     cpu: 0.0450, ram: 0.0060, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  EG: {
    aws:   { region: 'me-south-1',            name: 'Bahrain',       cpu: 0.0530, ram: 0.0071, ssd: 0.130, ip: 3.60, bandwidth: 0.100, gpu_a100: 4.00, gpu_l40s: 2.00, obj_storage: 0.026 },
    azure: { region: 'uaenorth',             name: 'UAE North',     cpu: 0.0510, ram: 0.0068, ssd: 0.120, ip: 3.65, bandwidth: 0.090, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.024 },
    gcp:   { region: 'me-west1',             name: 'Tel Aviv',      cpu: 0.0480, ram: 0.0065, ssd: 0.115, ip: 3.60, bandwidth: 0.088, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.023 },
  },
  GR: {
    aws:   { region: 'eu-south-1',            name: 'Milan',         cpu: 0.0504, ram: 0.0067, ssd: 0.125, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.90, gpu_l40s: 1.95, obj_storage: 0.024 },
    azure: { region: 'westeurope',            name: 'West Europe',   cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',          name: 'Belgium',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  JP: {
    aws:   { region: 'ap-northeast-1',        name: 'Tokyo',         cpu: 0.0472, ram: 0.0063, ssd: 0.120, ip: 3.60, bandwidth: 0.114, gpu_a100: 4.10, gpu_l40s: 2.10, obj_storage: 0.025 },
    azure: { region: 'japaneast',            name: 'Japan East',    cpu: 0.0460, ram: 0.0062, ssd: 0.115, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.80, gpu_l40s: 1.90, obj_storage: 0.023 },
    gcp:   { region: 'asia-northeast1',      name: 'Tokyo',         cpu: 0.0440, ram: 0.0059, ssd: 0.110, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.022 },
  },
  MY: {
    aws:   { region: 'ap-southeast-1',        name: 'Singapore',     cpu: 0.0496, ram: 0.0067, ssd: 0.114, ip: 3.60, bandwidth: 0.090, gpu_a100: 4.00, gpu_l40s: 2.00, obj_storage: 0.025 },
    azure: { region: 'southeastasia',        name: 'SE Asia',       cpu: 0.0480, ram: 0.0064, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.023 },
    gcp:   { region: 'asia-southeast1',      name: 'Singapore',     cpu: 0.0450, ram: 0.0060, ssd: 0.108, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.40, gpu_l40s: 1.70, obj_storage: 0.022 },
  },
  MX: {
    aws:   { region: 'us-east-1',             name: 'N. Virginia',   cpu: 0.0400, ram: 0.0053, ssd: 0.100, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'mexicocentral',        name: 'Mexico Central',cpu: 0.0430, ram: 0.0058, ssd: 0.107, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.022 },
    gcp:   { region: 'northamerica-northeast1',name:'Montréal',      cpu: 0.0370, ram: 0.0050, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.00, gpu_l40s: 1.50, obj_storage: 0.020 },
  },
  PH: {
    aws:   { region: 'ap-southeast-1',        name: 'Singapore',     cpu: 0.0496, ram: 0.0067, ssd: 0.114, ip: 3.60, bandwidth: 0.090, gpu_a100: 4.00, gpu_l40s: 2.00, obj_storage: 0.025 },
    azure: { region: 'southeastasia',        name: 'SE Asia',       cpu: 0.0480, ram: 0.0064, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.023 },
    gcp:   { region: 'asia-southeast1',      name: 'Singapore',     cpu: 0.0450, ram: 0.0060, ssd: 0.108, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.40, gpu_l40s: 1.70, obj_storage: 0.022 },
  },
  SA: {
    aws:   { region: 'me-south-1',            name: 'Bahrain',       cpu: 0.0530, ram: 0.0071, ssd: 0.130, ip: 3.60, bandwidth: 0.100, gpu_a100: 4.00, gpu_l40s: 2.00, obj_storage: 0.026 },
    azure: { region: 'uaenorth',             name: 'UAE North',     cpu: 0.0510, ram: 0.0068, ssd: 0.120, ip: 3.65, bandwidth: 0.090, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.024 },
    gcp:   { region: 'me-west1',             name: 'Tel Aviv',      cpu: 0.0480, ram: 0.0065, ssd: 0.115, ip: 3.60, bandwidth: 0.088, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.023 },
  },
  SE: {
    aws:   { region: 'eu-north-1',            name: 'Stockholm',     cpu: 0.0416, ram: 0.0056, ssd: 0.114, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'swedencentral',        name: 'Sweden Central',cpu: 0.0440, ram: 0.0059, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-north1',        name: 'Finland',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  TR: {
    aws:   { region: 'eu-central-1',          name: 'Frankfurt',     cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'germanywestcentral',    name: 'Germany W.C.',  cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',          name: 'Belgium',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  US: {
    aws:   { region: 'us-east-1',             name: 'N. Virginia',   cpu: 0.0400, ram: 0.0053, ssd: 0.100, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'eastus',               name: 'East US',       cpu: 0.0420, ram: 0.0056, ssd: 0.105, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'us-central1',          name: 'Iowa',          cpu: 0.0350, ram: 0.0047, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  GB: {
    aws:   { region: 'eu-west-2',             name: 'London',        cpu: 0.0448, ram: 0.0060, ssd: 0.116, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.90, gpu_l40s: 1.95, obj_storage: 0.024 },
    azure: { region: 'uksouth',              name: 'UK South',      cpu: 0.0440, ram: 0.0059, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.60, gpu_l40s: 1.80, obj_storage: 0.022 },
    gcp:   { region: 'europe-west2',         name: 'London',        cpu: 0.0430, ram: 0.0058, ssd: 0.105, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.30, gpu_l40s: 1.65, obj_storage: 0.020 },
  },
  ZA: {
    aws:   { region: 'af-south-1',            name: 'Cape Town',     cpu: 0.0528, ram: 0.0071, ssd: 0.130, ip: 3.60, bandwidth: 0.154, gpu_a100: 4.20, gpu_l40s: 2.10, obj_storage: 0.028 },
    azure: { region: 'southafricanorth',     name: 'South Africa N',cpu: 0.0510, ram: 0.0068, ssd: 0.120, ip: 3.65, bandwidth: 0.100, gpu_a100: 3.90, gpu_l40s: 1.95, obj_storage: 0.026 },
    gcp:   { region: 'africa-south1',        name: 'Johannesburg',  cpu: 0.0490, ram: 0.0066, ssd: 0.115, ip: 3.60, bandwidth: 0.095, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.025 },
  },
  CH: {
    aws:   { region: 'eu-central-2',          name: 'Zurich',        cpu: 0.0528, ram: 0.0071, ssd: 0.130, ip: 3.60, bandwidth: 0.090, gpu_a100: 4.00, gpu_l40s: 2.00, obj_storage: 0.026 },
    azure: { region: 'switzerlandnorth',     name: 'Switzerland N', cpu: 0.0510, ram: 0.0068, ssd: 0.120, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.70, gpu_l40s: 1.85, obj_storage: 0.024 },
    gcp:   { region: 'europe-west6',         name: 'Zurich',        cpu: 0.0490, ram: 0.0066, ssd: 0.115, ip: 3.60, bandwidth: 0.085, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.023 },
  },
  NL: {
    aws:   { region: 'eu-west-1',             name: 'Ireland',       cpu: 0.0432, ram: 0.0058, ssd: 0.110, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'westeurope',           name: 'West Europe',   cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west4',         name: 'Netherlands',   cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  IE: {
    aws:   { region: 'eu-west-1',             name: 'Ireland',       cpu: 0.0432, ram: 0.0058, ssd: 0.110, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'northeurope',          name: 'North Europe',  cpu: 0.0450, ram: 0.0060, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.50, gpu_l40s: 1.75, obj_storage: 0.022 },
    gcp:   { region: 'europe-west1',         name: 'Belgium',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
  },
  BGN: {
    aws:   { region: 'eu-central-1',          name: 'Frankfurt',     cpu: 0.0480, ram: 0.0064, ssd: 0.119, ip: 3.60, bandwidth: 0.090, gpu_a100: 3.67, gpu_l40s: 1.83, obj_storage: 0.023 },
    azure: { region: 'westeurope',           name: 'West Europe',   cpu: 0.0460, ram: 0.0062, ssd: 0.110, ip: 3.65, bandwidth: 0.087, gpu_a100: 3.40, gpu_l40s: 1.74, obj_storage: 0.021 },
    gcp:   { region: 'europe-west1',         name: 'Belgium',       cpu: 0.0380, ram: 0.0051, ssd: 0.100, ip: 3.60, bandwidth: 0.085, gpu_a100: 2.93, gpu_l40s: 1.60, obj_storage: 0.020 },
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
// ─── Quotes DB (JSON file) ───────────────────────────────────────────────
const QUOTES_FILE = path.join(__dirname, 'quotes.json');
let quotesDB = {};
try { quotesDB = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8')); } catch(e) {}

function saveQuotesDB() {
  fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesDB, null, 2));
}

function quoteToSummary(q, extra = {}) {
  const vmCount  = (q.virtualMachines || []).length;
  const totalVMs = (q.virtualMachines || []).reduce((s, vm) => s + (vm.qty || 1), 0);
  return {
    opportunityId:  q.opportunityId,
    customer:       q.customer || '',
    opportunityName:q.opportunityName || '',
    location:       q.location || '',
    currency:       q.currency || '',
    grandTotalMonthly: q.totals ? q.totals.grandTotalMonthly : 0,
    ownerId:        q.ownerId || null,
    ownerEmail:     q.ownerEmail || null,
    resourceSummary: {
      vmConfigs: vmCount, totalVMs,
      hasPaas:           !!(q.paas           && q.paas.total > 0),
      hasOmnifabric:     !!(q.omnifabric      && q.omnifabric.total > 0),
      hasTaas:           !!(q.taas            && q.taas.total > 0),
      hasKubernetes:     !!(q.kubernetes      && q.kubernetes.total > 0),
      hasNetwork:        !!(q.network         && q.network.length > 0),
      hasDataProtection: !!(q.dataProtection  && (q.dataProtection.upfront > 0 || q.dataProtection.subscription > 0)),
    },
    savedAt: q.savedAt, createdAt: q.createdAt, updatedAt: q.updatedAt || null,
    ...extra
  };
}

// ── Helper: check if user can edit a quote (owner, admin, or shared) ──
async function canEditQuote(q, user) {
  if (!q) return false;
  if (user.role === 'admin') return true;
  if (q.ownerId === user.id) return true;
  // Check share record
  try {
    const row = await dbGet('SELECT id FROM quote_shares WHERE quote_id = ? AND shared_with = ?', [q.opportunityId, user.id]);
    if (row) return true;
  } catch(e) {}
  return false;
}

// ── POST /api/quotes — create new quote (auth required) ───────────────
app.post('/api/quotes', requireAuth, async (req, res) => {
  const data = req.body;
  if (!data || !data.opportunityId) {
    return res.status(400).json({ error: 'opportunityId is required' });
  }
  const id  = data.opportunityId;
  const existing = quotesDB[id];

  // If quote already exists, check edit permission (owner, admin, or shared)
  if (existing) {
    const allowed = await canEditQuote(existing, req.user);
    if (!allowed) return res.status(403).json({ error: 'Not your quote' });
  }

  const now = new Date().toISOString();
  data.savedAt = now;
  if (existing) {
    data.updatedAt  = now;
    data.updatedBy  = req.user.email;
    data.createdAt  = existing.createdAt || now;
    data.ownerId    = existing.ownerId    || req.user.id;
    data.ownerEmail = existing.ownerEmail || req.user.email;
  } else {
    data.createdAt  = now;
    data.ownerId    = req.user.id;
    data.ownerEmail = req.user.email;
    data.updatedBy  = req.user.email;
  }
  quotesDB[id] = data;
  saveQuotesDB();
  res.json({ success: true, opportunityId: id, action: existing ? 'updated' : 'created' });
});

// ── PUT /api/quotes/:id — explicit update (auth required, owner/admin/shared) ─
app.put('/api/quotes/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  const existing = quotesDB[id];
  if (!existing) return res.status(404).json({ error: 'Quote not found' });

  const allowed = await canEditQuote(existing, req.user);
  if (!allowed) return res.status(403).json({ error: 'Not your quote' });

  const data = req.body;
  if (!data) return res.status(400).json({ error: 'No data provided' });

  const now = new Date().toISOString();
  data.opportunityId = id;           // enforce correct ID — no drift
  data.savedAt    = now;
  data.updatedAt  = now;
  data.updatedBy  = req.user.email;
  data.createdAt  = existing.createdAt || now;
  data.ownerId    = existing.ownerId   || req.user.id;
  data.ownerEmail = existing.ownerEmail || req.user.email;

  quotesDB[id] = data;
  saveQuotesDB();
  res.json({ success: true, opportunityId: id, action: 'updated' });
});

// ── GET /api/quotes — list (auth required, RBAC filtered) ────────────
app.get('/api/quotes', requireAuth, async (req, res) => {
  const uid   = req.user.id;
  const isAdm = req.user.role === 'admin';

  // Get quote IDs shared with this user
  let sharedIds = [];
  try {
    const rows = await dbAll('SELECT quote_id FROM quote_shares WHERE shared_with = ?', [uid]);
    sharedIds = rows.map(r => r.quote_id);
  } catch(e) {}

  const list = Object.values(quotesDB)
    .filter(q => isAdm || q.ownerId === uid || sharedIds.includes(q.opportunityId))
    .map(q => {
      const isShared = !isAdm && q.ownerId !== uid && sharedIds.includes(q.opportunityId);
      return quoteToSummary(q, { isShared, isOwner: q.ownerId === uid });
    });

  list.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  res.json({ quotes: list, total: list.length });
});

// ── GET /api/quotes/:id — single quote (auth required, RBAC) ─────────
app.get('/api/quotes/:id', requireAuth, async (req, res) => {
  const q = quotesDB[req.params.id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  const uid   = req.user.id;
  const isAdm = req.user.role === 'admin';
  // Check ownership or share
  let shared = false;
  try {
    const row = await dbGet('SELECT id FROM quote_shares WHERE quote_id = ? AND shared_with = ?',
      [req.params.id, uid]);
    shared = !!row;
  } catch(e) {}
  if (!isAdm && q.ownerId !== uid && !shared) {
    return res.status(403).json({ error: 'Not your quote' });
  }
  res.json(q);
});

// ── DELETE /api/quotes/:id — owner or admin only ──────────────────────
app.delete('/api/quotes/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const q  = quotesDB[id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  if (q.ownerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your quote' });
  }
  delete quotesDB[id];
  saveQuotesDB();
  res.json({ success: true, deleted: id });
});

// ── POST /api/quotes/:id/share — share with another user ─────────────
app.post('/api/quotes/:id/share', requireAuth, async (req, res) => {
  const id  = req.params.id;
  const q   = quotesDB[id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  if (q.ownerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your quote' });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const target = await dbGet('SELECT id, email, name FROM users WHERE email = ?', [email]);
  if (!target) return res.status(404).json({ error: 'User not found. They must log in at least once.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot share with yourself' });

  try {
    await dbRun(
      'INSERT OR IGNORE INTO quote_shares (quote_id, owner_id, shared_with) VALUES (?, ?, ?)',
      [id, req.user.id, target.id]
    );
    res.json({ success: true, sharedWith: { id: target.id, email: target.email, name: target.name } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/quotes/:id/share/:userId — revoke share ──────────────
app.delete('/api/quotes/:id/share/:userId', requireAuth, async (req, res) => {
  const q = quotesDB[req.params.id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  if (q.ownerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your quote' });
  }
  await dbRun('DELETE FROM quote_shares WHERE quote_id = ? AND shared_with = ?',
    [req.params.id, req.params.userId]);
  res.json({ success: true });
});

// ── GET /api/quotes/:id/shares — list who it's shared with ───────────
app.get('/api/quotes/:id/shares', requireAuth, async (req, res) => {
  const q = quotesDB[req.params.id];
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  if (q.ownerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your quote' });
  }
  const rows = await dbAll(
    `SELECT qs.shared_with, u.email, u.name, qs.created_at
     FROM quote_shares qs JOIN users u ON u.id = qs.shared_with
     WHERE qs.quote_id = ?`, [req.params.id]
  );
  res.json({ shares: rows });
});

// ── Admin: list all users ─────────────────────────────────────────────
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await dbAll('SELECT id, email, name, picture, role, created_at, last_login FROM users ORDER BY created_at DESC');
  res.json({ users });
});

// ── Admin: update user role ───────────────────────────────────────────
app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
  res.json({ success: true });
});

// ─── SPA fallback (auth-guarded) ────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ☁️  CloudSigma Instant Quoting Tool`);
    console.log(`  → Running on http://0.0.0.0:${PORT}`);
    const g = getGitInfo();
    console.log(`  → Commit: ${g.short} — ${g.message}\n`);
  });
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
