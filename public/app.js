var locations=[],pricing={},competitors={},currentLocation=null;
var vmLines=[{id:1,qty:1,name:'VM 1',cpu:0,cpuSpeed:2,ram:0,cpuType:'intel',hypervisor:'kvm',disks:[{type:'dssd',size:0}],localDisk:0,backup:0,gpu:0,gpuType:'gpu_nvidia_a100',ip:0,winOs:'',winOsQty:0,sqlLic:'',sqlLicQty:0,rdsQty:0}];
var nextVmId=2;
var objStorageState={obj_hdd:0,obj_nvme:0,obj_caching:0};
var netState={tx:0,txQty:1,bandwidth:'',vlan:0};
var dpState={migration:0,backup:0,backupCapacity:0,dr:0,drCapacity:0};
var k8sState={nodes:0,vcpu:4,ram:8,storageGB:0};
var FX={USD:1,CHF:1.12,EUR:1.08,GBP:1.27,CZK:0.045,AUD:0.65,JPY:0.0067,SAR:0.27,TRY:0.031,MXN:0.058,PHP:0.018,MYR:0.22,EGP:0.032,BGN:0.55};
var burstLevels={};
var collapsed={loc:true,cfg:true,vm:true,obj:true,net:true,dp:true,paas:true,of:true,taas:true,k8s:true,sum:true,cmp:true};
var taasModels=[];
var displayCurrency='USD'; // current display currency code
var localCurrency='EUR';   // local currency for this location
var CC_MAP={CH:'CHF',US:'USD',GB:'GBP',CZ:'CZK',GR:'EUR',AU:'AUD',JP:'JPY',SA:'SAR',TR:'TRY',MX:'MXN',PH:'PHP',MY:'MYR',EG:'EGP',BG:'BGN',DE:'EUR',IE:'EUR',ZA:'MYR',NL:'EUR',SE:'EUR'};

/* ── Currency helper ── */
var CC_MAP={CH:'CHF',US:'USD',GB:'GBP',CZ:'CZK',GR:'EUR',AU:'AUD',JP:'JPY',SA:'SAR',TR:'TRY',MX:'MXN',PH:'PHP',MY:'MYR',EG:'EGP',BG:'BGN',DE:'EUR',IE:'EUR',ZA:'MYR',NL:'EUR',SE:'EUR'};

/* ── Currency helper ── */
function getCurrencyName(code){
  var names={USD:'US Dollar',CHF:'Swiss Franc',EUR:'Euro',GBP:'British Pound',CZK:'Czech Koruna',AUD:'Australian Dollar',JPY:'Japanese Yen',SAR:'Saudi Riyal',TRY:'Turkish Lira',MXN:'Mexican Peso',PHP:'Philippine Peso',MYR:'Malaysian Ringgit',EGP:'Egyptian Pound',BGN:'Bulgarian Lev'};
  return names[code]||code;
}

/* ── Get local currency for country ── */
function getLocalCurrency(countryCode){
  return CC_MAP[countryCode] || 'USD';
}

/* ── Default resource selection helpers ── */
function getDefaultStorageType(){
  // Get available storage types from pricing data
  var availableTypes = [];
  if(pricing.resource_types) {
    Object.keys(pricing.resource_types).forEach(function(resource) {
      if(resource.includes('nvme')) availableTypes.push(resource);
      else if(resource === 'dssd') availableTypes.push(resource);
    });
  }
  
  // Prefer NVMe if available, otherwise SSD
  var nvmeTypes = availableTypes.filter(function(t) { return t.includes('nvme'); });
  if(nvmeTypes.length > 0) return nvmeTypes[0];
  if(availableTypes.includes('dssd')) return 'dssd';
  return 'dssd'; // fallback
}

function flag(cc){if(!cc||cc.length!==2)return'';return String.fromCodePoint.apply(null,cc.toUpperCase().split('').map(function(c){return 0x1F1E6+c.charCodeAt(0)-65}))}
function $(id){return document.getElementById(id)}

/* ── UUID v4 generator ── */
function uuidv4(){
  return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)});
}
var opportunityId=uuidv4();

/* ── Currency-aware formatting ── */
function fmt(n){
  if(displayCurrency==='USD')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  var converted=n/FX[displayCurrency];
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(converted)+' '+displayCurrency;
}
function fmtUnit(n){
  if(n===0)return'FREE';
  if(displayCurrency==='USD')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:6}).format(n);
  var converted=n/FX[displayCurrency];
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:4,maximumFractionDigits:6}).format(converted)+' '+displayCurrency;
}

/* ── Resource definitions ── */
var KVM_DISK_TYPES=[{key:'dssd',label:'SSD'},{key:'nvme',label:'NVMe'},{key:'nvme_basic',label:'NVMe Basic'},{key:'nvme_standard',label:'NVMe Std'},{key:'nvme_fast',label:'NVMe Fast'},{key:'nvme_super_fast',label:'NVMe Super'},{key:'zadara',label:'HDD'}];
var VMW_DISK_TYPES=[{key:'dssd_vmware',label:'SSD (VMware)'},{key:'nvme_vmware',label:'NVMe (VMware)'}];
var GPU_TYPES=[{key:'gpu_nvidia_a100',label:'A100'},{key:'gpu_nvidia_l40s',label:'L40S'}];
var WIN_OS=[{key:'',label:'\u2014'},{key:'msft_6wc_00002',label:'Srv Std (2-core)'},{key:'msft_9ea_00039',label:'Srv Datacenter'}];
var SQL_LIC=[{key:'',label:'\u2014'},{key:'msft_7nq_00302',label:'SQL Std'},{key:'msft_7jq_00341',label:'SQL Ent'}];
var CPU_TYPES=[
  {key:'intel',cpuRes:'intel_cpu',memRes:'intel_mem',label:'Intel'},
  {key:'arm',cpuRes:'arm_cpu',memRes:'arm_mem',label:'ARM'},
  {key:'amd',cpuRes:'amd_cpu',memRes:'amd_mem',label:'AMD'}
];
var RES_INFO={
  cpu:'CPU cores. Billed per GHz/hour.',ram:'Memory. Billed per GB/hour.',
  disk:'Persistent block storage. Per GB/month.',localDisk:'Local NVMe. Ephemeral. Per GB/month.',
  backup:'Backup snapshots. Per GB/month.',ip:'Public IPv4. Monthly.',
  gpu:'GPU accelerator. Per GPU/hour.',winOs:'Windows Server license.',sqlLic:'SQL Server license.',rds:'RDS CALs.',
  obj_hdd:'HDD object storage. Per GB/month.',obj_nvme:'NVMe object storage. Per GB/month.',obj_caching:'S3 caching layer.',
  tx:'Outbound transfer. Per GB.',bandwidth:'Flat-rate bandwidth package.',vlan:'Private L2 network. Per VLAN/month.',
  cpuType:'CPU architecture.',hypervisor:'Hypervisor platform. KVM (default) or VMware where available.',
  paas_dyn:'Dynamic cloudlets scale automatically with load. Billed per cloudlet/hour. 1 cloudlet = 128 MB + 400 MHz.',
  paas_sta:'Static (reserved) cloudlets are always allocated. Lower price than dynamic. 1 cloudlet = 128 MB + 400 MHz.',
  paas_sto:'PaaS disk storage. Billed per GB/hour.',
  paas_tx:'External outbound traffic from PaaS environments. Per GB.',
  k8s_nodes:'Number of Kubernetes worker nodes.',
  k8s_vcpu:'vCPUs allocated per node.',
  k8s_ram:'RAM (GB) allocated per node.',
  k8s_storage:'Persistent volume storage shared across the cluster. Per GB/month.'
};

var LABELS={intel_cpu:'Intel CPU',intel_mem:'Intel RAM',arm_cpu:'ARM CPU',arm_mem:'ARM RAM',amd_cpu:'AMD CPU',amd_mem:'AMD RAM',cpu_vmware:'VMware CPU',mem_vmware:'VMware RAM',dssd:'SSD',nvme:'NVMe',nvme_basic:'NVMe Basic',nvme_standard:'NVMe Standard',nvme_fast:'NVMe Fast',nvme_super_fast:'NVMe Super Fast',zadara:'HDD',dssd_vmware:'SSD (VMware)',nvme_vmware:'NVMe (VMware)',local_nvme:'Local NVMe',backup:'Backup',ip:'Public IP',ip_vmware:'Public IP (VMware)',vlan:'VLAN',vlan_vmware:'VLAN (VMware)',tx:'Traffic',tx_vmware:'Traffic (VMware)',obj_hdd:'Object HDD',obj_nvme:'Object NVMe',obj_caching:'S3 Caching',obj_traffic:'Object Traffic',gpu_nvidia_a100:'GPU A100',gpu_nvidia_l40s:'GPU L40S',epc:'EPC Memory',msft_6wc_00002:'Win Srv Std',msft_9ea_00039:'Win Srv DC',msft_7nq_00302:'SQL Std',msft_7jq_00341:'SQL Enterprise',msft_tfa_00523:'RDS CAL',vrouter_basic_s:'vRouter Basic',vrouter_basic:'vRouter Basic',bandwidth_50:'Bandwidth 50 Mbps',bandwidth_100:'Bandwidth 100 Mbps',bandwidth_500:'Bandwidth 500 Mbps',bandwidth_1000:'Bandwidth 1 Gbps'};

/* ── Pricing helpers ── */
function csUnitPrice(resource,level){
  if(!pricing.objects)return 0;if(level===undefined)level=0;
  var currencies=[];pricing.objects.forEach(function(p){if(currencies.indexOf(p.currency)===-1)currencies.push(p.currency)});
  // Collect all non-zero prices converted to USD, pick the highest
  // This avoids placeholder prices (e.g. 0.0001 USD when real price is 555 CZK)
  var bestUsd=0;
  currencies.forEach(function(cur){
    var rate=FX[cur]||1;
    var prices=pricing.objects.filter(function(p){return p.resource===resource&&p.currency===cur&&p.level===level});
    if(prices.length){
      var usdVal=parseFloat(prices[0].price)*rate;
      if(usdVal>bestUsd)bestUsd=usdVal;
    }
  });
  return bestUsd;
}
function csSubPrice(r){return csUnitPrice(r,0);}
function csBurstPrice(r){var bl=burstLevels[r];if(bl===undefined)bl=1;return csUnitPrice(r,bl);}
function csSmartPrice(r){var s=csSubPrice(r);return s>0?s:csBurstPrice(r);}

function hasVMware(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  return avail.includes('cpu_vmware');
}
function getCpuFreq(){
  // Since CloudSigma API doesn't provide CPU frequency ranges,
  // we use reasonable defaults based on typical cloud offerings
  // These can be overridden by location-specific config if needed
  return pricing.cpu_frequency || {
    min: 1.0,   // Minimum 1.0 GHz (was 0.5)
    max: 4.0,   // Maximum 4.0 GHz (was 5.0) 
    default: 2.0 // Default 2.0 GHz
  };
}
function getCpuFreqDefault(){return getCpuFreq().default||2.0;}
function getAvailCpuTypes(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var t=[];CPU_TYPES.forEach(function(ct){if(avail.length===0||avail.includes(ct.cpuRes))t.push(ct);});
  if(!t.length)t.push(CPU_TYPES[0]);return t;
}
function cpuResForVm(vm){
  if(vm.hypervisor==='vmware')return'cpu_vmware';
  var c=CPU_TYPES.find(function(x){return x.key===vm.cpuType});return c?c.cpuRes:'intel_cpu';
}
function memResForVm(vm){
  if(vm.hypervisor==='vmware')return'mem_vmware';
  var c=CPU_TYPES.find(function(x){return x.key===vm.cpuType});return c?c.memRes:'intel_mem';
}
function ipResForVm(vm){return vm.hypervisor==='vmware'?'ip_vmware':'ip';}
function diskTypesForVm(vm){return vm.hypervisor==='vmware'?VMW_DISK_TYPES:KVM_DISK_TYPES;}

function infoBubble(k){var t=RES_INFO[k]||'';if(!t)return'';return'<span class="info-bubble">i<span class="tip">'+t+'</span></span>';}
function freeTag(r){if(!pricing.objects)return'';var bl=burstLevels[r];if(bl===0)return' <span class="vm-row-free">FREE burst</span>';return'';}
function priceCell(s,b,idS,idB){return'<div class="vm-row-prices"><div class="vm-row-price-sub" id="'+idS+'">'+fmt(s)+'</div><div class="vm-row-price-burst" id="'+idB+'">'+fmt(b)+'</div></div>';}
function burstOnlyCell(b,idB){return'<div class="vm-row-prices"><div class="vm-row-price-sub" style="color:var(--text-secondary);">\u2014</div><div class="vm-row-price-burst" id="'+idB+'">'+fmt(b)+'</div></div>';}

/* ── Init ── */
async function init(){
  // Set opportunity ID
  if($('quoteOpportunityId'))$('quoteOpportunityId').value=opportunityId;
  await loadLocations();
  renderVmTable();buildObjPanel();buildNetPanel();buildDpPanel();buildPaasPanel();buildOfPanel();buildK8sPanel();
  $('locationSelect').addEventListener('change',onLocationChange);
  $('currencySelect').addEventListener('change',onCurrencyChange);
  await onLocationChange();
  // Load TaaS models in background (non-blocking)
  loadTaasModels().then(function(){buildTaasPanel();renderResourceTable();});
}
async function loadLocations(){
  var res=await fetch('/api/locations');
  var data=await res.json();
  locations=data.objects;
  
  // Find NEXT (Sofia, Bulgaria) location and set it as default
  var nextLocation = locations.find(function(l){
    return l.api_endpoint.includes('next.cloudsigma.com');
  });
  
  var opts='';
  var defaultSelected = false;
  
  locations.forEach(function(l){
    var host=l.api_endpoint.replace('https://','').replace('/api/2.0/','');
    var isNext = l.api_endpoint.includes('next.cloudsigma.com');
    var selected = isNext ? ' selected' : '';
    if(isNext) defaultSelected = true;
    opts+='<option value="'+host+'" data-cc="'+l.country_code+'"'+selected+'>'+flag(l.country_code)+'  '+l.display_name+'</option>';
  });
  
  // If NEXT not found, select first location
  if(!defaultSelected && locations.length > 0) {
    opts = opts.replace('<option', '<option selected');
  }
  
  $('locationSelect').innerHTML=opts;
  if($('adminLocation'))$('adminLocation').innerHTML=opts;
}

function onCurrencyChange(){
  displayCurrency=$('currencySelect').value;
  renderResourceTable();renderVmTable();buildObjPanel();buildNetPanel();buildDpPanel();buildPaasPanel();buildOfPanel();buildTaasPanel();buildK8sPanel();recalc();
}

async function onLocationChange(){
  var host=$('locationSelect').value;var cc=$('locationSelect').selectedOptions[0].dataset.cc;
  currentLocation=locations.find(function(l){return l.api_endpoint.includes(host)});
  localCurrency=CC_MAP[cc]||'EUR';
  
  // Fetch pricing and competitors data
  var results=await Promise.all([fetch('/api/pricing/'+host),fetch('/api/competitors/'+cc)]);
  pricing=await results[0].json();competitors=await results[1].json();
  
  // Extract currencies from resource_types to maintain API order
  var allCurrencies = [];
  if(pricing.resource_types) {
    // Get currencies from first resource type to maintain API order
    var firstResource = Object.keys(pricing.resource_types)[0];
    if(firstResource && pricing.resource_types[firstResource].currencies) {
      allCurrencies = pricing.resource_types[firstResource].currencies;
    }
  }
  
  // Fallback to extracting from objects if resource_types not available
  if(allCurrencies.length === 0 && pricing.objects) {
    pricing.objects.forEach(function(obj) {
      if(allCurrencies.indexOf(obj.currency) === -1) {
        allCurrencies.push(obj.currency);
      }
    });
  }
  
  // Update currency selector with all available currencies
  var csel=$('currencySelect');
  var opts='';
  allCurrencies.forEach(function(cur){
    var label=cur+' ('+getCurrencyName(cur)+')';
    opts+='<option value="'+cur+'">'+label+'</option>';
  });
  csel.innerHTML=opts;
  
  // Set display currency - NEXT uses EUR, others use local currency
  var cc=$('locationSelect').selectedOptions[0].dataset.cc;
  var localCur = getLocalCurrency(cc);
  
  if(host.includes('next.cloudsigma.com')) {
    displayCurrency = 'EUR';
  } else if(allCurrencies.indexOf(localCur) !== -1) {
    // Use local currency if available
    displayCurrency = localCur;
  } else {
    // Fallback to first available currency
    displayCurrency = allCurrencies[0] || 'USD';
  }
  csel.value = displayCurrency;
  
  $('currencyInfo').textContent='Available currencies: ' + allCurrencies.join(', ');
  
  burstLevels=pricing.current||{};
  
  // Clamp cpuSpeed to location limits; reset to default if out of range
  var cf=getCpuFreq();
  vmLines.forEach(function(vm){
    if(vm.cpuSpeed<cf.min||vm.cpuSpeed>cf.max)vm.cpuSpeed=cf.default||2.0;
  });
  renderResourceTable();renderVmTable();buildObjPanel();buildNetPanel();buildDpPanel();buildPaasPanel();buildOfPanel();buildTaasPanel();buildK8sPanel();recalc();
}

/* ────── Resource price table (KVM / VMware / Object Storage / Licenses) ────── */
function renderResourceTable(){
  var el=$('resourcePriceTable');if(!el)return;
  if(!pricing.objects){el.innerHTML='';return;}
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var hasVmw=avail.includes('cpu_vmware');

  // Classify into top-level sections
  var VMW_RES=['cpu_vmware','mem_vmware','dssd_vmware','nvme_vmware','ip_vmware','tx_vmware','vlan_vmware'];
  var OBJ_RES=['obj_hdd','obj_nvme','obj_caching','obj_traffic'];
  var LIC_RES=['msft_6wc_00002','msft_9ea_00039','msft_7nq_00302','msft_7jq_00341','msft_tfa_00523'];

  var kvmRes=avail.filter(function(r){return VMW_RES.indexOf(r)===-1&&OBJ_RES.indexOf(r)===-1&&LIC_RES.indexOf(r)===-1;});
  var vmwRes=avail.filter(function(r){return VMW_RES.indexOf(r)>=0;});
  var objRes=avail.filter(function(r){return OBJ_RES.indexOf(r)>=0;});
  var licRes=avail.filter(function(r){return LIC_RES.indexOf(r)>=0;});

  function resRow(r){
    var label=LABELS[r]||r;
    var sub=csSubPrice(r),burst=csBurstPrice(r);
    var obj=pricing.objects.find(function(o){return o.resource===r});
    var unit=obj?obj.unit||'':'';
    return'<tr><td style="padding-left:1.5rem">'+label+'</td><td style="color:var(--text-secondary);font-size:.72rem">'+unit+'</td><td style="color:var(--green)">'+fmtUnit(sub)+'</td><td style="color:var(--orange)">'+fmtUnit(burst)+'</td></tr>';
  }
  function groupHeader(title){return'<tr><td colspan="4" style="padding:.5rem .5rem .2rem;font-weight:700;font-size:.78rem;color:var(--cs-green);border-bottom:2px solid var(--border-color)">'+title+'</td></tr>';}
  var resSid=0;
  function sectionHeader(title,startOpen){
    var sid='res_sec_'+(resSid++);
    var arrow=startOpen?'\u25BC':'\u25B6';
    return'</tbody><tbody><tr onclick="toggleResSection(\''+sid+'\')" style="cursor:pointer"><td colspan="4" style="padding:.8rem .5rem .3rem;font-weight:700;font-size:.9rem;color:var(--text);background:rgba(255,255,255,.03);border-bottom:2px solid var(--cs-green);user-select:none"><span id="arrow_'+sid+'" style="font-size:.7rem;margin-right:.4rem;color:var(--text-secondary)">'+arrow+'</span>'+title+'</td></tr></tbody><tbody id="'+sid+'" style="display:'+(startOpen?'':'none')+'">';
  }

  var kvmSubGroups=[
    {title:'\u26A1 Compute',match:function(r){return r.indexOf('cpu')>=0||r.indexOf('mem')>=0||r==='epc';}},
    {title:'\uD83D\uDCBE Storage',match:function(r){return r==='dssd'||r.indexOf('nvme')>=0||r==='zadara'||r==='local_nvme'||r==='backup';}},
    {title:'\uD83C\uDF10 Network',match:function(r){return r==='ip'||r==='vlan'||r==='tx'||r.indexOf('bandwidth')>=0||r.indexOf('vrouter')>=0;}},
    {title:'\uD83D\uDE80 GPU',match:function(r){return r.indexOf('gpu_')>=0;}},
  ];
  var vmwSubGroups=[
    {title:'\u26A1 Compute',match:function(r){return r.indexOf('cpu')>=0||r.indexOf('mem')>=0;}},
    {title:'\uD83D\uDCBE Storage',match:function(r){return r.indexOf('dssd')>=0||r.indexOf('nvme')>=0;}},
    {title:'\uD83C\uDF10 Network',match:function(r){return r.indexOf('ip')>=0||r.indexOf('vlan')>=0||r.indexOf('tx')>=0;}},
  ];

  function renderSubGrouped(resList,subGroupDefs){
    var h2='';var shown2=new Set();
    subGroupDefs.forEach(function(g){
      var items=resList.filter(function(r){return g.match(r)&&!shown2.has(r);});
      if(!items.length)return;
      h2+=groupHeader(g.title);
      items.sort().forEach(function(r){shown2.add(r);h2+=resRow(r);});
    });
    var rem=resList.filter(function(r){return!shown2.has(r);});
    if(rem.length){h2+=groupHeader('Other');rem.sort().forEach(function(r){h2+=resRow(r);});}
    return h2;
  }

  var h='<table class="res-price-table"><thead><tr><th>Resource</th><th>Unit</th><th style="color:var(--green)">Subscription</th><th style="color:var(--orange)">Burst</th></tr></thead><tbody>';

  // KVM section (open by default)
  if(kvmRes.length){h+=sectionHeader('\uD83D\uDDA5\uFE0F KVM',true);h+=renderSubGrouped(kvmRes,kvmSubGroups);}
  // VMware section
  if(hasVmw&&vmwRes.length){h+=sectionHeader('\u2601\uFE0F VMware',false);h+=renderSubGrouped(vmwRes,vmwSubGroups);}
  // Object Storage section
  if(objRes.length){h+=sectionHeader('\uD83D\uDDC4\uFE0F Object Storage',false);objRes.sort().forEach(function(r){h+=resRow(r);});}
  // Microsoft Licenses section
  if(licRes.length){h+=sectionHeader('\uD83E\uDE9F Microsoft Licenses',false);licRes.sort().forEach(function(r){h+=resRow(r);});}

  // PaaS section
  h+=sectionHeader('\u2601\uFE0F PaaS',false);
  h+=groupHeader('\u26A1 Cloudlets');
  h+='<tr><td style="padding-left:1.5rem">Dynamic Cloudlet</td><td style="color:var(--text-secondary);font-size:.72rem">cloudlet/h</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(PAAS_PRICE.dynamicCloudlet)+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">Static Cloudlet</td><td style="color:var(--text-secondary);font-size:.72rem">cloudlet/h</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(PAAS_PRICE.staticCloudlet)+'</td></tr>';
  h+=groupHeader('\uD83D\uDCBE Storage');
  h+='<tr><td style="padding-left:1.5rem">Disk Storage</td><td style="color:var(--text-secondary);font-size:.72rem">GB/h</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(PAAS_PRICE.storagePerGBh)+'</td></tr>';
  h+=groupHeader('\uD83C\uDF10 Network');
  h+='<tr><td style="padding-left:1.5rem">External Traffic</td><td style="color:var(--text-secondary);font-size:.72rem">per GB</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(PAAS_PRICE.trafficPerGB)+'</td></tr>';

  // Data Protection section
  h+=sectionHeader('🛡️ Data Protection',false);
  h+='<tr><td style="padding-left:1.5rem">Migration</td><td style="color:var(--text-secondary);font-size:.72rem">per unit/mo</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(dpEurToDisplay(DP_PRICE.migration))+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">Backup</td><td style="color:var(--text-secondary);font-size:.72rem">per unit/mo</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(dpEurToDisplay(DP_PRICE.backup))+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">Backup Capacity</td><td style="color:var(--text-secondary);font-size:.72rem">per GB/mo</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(dpEurToDisplay(DP_PRICE.backupCapacity))+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">DR</td><td style="color:var(--text-secondary);font-size:.72rem">per unit/mo</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(dpEurToDisplay(DP_PRICE.dr))+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">DR Capacity</td><td style="color:var(--text-secondary);font-size:.72rem">per GB/mo</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(dpEurToDisplay(DP_PRICE.drCapacity))+'</td></tr>';

  // Omnifabric section
  h+=sectionHeader('\uD83D\uDDC4\uFE0F Omnifabric',false);
  h+=groupHeader('\uD83D\uDCBB Compute Nodes');
  OF_PRICE.compute.forEach(function(c){
    h+='<tr><td style="padding-left:1.5rem">'+c.label+'</td><td style="color:var(--text-secondary);font-size:.72rem">per hour</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(c.priceHr)+'</td></tr>';
  });
  h+=groupHeader('\uD83D\uDCBE Storage');
  h+='<tr><td style="padding-left:1.5rem">Postpaid Storage</td><td style="color:var(--text-secondary);font-size:.72rem">GB/month</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(OF_PRICE.storagePerGBmo)+'</td></tr>';
  h+=groupHeader('\uD83C\uDF10 Network');
  h+='<tr><td style="padding-left:1.5rem">Network Traffic</td><td style="color:var(--text-secondary);font-size:.72rem">per GB</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(OF_PRICE.networkPerGB)+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">Obj Storage Input API</td><td style="color:var(--text-secondary);font-size:.72rem">per 10K req</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">Free</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">Obj Storage Output API</td><td style="color:var(--text-secondary);font-size:.72rem">per 10K req</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">Free</td></tr>';

  // TaaS section
  if(taasModels.length){
    h+=sectionHeader('\uD83E\uDD16 TaaS (AI Models)',false);
    var tGroups={};
    taasModels.forEach(function(m){var t=m.type||'other';if(!tGroups[t])tGroups[t]=[];tGroups[t].push(m);});
    var tOrder=['chat','embedding','rerank','audio','tts','speaker','audio-understanding'];
    var tSorted=tOrder.filter(function(t){return tGroups[t];});
    Object.keys(tGroups).forEach(function(t){if(tSorted.indexOf(t)===-1)tSorted.push(t);});
    // Column label row for TaaS (5 cols: Model, Supplier, Unit, Input, Output)
    h+='<tr><td></td><td style="font-size:.7rem;font-weight:700;color:var(--text-secondary)">Supplier</td><td></td><td style="font-size:.7rem;font-weight:700;color:var(--green);text-align:center">Input</td><td style="font-size:.7rem;font-weight:700;color:var(--orange);text-align:center">Output</td></tr>';
    tSorted.forEach(function(type){
      var label=TAAS_TYPE_LABELS[type]||type;
      h+='<tr><td colspan="5" style="padding:.5rem .5rem .2rem;font-weight:700;font-size:.78rem;color:var(--cs-green);border-bottom:2px solid var(--border-color)">'+label+'</td></tr>';
      tGroups[type].sort(function(a,b){return a.id.localeCompare(b.id);}).forEach(function(m){
        var p=m.pricing||{};
        var hasPricing=p.input!=null;
        var inp=hasPricing?fmtUnit(p.input):'Free';
        var out=hasPricing?fmtUnit(p.output):'Free';
        var priceColor=hasPricing?'':'color:var(--cs-green);font-weight:600';
        var caps=[];
        if(m.capabilities){if(m.capabilities.vision)caps.push('\uD83D\uDC41\uFE0F');if(m.capabilities.thinking||m.capabilities.reasoning)caps.push('\uD83E\uDDE0');}
        var capStr=caps.length?' '+caps.join(' '):'';
        var suppliers=(TAAS_SUPPLIER[m.id]||['—']).join(', ');
        h+='<tr><td style="padding-left:1.5rem">'+m.id+capStr+'</td><td style="color:var(--text-secondary);font-size:.72rem">'+suppliers+'</td><td style="color:var(--text-secondary);font-size:.72rem">per 1M tokens</td><td style="'+(hasPricing?'color:var(--green)':priceColor)+'">'+inp+'</td><td style="'+(hasPricing?'color:var(--orange)':priceColor)+'">'+out+'</td></tr>';
      });
    });
  }

  // Kubernetes section
  h+=sectionHeader('\u2388\uFE0F Kubernetes',false);
  h+=groupHeader('\u26A1 Compute (per Node)');
  h+='<tr><td style="padding-left:1.5rem">vCPU</td><td style="color:var(--text-secondary);font-size:.72rem">vCPU/hour</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(K8S_VCPU_PRICE_HR)+'</td></tr>';
  h+='<tr><td style="padding-left:1.5rem">RAM</td><td style="color:var(--text-secondary);font-size:.72rem">GB/hour</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(K8S_RAM_PRICE_HR)+'</td></tr>';
  h+=groupHeader('\uD83D\uDCBE Storage');
  h+='<tr><td style="padding-left:1.5rem">Persistent Volume</td><td style="color:var(--text-secondary);font-size:.72rem">GB/month</td><td style="color:var(--text-secondary)">\u2014</td><td style="color:var(--orange)">'+fmtUnit(K8S_STORAGE_PRICE_MO)+'</td></tr>';

  h+='</tbody></table>';
  el.innerHTML=h;
}
window.toggleResSection=function(sid){
  var body=document.getElementById(sid);
  var arrow=document.getElementById('arrow_'+sid);
  if(!body)return;
  var open=body.style.display!=='none';
  body.style.display=open?'none':'';
  if(arrow)arrow.textContent=open?'\u25B6':'\u25BC';
};

/* ── Collapsible ── */
function toggleSection(key){
  collapsed[key]=!collapsed[key];
  var body=$('section-body-'+key),arrow=$('section-arrow-'+key);
  if(body)body.style.display=collapsed[key]?'none':'block';
  if(arrow)arrow.textContent=collapsed[key]?'\u25B6':'\u25BC';
}
window.toggleSection=toggleSection;

/* ── Breakdown key → section mapping ── */
var BREAKDOWN_SECTION={
  '\u26A1 Compute & Storage':'vm','\uD83D\uDCBE Backup':'vm',
  '\uD83C\uDF10 IPs':'vm','\uD83D\uDE80 GPU':'vm',
  '\uD83E\uDE9F Microsoft Licenses':'vm',
  '\uD83D\uDDC4\uFE0F Object Storage':'obj','\uD83C\uDF10 Network':'net',
  '🛡️ Data Protection':'dp',
  '\u2601\uFE0F PaaS':'paas','\uD83D\uDDC4\uFE0F Omnifabric':'of','\uD83E\uDD16 TaaS':'taas',
  '\u2388\uFE0F Kubernetes':'k8s'
};
function scrollToSection(key){
  // In the sidebar layout, navigate to the page for the key
  if(typeof navTo==='function'){
    // Map cfg sub-keys to their own pages; cfg itself goes to vm
    var pageKey=(key==='cfg')?'vm':key;
    navTo(pageKey);
    // Scroll the page to top
    var main=document.getElementById('main-content');
    if(main)main.scrollTop=0;
    window.scrollTo(0,0);
    return;
  }
  // Fallback: legacy collapsed section behaviour
  var parentKey=null;
  if(['vm','obj','net','dp','paas','of','taas','k8s'].includes(key)){parentKey='cfg';}
  if(parentKey&&collapsed[parentKey]){toggleSection(parentKey);}
  if(collapsed[key]){toggleSection(key);}
  var el=$('section-body-'+key);
  if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
}
window.scrollToSection=scrollToSection;

/* ── Clear a resource group ── */
function clearResourceGroup(bdKey){
  var sec=BREAKDOWN_SECTION[bdKey];
  if(!sec)return;
  if(sec==='vm'){
    vmLines=[{id:1,qty:1,name:'VM 1',cpu:0,cpuSpeed:2,ram:0,cpuType:'intel',hypervisor:'kvm',disks:[{type:'dssd',size:0}],localDisk:0,backup:0,gpu:0,gpuType:'gpu_nvidia_a100',ip:0,winOs:'',winOsQty:0,sqlLic:'',sqlLicQty:0,rdsQty:0}];
    nextVmId=2;renderVmTable();
  }else if(sec==='obj'){
    ['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){var s=$('sl_'+k);if(s)s.value=0;});
    buildObjPanel();
  }else if(sec==='net'){
    var sl=$('sl_tx');if(sl)sl.value=0;
    var qt=$('qty_tx');if(qt)qt.value=1;
    var bw=$('sl_bandwidth');if(bw)bw.value='';
    var vl=$('sl_vlan');if(vl)vl.value=0;
  }else if(sec==='paas'){
    ['paas_dyn_cld','paas_sta_cld','paas_storage','paas_traffic'].forEach(function(id){var e=$(id);if(e)e.value=0;});
  }else if(sec==='of'){
    ofInstances=[];buildOfPanel();
  }else if(sec==='taas'){
    var tel=$('panel-taas');
    if(tel)tel.querySelectorAll('.taas-usage').forEach(function(inp){inp.value=0;});
    if(typeof updateTaas==='function')updateTaas();
  }else if(sec==='k8s'){
    k8sState={nodes:0,vcpu:4,ram:8,storageGB:0};buildK8sPanel();
  }
  recalc();
}
window.clearResourceGroup=clearResourceGroup;
function confirmClearGroup(el){
  var key=el.getAttribute('data-key');
  if(key&&confirm('Remove '+key+'?'))clearResourceGroup(key);
}
window.confirmClearGroup=confirmClearGroup;

/* ────── VM ────── */
function renderVmTable(){
  var p=$('panel-vm');
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var availCpu=getAvailCpuTypes();
  var hasVmw=hasVMware();

  function makeOpts(arr,sel,filter){return arr.map(function(d){var ok=!filter||d.key===''||avail.length===0||avail.includes(d.key);return'<option value="'+d.key+'"'+(d.key===sel?' selected':'')+(ok?'':' disabled style="color:#555"')+'>'+d.label+(ok?'':' \u2716')+'</option>'}).join('')}
  var hasLocal=avail.length===0||avail.includes('local_nvme');

  var h='';
  vmLines.forEach(function(vm,i){
    if(!vm.disks)vm.disks=[{type:'dssd',size:100}];
    if(!vm.cpuType)vm.cpuType='intel';
    if(!vm.hypervisor)vm.hypervisor='kvm';
    if(!vm.name)vm.name='VM '+(i+1);
    if(!hasVmw&&vm.hypervisor==='vmware')vm.hypervisor='kvm';
    if(!availCpu.find(function(c){return c.key===vm.cpuType}))vm.cpuType=availCpu[0].key;
    // Fix disk types on hypervisor change
    var validDisks=diskTypesForVm(vm);
    vm.disks.forEach(function(d){if(!validDisks.find(function(dt){return dt.key===d.type}))d.type=validDisks[0].key;});

    var q=vm.qty||1,cpuR=cpuResForVm(vm),memR=memResForVm(vm),ipR=ipResForVm(vm);
    var hasGpu=vm.hypervisor==='kvm'&&(avail.length===0||GPU_TYPES.some(function(g){return avail.includes(g.key)}));
    var curDiskTypes=diskTypesForVm(vm);

    h+='<div class="vm-block" data-vmid="'+vm.id+'">';
    h+='<div class="vm-block-header">';
    h+='<input type="text" data-f="name" value="'+vm.name.replace(/"/g,'&quot;')+'" style="background:transparent;border:1px solid var(--border-color);border-radius:4px;color:var(--cs-green);font-weight:700;font-size:.9rem;padding:.2rem .4rem;width:180px">';
    h+='<span style="margin-left:auto;display:flex;align-items:center;gap:.5rem">';
    h+='<label style="margin:0;font-size:.8rem;color:var(--text-secondary)">Qty</label>';
    h+='<input type="number" data-f="qty" value="'+vm.qty+'" min="1" max="100" style="width:55px">';
    if(vmLines.length>1)h+='<button class="btn-rm" data-vmid="'+vm.id+'">\u2715</button>';
    h+='</span></div>';

    // Hypervisor
    if(hasVmw){
      h+='<div class="vm-row"><div class="vm-row-label">Hypervisor '+infoBubble('hypervisor')+'</div>';
      h+='<div class="vm-row-input"><select data-f="hypervisor">';
      h+='<option value="kvm"'+(vm.hypervisor==='kvm'?' selected':'')+'>KVM</option>';
      h+='<option value="vmware"'+(vm.hypervisor==='vmware'?' selected':'')+'>VMware</option>';
      h+='</select></div><div class="vm-row-prices"></div></div>';
    }

    // CPU Type (KVM only, multi-arch)
    if(vm.hypervisor==='kvm'&&availCpu.length>1){
      h+='<div class="vm-row"><div class="vm-row-label">CPU Type '+infoBubble('cpuType')+'</div>';
      h+='<div class="vm-row-input"><select data-f="cpuType">';
      availCpu.forEach(function(ct){h+='<option value="'+ct.key+'"'+(ct.key===vm.cpuType?' selected':'')+'>'+ct.label+'</option>';});
      h+='</select></div><div class="vm-row-prices"></div></div>';
    }

    // CPU
    h+='<div class="vm-row"><div class="vm-row-label">vCPU '+infoBubble('cpu')+freeTag(cpuR)+'</div>';
    var cf=getCpuFreq();
    h+='<div class="vm-row-input"><input type="number" data-f="cpu" value="'+vm.cpu+'" min="0" max="128"> <span class="vm-row-unit">cores</span> <span class="vm-row-unit" style="margin-left:.5rem">&times;</span> <input type="number" data-f="cpuSpeed" value="'+vm.cpuSpeed+'" min="'+cf.min+'" max="'+cf.max+'" step="0.1" style="width:60px"> <span class="vm-row-unit">GHz <span style="font-size:.65rem;color:var(--text-secondary)">('+cf.min+'–'+cf.max+')</span></span></div>';
    h+=priceCell(vm.cpu*(vm.cpuSpeed||2)*csSubPrice(cpuR)*730*q,vm.cpu*(vm.cpuSpeed||2)*csBurstPrice(cpuR)*730*q,'ps_cpu_'+vm.id,'pb_cpu_'+vm.id)+'</div>';

    // RAM
    h+='<div class="vm-row"><div class="vm-row-label">RAM '+infoBubble('ram')+freeTag(memR)+'</div>';
    h+='<div class="vm-row-input"><input type="number" data-f="ram" value="'+vm.ram+'" min="1" max="512"> <span class="vm-row-unit">GB</span></div>';
    h+=priceCell(vm.ram*csSubPrice(memR)*730*q,vm.ram*csBurstPrice(memR)*730*q,'ps_ram_'+vm.id,'pb_ram_'+vm.id)+'</div>';

    // Primary Disk
    var d0=vm.disks[0];
    h+='<div class="vm-row"><div class="vm-row-label">Primary Disk '+infoBubble('disk')+freeTag(d0.type)+'</div>';
    h+='<div class="vm-row-input"><input type="number" data-f="disk0size" value="'+d0.size+'" min="0" max="10000" step="10"> <span class="vm-row-unit">GB</span> <select data-f="disk0type">'+makeOpts(curDiskTypes,d0.type,true)+'</select></div>';
    h+=priceCell(d0.size*csSubPrice(d0.type)*q,d0.size*csBurstPrice(d0.type)*q,'ps_disk0_'+vm.id,'pb_disk0_'+vm.id)+'</div>';

    // Extra disks
    for(var j=1;j<vm.disks.length;j++){
      var dj=vm.disks[j];
      h+='<div class="vm-row"><div class="vm-row-label">Disk '+(j+1)+'</div>';
      h+='<div class="vm-row-input"><input type="number" data-disk="'+j+'" data-df="size" value="'+dj.size+'" min="0" max="10000" step="10"> <span class="vm-row-unit">GB</span> <select data-disk="'+j+'" data-df="type">'+makeOpts(curDiskTypes,dj.type,true)+'</select> <button class="btn-disk-rm" data-diskidx="'+j+'">\u2212</button></div>';
      h+=priceCell(dj.size*csSubPrice(dj.type)*q,dj.size*csBurstPrice(dj.type)*q,'ps_disk'+j+'_'+vm.id,'pb_disk'+j+'_'+vm.id)+'</div>';
    }
    h+='<div style="padding:.3rem 0 .5rem 150px"><button class="btn-disk-add" data-vmid="'+vm.id+'">+ Add Disk</button></div>';

    // Local NVMe (KVM only)
    if(vm.hypervisor==='kvm'){
      h+='<div class="vm-row'+(hasLocal?'':' vm-row-disabled')+'"><div class="vm-row-label">Local NVMe '+infoBubble('localDisk')+freeTag('local_nvme')+'</div>';
      h+='<div class="vm-row-input"><input type="number" data-f="localDisk" value="'+vm.localDisk+'" min="0" max="10000" step="10"'+(hasLocal?'':' disabled')+'> <span class="vm-row-unit">GB</span></div>';
      h+=priceCell(vm.localDisk*csSubPrice('local_nvme')*q,vm.localDisk*csBurstPrice('local_nvme')*q,'ps_local_'+vm.id,'pb_local_'+vm.id)+'</div>';
    }

    // Backup
    h+='<div class="vm-row"><div class="vm-row-label">Backup '+infoBubble('backup')+freeTag('backup')+'</div>';
    h+='<div class="vm-row-input"><input type="number" data-f="backup" value="'+vm.backup+'" min="0" max="10000" step="10"> <span class="vm-row-unit">GB</span></div>';
    h+=priceCell(vm.backup*csSubPrice('backup')*q,vm.backup*csBurstPrice('backup')*q,'ps_backup_'+vm.id,'pb_backup_'+vm.id)+'</div>';

    // IPs
    h+='<div class="vm-row"><div class="vm-row-label">Public IPs '+infoBubble('ip')+freeTag(ipR)+'</div>';
    h+='<div class="vm-row-input"><input type="number" data-f="ip" value="'+vm.ip+'" min="0" max="20"></div>';
    h+=priceCell(vm.ip*csSubPrice(ipR)*q,vm.ip*csBurstPrice(ipR)*q,'ps_ip_'+vm.id,'pb_ip_'+vm.id)+'</div>';

    // GPU (KVM only)
    if(vm.hypervisor==='kvm'){
      h+='<div class="vm-row'+(hasGpu?'':' vm-row-disabled')+'"><div class="vm-row-label">GPU '+infoBubble('gpu')+freeTag(vm.gpuType)+'</div>';
      h+='<div class="vm-row-input"><input type="number" data-f="gpu" value="'+vm.gpu+'" min="0" max="8"'+(hasGpu?'':' disabled')+'> <select data-f="gpuType"'+(hasGpu?'':' disabled')+'>'+makeOpts(GPU_TYPES,vm.gpuType,true)+'</select></div>';
      h+=priceCell(vm.gpu>0?vm.gpu*csSubPrice(vm.gpuType)*730*q:0,vm.gpu>0?vm.gpu*csBurstPrice(vm.gpuType)*730*q:0,'ps_gpu_'+vm.id,'pb_gpu_'+vm.id)+'</div>';
    }

    // Windows
    h+='<div class="vm-row"><div class="vm-row-label">Windows OS '+infoBubble('winOs')+'</div>';
    h+='<div class="vm-row-input"><select data-f="winOs">'+makeOpts(WIN_OS,vm.winOs,true)+'</select> <span class="vm-row-unit">Qty</span> <input type="number" data-f="winOsQty" value="'+vm.winOsQty+'" min="0" max="100" style="width:55px"></div>';
    var wS=(vm.winOs&&vm.winOsQty>0)?vm.winOsQty*csSubPrice(vm.winOs)*q:0;
    var wB=(vm.winOs&&vm.winOsQty>0)?vm.winOsQty*csBurstPrice(vm.winOs)*q:0;
    h+=priceCell(wS,wB,'ps_winos_'+vm.id,'pb_winos_'+vm.id)+'</div>';

    // SQL
    h+='<div class="vm-row"><div class="vm-row-label">SQL License '+infoBubble('sqlLic')+'</div>';
    h+='<div class="vm-row-input"><select data-f="sqlLic">'+makeOpts(SQL_LIC,vm.sqlLic,true)+'</select> <span class="vm-row-unit">Qty</span> <input type="number" data-f="sqlLicQty" value="'+vm.sqlLicQty+'" min="0" max="100" style="width:55px"></div>';
    var sS=(vm.sqlLic&&vm.sqlLicQty>0)?vm.sqlLicQty*csSubPrice(vm.sqlLic)*q:0;
    var sB=(vm.sqlLic&&vm.sqlLicQty>0)?vm.sqlLicQty*csBurstPrice(vm.sqlLic)*q:0;
    h+=priceCell(sS,sB,'ps_sql_'+vm.id,'pb_sql_'+vm.id)+'</div>';

    // RDS
    h+='<div class="vm-row"><div class="vm-row-label">RDS CALs '+infoBubble('rds')+'</div>';
    h+='<div class="vm-row-input"><input type="number" data-f="rdsQty" value="'+vm.rdsQty+'" min="0" max="200"></div>';
    h+=priceCell(vm.rdsQty>0?vm.rdsQty*csSubPrice('msft_tfa_00523')*q:0,vm.rdsQty>0?vm.rdsQty*csBurstPrice('msft_tfa_00523')*q:0,'ps_rds_'+vm.id,'pb_rds_'+vm.id)+'</div>';

    h+='</div>';
  });
  h+='<button class="btn-add" id="addVmBtn">+ Add VM</button>';
  p.innerHTML=h;

  vmLines.forEach(function(vm){
    var block=p.querySelector('.vm-block[data-vmid="'+vm.id+'"]');if(!block)return;
    block.querySelectorAll('[data-f]').forEach(function(el){
      function handler(){
        if(el.dataset.f==='disk0size'){vm.disks[0].size=parseInt(el.value)||0;}
        else if(el.dataset.f==='disk0type'){vm.disks[0].type=el.value;}
        else if(el.dataset.f==='cpuType'){vm.cpuType=el.value;renderVmTable();recalc();return;}
        else if(el.dataset.f==='hypervisor'){
          vm.hypervisor=el.value;
          // Reset disk types to match new hypervisor
          var dt=diskTypesForVm(vm);vm.disks.forEach(function(d){if(!dt.find(function(x){return x.key===d.type}))d.type=dt[0].key;});
          if(vm.hypervisor==='vmware'){vm.gpu=0;vm.localDisk=0;}
          renderVmTable();recalc();return;
        }
        else if(el.dataset.f==='gpuType'){vm.gpuType=el.value;recalc();updateVmPrices(vm);return;}
        else if(el.dataset.f==='name'){vm.name=el.value;return;}
        else if(el.type==='number'){vm[el.dataset.f]=parseFloat(el.value)||0;}
        else{vm[el.dataset.f]=el.value;}
        if(el.dataset.f==='cpu'||el.dataset.f==='winOs'){
          if(vm.winOs==='msft_6wc_00002'||vm.winOs==='msft_9ea_00039'){vm.winOsQty=vm.cpu;var q=block.querySelector('[data-f="winOsQty"]');if(q)q.value=vm.cpu;}
          else if(vm.winOs===''){vm.winOsQty=0;var q2=block.querySelector('[data-f="winOsQty"]');if(q2)q2.value=0;}
        }
        recalc();updateVmPrices(vm);
      }
      el.addEventListener('change',handler);if(el.type==='number'||el.type==='text')el.addEventListener('input',handler);
    });
    block.querySelectorAll('[data-disk]').forEach(function(el){
      function handler(){var idx=parseInt(el.dataset.disk);if(!vm.disks[idx])return;if(el.dataset.df==='size')vm.disks[idx].size=parseInt(el.value)||0;else if(el.dataset.df==='type')vm.disks[idx].type=el.value;recalc();updateVmPrices(vm);}
      el.addEventListener('change',handler);if(el.type==='number')el.addEventListener('input',handler);
    });
    var adb=block.querySelector('.btn-disk-add');if(adb)adb.addEventListener('click',function(){var dt=diskTypesForVm(vm);vm.disks.push({type:dt[0].key,size:50});renderVmTable();recalc();});
    block.querySelectorAll('.btn-disk-rm').forEach(function(b){b.addEventListener('click',function(){vm.disks.splice(parseInt(b.dataset.diskidx),1);renderVmTable();recalc();});});
    var rmb=block.querySelector('.btn-rm');if(rmb)rmb.addEventListener('click',function(){vmLines=vmLines.filter(function(v){return v.id!==vm.id});renderVmTable();recalc();});
  });
  $('addVmBtn').addEventListener('click',function(){
    vmLines.push({id:nextVmId++,qty:1,name:'VM '+nextVmId,cpu:0,cpuSpeed:getCpuFreqDefault(),ram:0,cpuType:getAvailCpuTypes()[0].key,hypervisor:'kvm',disks:[{type:'dssd',size:0}],localDisk:0,backup:0,gpu:0,gpuType:'gpu_nvidia_a100',ip:0,winOs:'',winOsQty:0,sqlLic:'',sqlLicQty:0,rdsQty:0});
    renderVmTable();recalc();
  });
}

function updateVmPrices(vm){
  var q=vm.qty||1,cpuR=cpuResForVm(vm),memR=memResForVm(vm),ipR=ipResForVm(vm);
  function s(id,v){var e=$(id);if(e)e.textContent=fmt(v);}
  s('ps_cpu_'+vm.id,vm.cpu*(vm.cpuSpeed||2)*csSubPrice(cpuR)*730*q);s('pb_cpu_'+vm.id,vm.cpu*(vm.cpuSpeed||2)*csBurstPrice(cpuR)*730*q);
  s('ps_ram_'+vm.id,vm.ram*csSubPrice(memR)*730*q);s('pb_ram_'+vm.id,vm.ram*csBurstPrice(memR)*730*q);
  if(vm.disks[0]){s('ps_disk0_'+vm.id,vm.disks[0].size*csSubPrice(vm.disks[0].type)*q);s('pb_disk0_'+vm.id,vm.disks[0].size*csBurstPrice(vm.disks[0].type)*q);}
  for(var j=1;j<vm.disks.length;j++){s('ps_disk'+j+'_'+vm.id,vm.disks[j].size*csSubPrice(vm.disks[j].type)*q);s('pb_disk'+j+'_'+vm.id,vm.disks[j].size*csBurstPrice(vm.disks[j].type)*q);}
  s('ps_local_'+vm.id,vm.localDisk*csSubPrice('local_nvme')*q);s('pb_local_'+vm.id,vm.localDisk*csBurstPrice('local_nvme')*q);
  s('ps_backup_'+vm.id,vm.backup*csSubPrice('backup')*q);s('pb_backup_'+vm.id,vm.backup*csBurstPrice('backup')*q);
  s('ps_ip_'+vm.id,vm.ip*csSubPrice(ipR)*q);s('pb_ip_'+vm.id,vm.ip*csBurstPrice(ipR)*q);
  s('ps_gpu_'+vm.id,vm.gpu>0?vm.gpu*csSubPrice(vm.gpuType)*730*q:0);s('pb_gpu_'+vm.id,vm.gpu>0?vm.gpu*csBurstPrice(vm.gpuType)*730*q:0);
  s('ps_winos_'+vm.id,vm.winOs&&vm.winOsQty>0?vm.winOsQty*csSubPrice(vm.winOs)*q:0);s('pb_winos_'+vm.id,vm.winOs&&vm.winOsQty>0?vm.winOsQty*csBurstPrice(vm.winOs)*q:0);
  s('ps_sql_'+vm.id,vm.sqlLic&&vm.sqlLicQty>0?vm.sqlLicQty*csSubPrice(vm.sqlLic)*q:0);s('pb_sql_'+vm.id,vm.sqlLic&&vm.sqlLicQty>0?vm.sqlLicQty*csBurstPrice(vm.sqlLic)*q:0);
  s('ps_rds_'+vm.id,vm.rdsQty>0?vm.rdsQty*csSubPrice('msft_tfa_00523')*q:0);s('pb_rds_'+vm.id,vm.rdsQty>0?vm.rdsQty*csBurstPrice('msft_tfa_00523')*q:0);
}

/* ────── Object Storage ────── */
function buildObjPanel(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var items=[{key:'obj_hdd',label:'HDD Object Storage'},{key:'obj_nvme',label:'NVMe Object Storage'},{key:'obj_caching',label:'S3 Caching'}];
  var el=$('panel-objstorage');var h='';
  items.forEach(function(r){
    var ok=avail.includes(r.key);
    var curVal=objStorageState[r.key]||0;
    var subMo=curVal*csSubPrice(r.key),burstMo=curVal*csBurstPrice(r.key);
    h+='<div class="vm-row'+(ok?'':' vm-row-disabled')+'"><div class="vm-row-label">'+r.label+' '+infoBubble(r.key)+freeTag(r.key)+'</div>';
    h+='<div class="vm-row-input"><input type="number" id="sl_'+r.key+'" min="0" max="50000" step="100" value="'+curVal+'"'+(ok?'':' disabled')+'> <span class="vm-row-unit">GB/mo</span></div>';
    h+=priceCell(subMo,burstMo,'ps_'+r.key,'pb_'+r.key)+'</div>';
  });
  el.innerHTML=h;
  items.forEach(function(r){
    if(!avail.includes(r.key))return;
    var inp=$('sl_'+r.key);
    function update(){var v=parseInt(inp.value)||0;objStorageState[r.key]=v;var e1=$('ps_'+r.key),e2=$('pb_'+r.key);if(e1)e1.textContent=fmt(v*csSubPrice(r.key));if(e2)e2.textContent=fmt(v*csBurstPrice(r.key));recalc();}
    inp.addEventListener('input',update);inp.addEventListener('change',update);
  });
}

/* ────── Network ────── */
function buildNetPanel(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var el=$('panel-network');var h='';
  var txOk=avail.includes('tx');
  h+='<div class="vm-row'+(txOk?'':' vm-row-disabled')+'"><div class="vm-row-label">Traffic '+infoBubble('tx')+freeTag('tx')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="sl_tx" min="0" max="100000" step="100" value="'+netState.tx+'"'+(txOk?'':' disabled')+'> <span class="vm-row-unit">GB/mo</span>';
  h+=' &times; <input type="number" id="qty_tx" value="'+netState.txQty+'" min="1" max="100"'+(txOk?'':' disabled')+' style="width:55px"></div>';
  h+=priceCell(netState.tx*netState.txQty*csSubPrice('tx'),netState.tx*netState.txQty*csBurstPrice('tx'),'ps_net_tx','pb_net_tx')+'</div>';

  var bwKeys=avail.filter(function(k){return k.indexOf('bandwidth_')===0;}).sort(function(a,b){return(parseInt(a.split('_')[1])||0)-(parseInt(b.split('_')[1])||0);});
  h+='<div class="vm-row'+(bwKeys.length?'':' vm-row-disabled')+'"><div class="vm-row-label">Bandwidth '+infoBubble('bandwidth')+'</div>';
  h+='<div class="vm-row-input"><select id="sl_bandwidth"'+(bwKeys.length?'':' disabled')+'><option value="">None</option>';
  bwKeys.forEach(function(k){var s=k.replace('bandwidth_','');var label=parseInt(s)>=1000?(parseInt(s)/1000)+' Gbps':s+' Mbps';h+='<option value="'+k+'"'+(k===netState.bandwidth?' selected':'')+'>'+label+'</option>';});
  h+='</select></div>';
  var bwSub=netState.bandwidth?csSubPrice(netState.bandwidth):0,bwBurst=netState.bandwidth?csBurstPrice(netState.bandwidth):0;
  h+=priceCell(bwSub,bwBurst,'ps_net_bandwidth','pb_net_bandwidth')+'</div>';

  var vlanOk=avail.includes('vlan');
  h+='<div class="vm-row'+(vlanOk?'':' vm-row-disabled')+'"><div class="vm-row-label">VLAN '+infoBubble('vlan')+freeTag('vlan')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="sl_vlan" min="0" max="10" step="1" value="'+netState.vlan+'"'+(vlanOk?'':' disabled')+'> <span class="vm-row-unit">VLANs</span></div>';
  h+=priceCell(netState.vlan*csSubPrice('vlan'),netState.vlan*csBurstPrice('vlan'),'ps_net_vlan','pb_net_vlan')+'</div>';

  el.innerHTML=h;
  function updateNet(){
    netState.tx=parseInt($('sl_tx').value)||0;
    netState.txQty=parseInt($('qty_tx').value)||1;
    netState.bandwidth=$('sl_bandwidth').value;
    netState.vlan=parseInt($('sl_vlan').value)||0;
    var txV=netState.tx*netState.txQty;
    var e1=$('ps_net_tx'),e2=$('pb_net_tx');if(e1)e1.textContent=fmt(txV*csSubPrice('tx'));if(e2)e2.textContent=fmt(txV*csBurstPrice('tx'));
    var bwKey=netState.bandwidth;var bwS=bwKey?csSubPrice(bwKey):0,bwB=bwKey?csBurstPrice(bwKey):0;
    var e3=$('ps_net_bandwidth'),e4=$('pb_net_bandwidth');if(e3)e3.textContent=fmt(bwS);if(e4)e4.textContent=fmt(bwB);
    var vlV=netState.vlan;var e5=$('ps_net_vlan'),e6=$('pb_net_vlan');if(e5)e5.textContent=fmt(vlV*csSubPrice('vlan'));if(e6)e6.textContent=fmt(vlV*csBurstPrice('vlan'));
    recalc();
  }
  ['sl_tx','qty_tx','sl_bandwidth','sl_vlan'].forEach(function(id){var e=$(id);if(e){e.addEventListener('input',updateNet);e.addEventListener('change',updateNet);}});
}

/* ────── PaaS (Cloudlet-based) ────── */
/* ────── Data Protection ────── */
var DP_PRICE={
  migration: 100,    // EUR/mo per unit
  backup: 4,         // EUR/mo per unit
  backupCapacity: 0.04, // EUR/mo per GB
  dr: 12,            // EUR/mo per unit
  drCapacity: 0.04   // EUR/mo per GB
};
var DP_LABELS={migration:'Migration',backup:'Backup',backupCapacity:'Backup Capacity',dr:'DR',drCapacity:'DR Capacity'};
function dpEurToDisplay(eurVal){
  // Convert EUR to display currency
  if(displayCurrency==='EUR')return eurVal;
  var eurToUsd=1.08; // EUR->USD
  var usdVal=eurVal*eurToUsd;
  return usdVal/(FX[displayCurrency]||1);
}

// Sub-group header helper
function dpSubHeader(emoji,title,badge,badgeColor){
  return '<div style="display:flex;align-items:center;gap:.5rem;margin:1rem 0 .5rem;padding:.4rem .6rem;'
    +'background:var(--bg-input);border-radius:6px;border-left:3px solid '+(badgeColor||'var(--cs-green)')+';">'
    +'<span style="font-size:1rem">'+emoji+'</span>'
    +'<span style="font-weight:700;font-size:.85rem;color:var(--text-heading)">'+title+'</span>'
    +'<span style="margin-left:auto;font-size:.65rem;font-weight:700;padding:.1rem .45rem;border-radius:8px;'
    +'background:'+(badgeColor||'var(--cs-green)')+';color:#fff">'+badge+'</span>'
    +'</div>';
}

function buildDpPanel(){
  var el=$('panel-dp');if(!el)return;
  var h='';
  h+='<div style="margin-bottom:.75rem;font-size:.82rem;color:var(--text-secondary)">Prices in EUR, converted to display currency. Subgroups show applicable billing model.</div>';

  // ── Migration subgroup ────────────────────────────────────────────
  h+=dpSubHeader('🚚','Migration','Upfront (one-time)','var(--orange)');
  h+='<div class="vm-row"><div class="vm-row-label">Migration Units</div>';
  h+='<div class="vm-row-input"><input type="number" id="dp_migration" min="0" max="1000" value="'+dpState.migration+'"> <span class="vm-row-unit">units</span></div>';
  h+=priceCell(0,dpEurToDisplay(dpState.migration*DP_PRICE.migration),'pb_dp_mig_sub','pb_dp_mig_burst')+'</div>';

  // ── Backup subgroup ───────────────────────────────────────────────
  h+=dpSubHeader('💾','Backup','Subscription only','var(--blue)');
  h+='<div class="vm-row"><div class="vm-row-label">Backup Units</div>';
  h+='<div class="vm-row-input"><input type="number" id="dp_backup" min="0" max="1000" value="'+dpState.backup+'"> <span class="vm-row-unit">units</span></div>';
  h+=priceCell(dpEurToDisplay(dpState.backup*DP_PRICE.backup),0,'pb_dp_bak_sub','pb_dp_bak_burst')+'</div>';

  h+='<div class="vm-row"><div class="vm-row-label">Backup Capacity</div>';
  h+='<div class="vm-row-input"><input type="number" id="dp_backupCapacity" min="0" max="100000" step="100" value="'+dpState.backupCapacity+'"> <span class="vm-row-unit">GB</span></div>';
  h+=priceCell(dpEurToDisplay(dpState.backupCapacity*DP_PRICE.backupCapacity),0,'pb_dp_bakCap_sub','pb_dp_bakCap_burst')+'</div>';

  // ── Disaster Recovery subgroup ────────────────────────────────────
  h+=dpSubHeader('🔁','Disaster Recovery','Subscription only','var(--cs-green)');
  h+='<div class="vm-row"><div class="vm-row-label">DR Units</div>';
  h+='<div class="vm-row-input"><input type="number" id="dp_dr" min="0" max="1000" value="'+dpState.dr+'"> <span class="vm-row-unit">units</span></div>';
  h+=priceCell(dpEurToDisplay(dpState.dr*DP_PRICE.dr),0,'pb_dp_dr_sub','pb_dp_dr_burst')+'</div>';

  h+='<div class="vm-row"><div class="vm-row-label">DR Capacity</div>';
  h+='<div class="vm-row-input"><input type="number" id="dp_drCapacity" min="0" max="100000" step="100" value="'+dpState.drCapacity+'"> <span class="vm-row-unit">GB</span></div>';
  h+=priceCell(dpEurToDisplay(dpState.drCapacity*DP_PRICE.drCapacity),0,'pb_dp_drCap_sub','pb_dp_drCap_burst')+'</div>';

  el.innerHTML=h;

  function updateDp(){
    dpState.migration=parseInt($('dp_migration').value)||0;
    dpState.backup=parseInt($('dp_backup').value)||0;
    dpState.backupCapacity=parseInt($('dp_backupCapacity').value)||0;
    dpState.dr=parseInt($('dp_dr').value)||0;
    dpState.drCapacity=parseInt($('dp_drCapacity').value)||0;
    function s(subId,burstId,subVal,burstVal){
      var se=$(subId);if(se)se.textContent=fmt(subVal);
      var be=$(burstId);if(be)be.textContent=fmt(burstVal);
    }
    // Migration = upfront → shown in burst column (orange)
    s('pb_dp_mig_sub','pb_dp_mig_burst',0,dpEurToDisplay(dpState.migration*DP_PRICE.migration));
    // Backup = subscription (monthly) → shown in sub column
    s('pb_dp_bak_sub','pb_dp_bak_burst',dpEurToDisplay(dpState.backup*DP_PRICE.backup),0);
    s('pb_dp_bakCap_sub','pb_dp_bakCap_burst',dpEurToDisplay(dpState.backupCapacity*DP_PRICE.backupCapacity),0);
    // DR = subscription (monthly) → shown in sub column
    s('pb_dp_dr_sub','pb_dp_dr_burst',dpEurToDisplay(dpState.dr*DP_PRICE.dr),0);
    s('pb_dp_drCap_sub','pb_dp_drCap_burst',dpEurToDisplay(dpState.drCapacity*DP_PRICE.drCapacity),0);
    recalc();
  }
  ['dp_migration','dp_backup','dp_backupCapacity','dp_dr','dp_drCapacity'].forEach(function(id){
    var e=$(id);if(e){e.addEventListener('input',updateDp);e.addEventListener('change',updateDp);}
  });
}

// Data Protection totals
function calcDpUpfront(){
  // Migration is upfront (one-time)
  return dpEurToDisplay(dpState.migration*DP_PRICE.migration);
}
function calcDpSubscription(){
  // Backup/DR/Capacity are subscription (monthly)
  return dpEurToDisplay(
    dpState.backup*DP_PRICE.backup +
    dpState.backupCapacity*DP_PRICE.backupCapacity +
    dpState.dr*DP_PRICE.dr +
    dpState.drCapacity*DP_PRICE.drCapacity
  );
}
function calcDp(){
  // Total DP = upfront + subscription
  return calcDpUpfront() + calcDpSubscription();
}

var PAAS_PRICE={
  dynamicCloudlet: 0.009293 * 1.12,   // CHF->USD per hour
  staticCloudlet:  0.006195 * 1.12,   // CHF->USD per hour
  storagePerGBh:   0.000278 * 1.12,   // CHF->USD per GB/hour
  trafficPerGB:    0.08 * 1.12,       // CHF->USD per GB
  cloudletRAM: 128,                   // MB per cloudlet
  cloudletCPU: 400                    // MHz per cloudlet
};

// Omnifabric (MatrixOne Intelligence) pricing - CloudSigma / region: next / Standard
var OF_PRICE={
  compute:[
    {label:'4 vCPU 16 GiB', cpu:4, ram:16, priceHr:1.00},
    {label:'8 vCPU 32 GiB', cpu:8, ram:32, priceHr:1.50},
    {label:'16 vCPU 64 GiB', cpu:16, ram:64, priceHr:2.00}
  ],
  storagePerGBmo: 0.25,
  networkPerGB: 0.25,
  objInPer10k: 0.00,
  objOutPer10k: 0.00
};

var ofInstances=[];
var ofNextId=1;
function addOfInstance(){
  ofInstances.push({id:ofNextId++,spec:0,qty:1,storageGB:0});
  buildOfPanel();
}
function removeOfInstance(id){
  ofInstances=ofInstances.filter(function(i){return i.id!==id;});
  buildOfPanel();
}
function calcOmnifabric(){
  var total=0;
  ofInstances.forEach(function(inst){
    var spec=OF_PRICE.compute[inst.spec]||OF_PRICE.compute[0];
    total+=spec.priceHr*730*inst.qty;
    total+=inst.storageGB*OF_PRICE.storagePerGBmo;
  });
  return total;
}
function buildOfPanel(){
  var el=$('ofPanel');if(!el)return;
  var h='';
  h+='<table class="res-price-table"><thead><tr><th>Instance</th><th>Spec</th><th>Qty</th><th>Storage (GB)</th><th style="color:var(--orange)">Burst/mo</th><th></th></tr></thead><tbody>';
  ofInstances.forEach(function(inst,idx){
    var spec=OF_PRICE.compute[inst.spec]||OF_PRICE.compute[0];
    var mo=spec.priceHr*730*inst.qty + inst.storageGB*OF_PRICE.storagePerGBmo;
    var opts='';
    OF_PRICE.compute.forEach(function(c,ci){
      opts+='<option value="'+ci+'"'+(ci===inst.spec?' selected':'')+'>'+c.label+' ($'+c.priceHr.toFixed(2)+'/hr)</option>';
    });
    h+='<tr>';
    h+='<td style="font-size:.82rem">Instance '+(idx+1)+'</td>';
    h+='<td><select onchange="ofInstances['+idx+'].spec=+this.value;buildOfPanel()" style="width:100%;padding:.25rem">'+opts+'</select></td>';
    h+='<td><input type="number" min="1" value="'+inst.qty+'" onchange="ofInstances['+idx+'].qty=+this.value||1;buildOfPanel()" style="width:60px"></td>';
    h+='<td><input type="number" min="0" value="'+inst.storageGB+'" onchange="ofInstances['+idx+'].storageGB=+this.value||0;buildOfPanel()" style="width:80px"></td>';
    h+='<td style="font-weight:600;color:var(--orange)">'+fmt(mo)+'</td>';
    h+='<td><button onclick="removeOfInstance('+inst.id+')" style="background:none;border:none;color:var(--red,#e74c3c);cursor:pointer;font-size:1rem">\u2716</button></td>';
    h+='</tr>';
  });
  h+='</tbody></table>';
  h+='<button onclick="addOfInstance()" style="margin-top:.5rem;padding:.3rem .8rem;font-size:.78rem;background:var(--cs-green);color:#fff;border:none;border-radius:4px;cursor:pointer">+ Add Instance</button>';
  var total=calcOmnifabric();
  h+='<div style="text-align:right;margin-top:.5rem;font-size:.9rem;font-weight:700;color:var(--orange)">Omnifabric Total (Burst): '+fmt(total)+'/mo</div>';
  el.innerHTML=h;
  recalc();
}

function buildPaasPanel(){
  var el=$('panel-paas');if(!el)return;
  var h='';
  h+='<div style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-secondary)">1 cloudlet = 128 MB RAM + 400 MHz CPU</div>';

  // Dynamic cloudlets (auto-scaling) — burst only
  h+='<div class="vm-row"><div class="vm-row-label">Dynamic Cloudlets '+infoBubble('paas_dyn')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_dyn_cld" min="0" max="256" value="0"> <span class="vm-row-unit">cloudlets</span></div>';
  h+=burstOnlyCell(0,'pb_paas_dyn')+'</div>';

  // Static cloudlets (reserved) — burst only
  h+='<div class="vm-row"><div class="vm-row-label">Static Cloudlets '+infoBubble('paas_sta')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_sta_cld" min="0" max="256" value="0"> <span class="vm-row-unit">cloudlets</span></div>';
  h+=burstOnlyCell(0,'pb_paas_sta')+'</div>';

  // Storage — burst only
  h+='<div class="vm-row"><div class="vm-row-label">Storage '+infoBubble('paas_sto')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_storage" min="0" max="10000" step="10" value="0"> <span class="vm-row-unit">GB</span></div>';
  h+=burstOnlyCell(0,'pb_paas_sto')+'</div>';

  // Traffic — burst only
  h+='<div class="vm-row"><div class="vm-row-label">External Traffic '+infoBubble('paas_tx')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_traffic" min="0" max="100000" step="100" value="0"> <span class="vm-row-unit">GB/mo</span></div>';
  h+=burstOnlyCell(0,'pb_paas_tx')+'</div>';

  // Summary line: total RAM & CPU from cloudlets
  h+='<div id="paas_summary" style="margin-top:.5rem;font-size:.75rem;color:var(--text-secondary)"></div>';

  el.innerHTML=h;

  function updatePaas(){
    var dynC=parseInt($('paas_dyn_cld').value)||0;
    var staC=parseInt($('paas_sta_cld').value)||0;
    var stoGB=parseInt($('paas_storage').value)||0;
    var txGB=parseInt($('paas_traffic').value)||0;

    var dynMo=dynC*PAAS_PRICE.dynamicCloudlet*730;
    var staMo=staC*PAAS_PRICE.staticCloudlet*730;
    var stoMo=stoGB*PAAS_PRICE.storagePerGBh*730;
    var txMo=txGB*PAAS_PRICE.trafficPerGB;

    function s(id,v){var e=$(id);if(e)e.textContent=fmt(v);}
    s('pb_paas_dyn',dynMo);
    s('pb_paas_sta',staMo);
    s('pb_paas_sto',stoMo);
    s('pb_paas_tx',txMo);

    // Summary
    var totalC=dynC+staC;
    var totalRAM=totalC*PAAS_PRICE.cloudletRAM;
    var totalCPU=totalC*PAAS_PRICE.cloudletCPU;
    var ramLabel=totalRAM>=1024?(totalRAM/1024).toFixed(1)+' GB':totalRAM+' MB';
    var cpuLabel=totalCPU>=1000?(totalCPU/1000).toFixed(1)+' GHz':totalCPU+' MHz';
    $('paas_summary').innerHTML=totalC>0?'<strong>'+totalC+'</strong> total cloudlets = <strong>'+ramLabel+'</strong> RAM + <strong>'+cpuLabel+'</strong> CPU':'';

    recalc();
  }
  ['paas_dyn_cld','paas_sta_cld','paas_storage','paas_traffic'].forEach(function(id){
    var e=$(id);if(e){e.addEventListener('input',updatePaas);e.addEventListener('change',updatePaas);}
  });
}

function calcPaas(){
  var dynC=parseInt(($('paas_dyn_cld')||{}).value)||0;
  var staC=parseInt(($('paas_sta_cld')||{}).value)||0;
  var stoGB=parseInt(($('paas_storage')||{}).value)||0;
  var txGB=parseInt(($('paas_traffic')||{}).value)||0;
  return dynC*PAAS_PRICE.dynamicCloudlet*730 + staC*PAAS_PRICE.staticCloudlet*730 + stoGB*PAAS_PRICE.storagePerGBh*730 + txGB*PAAS_PRICE.trafficPerGB;
}

/* ────── TaaS (AI Models) ────── */
var TAAS_SUPPLIER={
  'bge-m3':['CloudSigma'],'bge-reranker-v2-m3':['CloudSigma'],
  'kimi-k2':['Moonshot AI'],
  'minimax-m2':['MiniMax'],'minimax-m2.5':['MiniMax'],
  'codestral':['Mistral AI','CloudSigma'],'magistral-medium':['Mistral AI'],'magistral-small':['Mistral AI'],'mistral-medium':['Mistral AI','CloudSigma'],'mistral-small-24b':['Mistral AI','CloudSigma'],'pixtral-large':['Mistral AI'],
  'deepseek-chat':['DeepSeek','CloudSigma'],'deepseek-r1-7b':['CloudSigma'],'deepseek-v3':['DeepSeek','CloudSigma'],
  'glm-4-flash':['Zhipu AI'],'glm-5':['Zhipu AI'],
  'qwen-72b':['CloudSigma'],'qwen-coder-32b':['CloudSigma'],'qwen3-30b':['CloudSigma'],'qwen-2.5-7b':['CloudSigma'],'qwen-2.5-14b':['CloudSigma'],'qwen3-vl':['CloudSigma'],
  'llama-3.1-8b':['CloudSigma'],'llama-3.2-3b':['CloudSigma'],
  'gpt-5.4-codex':['OpenAI'],'gpt-5.3-codex':['OpenAI'],'gpt-5.2-codex':['OpenAI'],
  'claude-opus-4':['Anthropic'],'claude-opus-4.6':['Anthropic'],'claude-sonnet-4':['Anthropic'],'claude-sonnet-4.6':['Anthropic'],
  'whisper':['CloudSigma'],'whisper-1':['CloudSigma'],
  'kokoro':['CloudSigma'],'f5-tts':['CloudSigma'],
  'ecapa-tdnn':['CloudSigma'],'xvector':['CloudSigma'],'wavlm-base-plus-sv':['CloudSigma'],
  'cam++':['CloudSigma'],'resnet293':['CloudSigma'],
  'clap':['CloudSigma'],'ast':['CloudSigma'],'mert':['CloudSigma']
};
var TAAS_TYPE_LABELS={
  'chat':'\uD83D\uDCAC Chat / LLM',
  'embedding':'\uD83D\uDD17 Embedding',
  'rerank':'\uD83D\uDD00 Rerank',
  'audio':'\uD83C\uDFA4 Speech-to-Text',
  'tts':'\uD83D\uDD0A Text-to-Speech',
  'speaker':'\uD83D\uDDE3\uFE0F Speaker Recognition',
  'audio-understanding':'\uD83C\uDFB5 Audio Understanding'
};

var TAAS_MODELS_BUILTIN=[{"id":"bge-m3","type":"embedding"},{"id":"bge-reranker-v2-m3","type":"rerank"},{"id":"kimi-k2","type":"chat","pricing":{"input":0.2,"output":0.4},"context_window":131000,"max_output_tokens":8192},{"id":"minimax-m2","type":"chat","pricing":{"input":0.3,"output":1.2},"context_window":197000,"max_output_tokens":16384},{"id":"minimax-m2.5","type":"chat","pricing":{"input":0.3,"output":1.2},"context_window":197000,"max_output_tokens":16384},{"id":"codestral","type":"chat","pricing":{"input":0.3,"output":0.9},"context_window":256000,"max_output_tokens":8192},{"id":"magistral-medium","type":"chat","pricing":{"input":2.0,"output":5.0},"context_window":40000,"max_output_tokens":16384},{"id":"magistral-small","type":"chat","pricing":{"input":0.5,"output":1.5},"context_window":40000,"max_output_tokens":16384},{"id":"mistral-medium","type":"chat","pricing":{"input":0.4,"output":1.2},"context_window":131072,"max_output_tokens":8192},{"id":"pixtral-large","type":"chat","pricing":{"input":2.0,"output":6.0},"capabilities":{"vision":true},"context_window":128000,"max_output_tokens":4096},{"id":"deepseek-chat","type":"chat","pricing":{"input":0.14,"output":0.28},"context_window":64000,"max_output_tokens":8192},{"id":"glm-4-flash","type":"chat","pricing":{"input":0.06,"output":0.4},"context_window":203000,"max_output_tokens":4096},{"id":"glm-5","type":"chat","pricing":{"input":0.8,"output":2.56},"context_window":203000,"max_output_tokens":8192},{"id":"qwen-72b","type":"chat","pricing":{"input":0.12,"output":0.39},"context_window":33000,"max_output_tokens":8192},{"id":"qwen-coder-32b","type":"chat","pricing":{"input":0.08,"output":0.28},"context_window":41000,"max_output_tokens":8192},{"id":"qwen3-30b","type":"chat","pricing":{"input":0.064,"output":0.224},"context_window":131000,"max_output_tokens":8192},{"id":"llama-3.1-8b","type":"chat","pricing":{"input":0.016,"output":0.04},"context_window":128000,"max_output_tokens":8192},{"id":"llama-3.2-3b","type":"chat","pricing":{"input":0.02,"output":0.04},"context_window":131000,"max_output_tokens":8192},{"id":"qwen-2.5-7b","type":"chat","pricing":{"input":0.048,"output":0.096},"context_window":32768,"max_output_tokens":8192},{"id":"qwen-2.5-14b","type":"chat","pricing":{"input":0.096,"output":0.192},"context_window":32768,"max_output_tokens":8192},{"id":"mistral-small-24b","type":"chat","pricing":{"input":0.06,"output":0.16},"context_window":32000,"max_output_tokens":8192},{"id":"gpt-5.4-codex","type":"chat","pricing":{"input":2.5,"output":15.0},"context_window":1050000,"max_output_tokens":128000},{"id":"gpt-5.3-codex","type":"chat","pricing":{"input":1.75,"output":14.0},"context_window":400000,"max_output_tokens":32000},{"id":"gpt-5.2-codex","type":"chat","pricing":{"input":1.75,"output":14.0},"context_window":256000,"max_output_tokens":32000},{"id":"claude-opus-4","type":"chat","pricing":{"input":15.0,"output":75.0},"capabilities":{"vision":true,"thinking":true},"context_window":200000,"max_output_tokens":32000},{"id":"claude-opus-4.6","type":"chat","pricing":{"input":15.0,"output":75.0},"capabilities":{"vision":true,"thinking":true},"context_window":200000,"max_output_tokens":32000},{"id":"claude-sonnet-4","type":"chat","pricing":{"input":3.0,"output":15.0},"capabilities":{"vision":true,"thinking":true},"context_window":200000,"max_output_tokens":16000},{"id":"claude-sonnet-4.6","type":"chat","pricing":{"input":3.0,"output":15.0},"capabilities":{"vision":true,"thinking":true},"context_window":200000,"max_output_tokens":16000},{"id":"deepseek-r1-7b","type":"chat","capabilities":{"reasoning":true},"context_window":64000,"max_output_tokens":8192},{"id":"qwen3-vl","type":"chat","pricing":{"input":0.15,"output":0.6},"capabilities":{"vision":true},"context_window":262000,"max_output_tokens":8192},{"id":"deepseek-v3","type":"chat","pricing":{"input":0.14,"output":0.28},"context_window":64000,"max_output_tokens":8192},{"id":"whisper","type":"audio"},{"id":"whisper-1","type":"audio"},{"id":"kokoro","type":"tts"},{"id":"f5-tts","type":"tts"},{"id":"ecapa-tdnn","type":"speaker"},{"id":"xvector","type":"speaker"},{"id":"wavlm-base-plus-sv","type":"speaker"},{"id":"cam++","type":"speaker"},{"id":"resnet293","type":"speaker"},{"id":"clap","type":"audio-understanding"},{"id":"ast","type":"audio-understanding"},{"id":"mert","type":"audio-understanding"}];

async function loadTaasModels(){
  try{
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},5000);
    var res=await fetch('/api/taas/models',{signal:controller.signal});
    clearTimeout(timer);
    var data=await res.json();
    var raw=(data.data&&data.data.length)?data.data:TAAS_MODELS_BUILTIN;
    // Deduplicate by id
    var seen={};taasModels=[];
    raw.forEach(function(m){if(!seen[m.id]){seen[m.id]=1;taasModels.push(m);}});
  }catch(e){
    var seen={};taasModels=[];
    TAAS_MODELS_BUILTIN.forEach(function(m){if(!seen[m.id]){seen[m.id]=1;taasModels.push(m);}});
  }
}

function buildTaasPanel(){
  var el=$('panel-taas');if(!el)return;
  if(!taasModels.length){el.innerHTML='<div style="color:var(--text-secondary);font-size:.82rem">Loading TaaS models...</div>';return;}

  // Group by type
  var groups={};
  taasModels.forEach(function(m){
    var t=m.type||'other';
    if(!groups[t])groups[t]=[];
    groups[t].push(m);
  });

  // Type order
  var typeOrder=['chat','embedding','rerank','audio','tts','speaker','audio-understanding'];
  var sortedTypes=typeOrder.filter(function(t){return groups[t];});
  Object.keys(groups).forEach(function(t){if(sortedTypes.indexOf(t)===-1)sortedTypes.push(t);});

  var h='<div style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-secondary)">AI model pricing per million tokens (input/output). Select models and estimate monthly usage. <span style="color:var(--orange);font-weight:600">Burst pricing only.</span></div>';

  // Model selector table
  h+='<table class="res-price-table"><thead><tr><th>Model</th><th>Supplier</th><th>Input</th><th>Output</th><th style="width:120px">M tokens/mo</th><th style="width:90px;color:var(--orange)">Burst/mo</th></tr></thead><tbody>';

  sortedTypes.forEach(function(type){
    var label=TAAS_TYPE_LABELS[type]||type;
    h+='<tr><td colspan="6" style="padding:.6rem .5rem .2rem;font-weight:700;font-size:.82rem;color:var(--cs-green);border-bottom:2px solid var(--border-color)">'+label+'</td></tr>';
    groups[type].sort(function(a,b){return a.id.localeCompare(b.id);}).forEach(function(m){
      var p=m.pricing||{};
      var hasPricing=p.input!=null;
      var inp=hasPricing?'$'+p.input:'Free';
      var out=hasPricing?'$'+p.output:'Free';
      var caps=[];
      if(m.capabilities){
        if(m.capabilities.vision)caps.push('\uD83D\uDC41\uFE0F');
        if(m.capabilities.thinking||m.capabilities.reasoning)caps.push('\uD83E\uDDE0');
      }
      var capStr=caps.length?' <span style="font-size:.7rem">'+caps.join(' ')+'</span>':'';
      var ctx=m.context_window?(m.context_window>=1000?(Math.round(m.context_window/1000))+'K':m.context_window):'';
      var ctxStr=ctx?' <span style="font-size:.65rem;color:var(--text-secondary)">('+ctx+')</span>':'';
      var suppliers=(TAAS_SUPPLIER[m.id]||['—']).join(', ');
      h+='<tr><td style="padding-left:1.5rem;font-size:.82rem">'+m.id+capStr+ctxStr+'</td>';
      h+='<td style="font-size:.75rem;color:var(--text-secondary)">'+suppliers+'</td>';
      h+='<td style="font-size:.78rem;color:'+(hasPricing?'var(--green)':'var(--cs-green)')+'">' +inp+'</td>';
      h+='<td style="font-size:.78rem;color:'+(hasPricing?'var(--orange)':'var(--cs-green)')+'">' +out+'</td>';
      h+='<td><input type="number" class="taas-usage" data-model="'+m.id+'" data-input="'+(p.input||0)+'" data-output="'+(p.output||0)+'" min="0" step="0.1" value="0" style="width:100%"></td>';
      h+='<td class="taas-cost" id="taas_cost_'+m.id.replace(/[^a-zA-Z0-9]/g,'_')+'" style="font-size:.78rem;font-weight:600;color:var(--orange)">$0.00</td>';
      h+='</tr>';
    });
  });
  h+='</tbody></table>';

  el.innerHTML=h;

  // Bind events
  el.querySelectorAll('.taas-usage').forEach(function(inp){
    inp.addEventListener('input',updateTaas);
    inp.addEventListener('change',updateTaas);
  });
}

function updateTaas(){
  var el=$('panel-taas');if(!el)return;
  el.querySelectorAll('.taas-usage').forEach(function(inp){
    var mtok=parseFloat(inp.value)||0;
    var pIn=parseFloat(inp.dataset.input)||0;
    var pOut=parseFloat(inp.dataset.output)||0;
    // Assume 50/50 input/output split for estimation
    var cost=mtok*(pIn*0.5+pOut*0.5);
    var id='taas_cost_'+inp.dataset.model.replace(/[^a-zA-Z0-9]/g,'_');
    var cell=document.getElementById(id);
    if(cell)cell.textContent=fmt(cost);
  });
  recalc();
}

function calcTaas(){
  var total=0;
  var el=$('panel-taas');if(!el)return 0;
  el.querySelectorAll('.taas-usage').forEach(function(inp){
    var mtok=parseFloat(inp.value)||0;
    var pIn=parseFloat(inp.dataset.input)||0;
    var pOut=parseFloat(inp.dataset.output)||0;
    total+=mtok*(pIn*0.5+pOut*0.5);
  });
  return total;
}

/* ────── Kubernetes ────── */
// K8s pricing: node compute billed via CloudSigma VM rates (intel CPU + RAM)
// Storage: billed as NVMe (or SSD fallback) per GB/month
// K8s uses live CloudSigma VM prices (same as Virtual Machines)
// Prices are derived from csSubPrice/csBurstPrice at runtime — constants are fallbacks
var K8S_VCPU_PRICE_HR=0.007;
var K8S_RAM_PRICE_HR=0.004;
var K8S_STORAGE_PRICE_MO=0.10;
function k8sSubPrice(){
  // nodes * (vcpu * intel_cpu_sub/hr + ram * intel_mem_sub/hr) * 730 + storage * dssd_sub
  var vcpuS=csSubPrice('intel_cpu');var ramS=csSubPrice('intel_mem');var stoS=csSubPrice('dssd');
  return{vcpu:vcpuS||K8S_VCPU_PRICE_HR,ram:ramS||K8S_RAM_PRICE_HR,storage:stoS||K8S_STORAGE_PRICE_MO};
}
function k8sBurstPrice(){
  var vcpuB=csBurstPrice('intel_cpu');var ramB=csBurstPrice('intel_mem');var stoB=csBurstPrice('dssd');
  return{vcpu:vcpuB||K8S_VCPU_PRICE_HR*1.3,ram:ramB||K8S_RAM_PRICE_HR*1.3,storage:stoB||K8S_STORAGE_PRICE_MO*1.3};
}
function calcK8sSub(){
  if(k8sState.nodes<=0)return 0;
  var p=k8sSubPrice();
  return k8sState.nodes*(k8sState.vcpu*p.vcpu+k8sState.ram*p.ram)*730+k8sState.storageGB*p.storage;
}
function calcK8sBurst(){
  if(k8sState.nodes<=0)return 0;
  var p=k8sBurstPrice();
  return k8sState.nodes*(k8sState.vcpu*p.vcpu+k8sState.ram*p.ram)*730+k8sState.storageGB*p.storage;
}

function buildK8sPanel(){
  var el=$('panel-k8s');if(!el)return;
  var pS=k8sSubPrice(),pB=k8sBurstPrice();
  var cSub=k8sState.nodes*(k8sState.vcpu*pS.vcpu+k8sState.ram*pS.ram)*730;
  var cBurst=k8sState.nodes*(k8sState.vcpu*pB.vcpu+k8sState.ram*pB.ram)*730;
  var sSub=k8sState.storageGB*pS.storage;
  var sBurst=k8sState.storageGB*pB.storage;
  var h='';
  h+='<div style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-secondary)">Kubernetes cluster sizing — priced at CloudSigma VM rates (Intel vCPU + RAM + SSD), subscription &amp; burst.</div>';
  h+='<div class="price-col-headers" style="max-width:200px;margin-left:auto"><div class="price-col-hdr sub">📗 Subscription</div><div class="price-col-hdr burst">📙 Burst</div></div>';

  h+='<div class="vm-row"><div class="vm-row-label">Worker Nodes '+infoBubble('k8s_nodes')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="k8s_nodes" min="0" max="500" step="1" value="'+k8sState.nodes+'"> <span class="vm-row-unit">nodes</span></div>';
  h+='<div style="flex:1"></div></div>';

  h+='<div class="vm-row"><div class="vm-row-label">vCPU per Node '+infoBubble('k8s_vcpu')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="k8s_vcpu" min="1" max="256" step="1" value="'+k8sState.vcpu+'"> <span class="vm-row-unit">vCPUs</span></div>';
  h+='<div style="flex:1"></div></div>';

  h+='<div class="vm-row"><div class="vm-row-label">RAM per Node '+infoBubble('k8s_ram')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="k8s_ram" min="1" max="1024" step="1" value="'+k8sState.ram+'"> <span class="vm-row-unit">GB</span></div>';
  h+='<div style="flex:1"></div></div>';

  h+='<div class="vm-row"><div class="vm-row-label">Compute (all nodes)</div>';
  h+='<div style="flex:1"></div>';
  h+=priceCell(cSub,cBurst,'pk8s_compute_sub','pk8s_compute_burst')+'</div>';

  h+='<div class="vm-row"><div class="vm-row-label">Persistent Storage '+infoBubble('k8s_storage')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="k8s_storageGB" min="0" max="500000" step="100" value="'+k8sState.storageGB+'"> <span class="vm-row-unit">GB</span></div>';
  h+=priceCell(sSub,sBurst,'pk8s_sto_sub','pk8s_sto_burst')+'</div>';

  h+='<div id="k8s_summary" style="margin-top:.5rem;font-size:.75rem;color:var(--text-secondary)">';
  if(k8sState.nodes>0){
    h+='<strong>'+k8sState.nodes+'</strong> node(s) × '+k8sState.vcpu+' vCPU / '+k8sState.ram+' GB';
    h+=' &bull; Sub: <strong>'+fmt(cSub+sSub)+'</strong>/mo';
    h+=' &bull; Burst: <strong>'+fmt(cBurst+sBurst)+'</strong>/mo';
  }
  h+='</div>';
  el.innerHTML=h;

  function updateK8s(){
    k8sState.nodes=parseInt($('k8s_nodes').value)||0;
    k8sState.vcpu=parseInt($('k8s_vcpu').value)||1;
    k8sState.ram=parseInt($('k8s_ram').value)||1;
    k8sState.storageGB=parseInt($('k8s_storageGB').value)||0;
    var pS2=k8sSubPrice(),pB2=k8sBurstPrice();
    var cS2=k8sState.nodes*(k8sState.vcpu*pS2.vcpu+k8sState.ram*pS2.ram)*730;
    var cB2=k8sState.nodes*(k8sState.vcpu*pB2.vcpu+k8sState.ram*pB2.ram)*730;
    var sS2=k8sState.storageGB*pS2.storage;var sB2=k8sState.storageGB*pB2.storage;
    function sv(id,v){var e=$(id);if(e)e.textContent=fmt(v);}
    sv('pk8s_compute_sub',cS2);sv('pk8s_compute_burst',cB2);
    sv('pk8s_sto_sub',sS2);sv('pk8s_sto_burst',sB2);
    var sum=$('k8s_summary');
    if(sum){
      if(k8sState.nodes>0){
        sum.innerHTML='<strong>'+k8sState.nodes+'</strong> node(s) × '+k8sState.vcpu+' vCPU / '+k8sState.ram+' GB'
          +' &bull; Sub: <strong>'+fmt(cS2+sS2)+'</strong>/mo'
          +' &bull; Burst: <strong>'+fmt(cB2+sB2)+'</strong>/mo';
      }else{sum.innerHTML='';}
    }
    recalc();
  }
  ['k8s_nodes','k8s_vcpu','k8s_ram','k8s_storageGB'].forEach(function(id){
    var e=$(id);if(e){e.addEventListener('input',updateK8s);e.addEventListener('change',updateK8s);}
  });
}

function calcK8s(){return calcK8sSub();}  // legacy alias used in addBurstOnlyItems

/* ────── Calc ────── */
function calcCSMode(priceFn){
  var bd={};var vmT=0,winT=0,bkT=0,ipT=0,gpuT=0;
  vmLines.forEach(function(vm){
    if(!vm.disks)vm.disks=[{type:'dssd',size:100}];
    var q=vm.qty||1,cpuR=cpuResForVm(vm),memR=memResForVm(vm),ipR=ipResForVm(vm);
    var dC=0;vm.disks.forEach(function(d){dC+=d.size*priceFn(d.type);});
    vmT+=q*(vm.cpu*(vm.cpuSpeed||2)*priceFn(cpuR)*730+vm.ram*priceFn(memR)*730+dC+(vm.hypervisor==='kvm'?vm.localDisk*priceFn('local_nvme'):0));
    bkT+=q*vm.backup*priceFn('backup');ipT+=q*vm.ip*priceFn(ipR);
    if(vm.gpu>0&&vm.hypervisor==='kvm')gpuT+=q*vm.gpu*priceFn(vm.gpuType)*730;
    var w=0;if(vm.winOs&&vm.winOsQty>0)w+=vm.winOsQty*priceFn(vm.winOs);
    if(vm.sqlLic&&vm.sqlLicQty>0)w+=vm.sqlLicQty*priceFn(vm.sqlLic);
    if(vm.rdsQty>0)w+=vm.rdsQty*priceFn('msft_tfa_00523');winT+=q*w;
  });
  if(vmT>0)bd['\u26A1 Compute & Storage']=vmT;if(bkT>0)bd['\uD83D\uDCBE Backup']=bkT;
  if(ipT>0)bd['\uD83C\uDF10 IPs']=ipT;if(gpuT>0)bd['\uD83D\uDE80 GPU']=gpuT;
  if(winT>0)bd['\uD83E\uDE9F Microsoft Licenses']=winT;
  var objT=0;['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){var v=objStorageState[k]||0;if(v>0)objT+=v*priceFn(k);});
  if(objT>0)bd['\uD83D\uDDC4\uFE0F Object Storage']=objT;
  var netT=0;netT+=netState.tx*netState.txQty*priceFn('tx');
  if(netState.bandwidth)netT+=priceFn(netState.bandwidth);
  netT+=netState.vlan*priceFn('vlan');
  if(netT>0)bd['\uD83C\uDF10 Network']=netT;
  var total=0;for(var k in bd)total+=bd[k];return{total:total,breakdown:bd};
}
function addBurstOnlyItems(r){
  // Data Protection — upfront (Migration) stays separate; Backup+DR are subscription
  var dpUpfront=calcDpUpfront();
  var dpSubscription=calcDpSubscription();
  if(dpUpfront>0){r.breakdown['\uD83D\uDEE1\uFE0F Data Protection (Upfront)']=dpUpfront;r.total+=dpUpfront;}
  if(dpSubscription>0){r.breakdown['\uD83D\uDEE1\uFE0F Data Protection (Sub)']=dpSubscription;r.total+=dpSubscription;}
  var paasT=calcPaas();if(paasT>0){r.breakdown['\u2601\uFE0F PaaS']=paasT;r.total+=paasT;}
  var ofT=calcOmnifabric();if(ofT>0){r.breakdown['\uD83D\uDDC4\uFE0F Omnifabric']=ofT;r.total+=ofT;}
  var taasT=calcTaas();if(taasT>0){r.breakdown['\uD83E\uDD16 TaaS']=taasT;r.total+=taasT;}
  // K8s: subscription portion added to sub total, burst portion added separately
  var k8sSub=calcK8sSub();var k8sBurst=calcK8sBurst();
  if(k8sSub>0){r.breakdown['\u2388\uFE0F Kubernetes']=k8sSub;r.total+=k8sSub;}
  r._k8sBurstExtra=k8sBurst-k8sSub; // burst premium on top of sub
  return r;
}
function calcCS(){
  var r=calcCSMode(csSubPrice);
  // Add K8s sub + DP sub to subscription total
  var k8sS=calcK8sSub();if(k8sS>0){r.breakdown['\u2388\uFE0F Kubernetes']=k8sS;r.total+=k8sS;}
  var dpS=calcDpSubscription();if(dpS>0){r.breakdown['\uD83D\uDEE1\uFE0F Data Protection (Sub)']=dpS;r.total+=dpS;}
  return r;
}
function calcCSBurst(){
  var r=calcCSMode(csBurstPrice);
  var k8sB=calcK8sBurst();if(k8sB>0){r.breakdown['\u2388\uFE0F Kubernetes']=k8sB;r.total+=k8sB;}
  var dpS=calcDpSubscription();if(dpS>0){r.breakdown['\uD83D\uDEE1\uFE0F Data Protection (Sub)']=dpS;r.total+=dpS;}
  return r;
}
function calcCSSmart(){
  var r=addBurstOnlyItems(calcCSMode(csSmartPrice));
  var dpUp=calcDpUpfront();if(dpUp>0)r.upfront=(r.upfront||0)+dpUp;
  r.subTotal=calcCS().total;
  r.burstTotal=Math.max(0,r.total-r.subTotal+(r._k8sBurstExtra||0));
  r.upfront=r.upfront||0;
  return r;
}

function calcComp(prov){
  var bd={};var vmT=0,winT=0,bkT=0,ipT=0,gpuT=0;
  var wp={msft_6wc_00002:9,msft_9ea_00039:24,msft_7nq_00302:110,msft_7jq_00341:410,msft_tfa_00523:7};
  vmLines.forEach(function(vm){
    if(!vm.disks)vm.disks=[{type:'dssd',size:100}];
    var q=vm.qty||1;var dC=0;vm.disks.forEach(function(d){dC+=d.size*(prov.ssd||0.10);});
    vmT+=q*(vm.cpu*prov.cpu*730+vm.ram*prov.ram*730+dC+vm.localDisk*(prov.ssd||0.10)*1.2);
    bkT+=q*vm.backup*(prov.ssd||0.10)*0.5;ipT+=q*vm.ip*(prov.ip||3.60);
    if(vm.gpu>0){var gk=vm.gpuType==='gpu_nvidia_l40s'?'gpu_l40s':'gpu_a100';gpuT+=q*vm.gpu*(prov[gk]||0)*730;}
    var w=0;if(vm.winOs&&vm.winOsQty>0)w+=vm.winOsQty*(wp[vm.winOs]||0);if(vm.sqlLic&&vm.sqlLicQty>0)w+=vm.sqlLicQty*(wp[vm.sqlLic]||0);if(vm.rdsQty>0)w+=vm.rdsQty*(wp['msft_tfa_00523']||0);winT+=q*w;
  });
  if(vmT>0)bd['\u26A1 Compute & Storage']=vmT;if(bkT>0)bd['\uD83D\uDCBE Backup']=bkT;if(ipT>0)bd['\uD83C\uDF10 IPs']=ipT;if(gpuT>0)bd['\uD83D\uDE80 GPU']=gpuT;if(winT>0)bd['\uD83E\uDE9F Microsoft Licenses']=winT;
  var objT=0;['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){var v=objStorageState[k]||0;if(v>0)objT+=v*(prov.obj_storage||0.023);});
  if(objT>0)bd['\uD83D\uDDC4\uFE0F Object Storage']=objT;
  var netT=0;netT+=netState.tx*netState.txQty*(prov.bandwidth||0.09);
  if(netT>0)bd['\uD83C\uDF10 Network']=netT;
  // Kubernetes — priced as managed node compute (EKS/AKS/GKE node rates)
  if(k8sState.nodes>0){
    var k8sCompT=k8sState.nodes*((k8sState.vcpu*(prov.cpu||0.0464))+(k8sState.ram*(prov.ram||0.00624)))*730;
    var k8sStoT=k8sState.storageGB*(prov.ssd||0.10);
    var k8sProvT=k8sCompT+k8sStoT;
    if(k8sProvT>0)bd['\u2388\uFE0F Kubernetes']=k8sProvT;
  }
  var total=0;for(var k in bd)total+=bd[k];return{total:total,breakdown:bd};
}

function recalc(){
  if(!pricing.objects||!competitors.aws)return;
  var cs=calcCS(),csB=calcCSBurst(),csSmart=calcCSSmart();
  var aws=calcComp(competitors.aws),azure=calcComp(competitors.azure),gcp=calcComp(competitors.gcp);
  var all=[{name:'AWS',tag:'aws',region:competitors.aws.name,total:aws.total,breakdown:aws.breakdown},{name:'Azure',tag:'azure',region:competitors.azure.name,total:azure.total,breakdown:azure.breakdown},{name:'GCP',tag:'gcp',region:competitors.gcp.name,total:gcp.total,breakdown:gcp.breakdown}];
  all.sort(function(a,b){return a.total-b.total});var best=all[0];
  var stS=$('sectionTotalSub'),stB=$('sectionTotalBurst'),stC=$('sectionTotalCombined');
  if(stS)stS.textContent=fmt(csSmart.subTotal);
  if(stB)stB.textContent=fmt(csSmart.burstTotal);
  if(stC)stC.textContent=fmt(csSmart.total);
  // Locbar totals (direct update — no poll lag)
  var ls=$('locbarTotalSub'),lb=$('locbarTotalBurst'),lc=$('locbarTotalCombined');
  if(ls)ls.textContent=fmt(csSmart.subTotal);
  if(lb)lb.textContent=fmt(csSmart.burstTotal);
  if(lc)lc.textContent=fmt(csSmart.total);
  // Locbar quote name
  var opp=$('quoteOpportunity'),cust=$('quoteCustomer'),nameEl=$('locbarQuoteName');
  if(nameEl){var lbl=(opp&&opp.value.trim())||(cust&&cust.value.trim())||'';nameEl.textContent=lbl?'\uD83D\uDCC4 '+lbl:'';nameEl.title=lbl;}
  // VM page sub-totals
  var vmSub=$('vmTotalSub'),vmBurst=$('vmTotalBurst');
  if(vmSub){var vsub=0;vmLines.forEach(function(vm){var q=vm.qty||1,cpuR=cpuResForVm(vm),memR=memResForVm(vm);vsub+=q*(vm.cpu*(vm.cpuSpeed||2)*csSubPrice(cpuR)*730+vm.ram*csSubPrice(memR)*730);vm.disks.forEach(function(d){vsub+=q*d.size*csSubPrice(d.type);});});if(vmSub)vmSub.textContent=fmt(vsub);}
  if(vmBurst){var vburst=0;vmLines.forEach(function(vm){var q=vm.qty||1,cpuR=cpuResForVm(vm),memR=memResForVm(vm);vburst+=q*(vm.cpu*(vm.cpuSpeed||2)*csBurstPrice(cpuR)*730+vm.ram*csBurstPrice(memR)*730);vm.disks.forEach(function(d){vburst+=q*d.size*csBurstPrice(d.type);});});if(vmBurst)vmBurst.textContent=fmt(vburst);}
  // Floating location info
  var fli=$('floatLocationInfo');
  if(fli&&currentLocation){
    fli.innerHTML='📍 '+currentLocation.display_name+' &bull; '+displayCurrency;
  }
  // Floating total box
  var fb=$('floatBreakdown');
  if(fb){
    var fh='';
    for(var fk in csSmart.breakdown){
      var secKey=BREAKDOWN_SECTION[fk]||'';
      fh+='<div style="display:flex;align-items:center;gap:.3rem;margin-bottom:.15rem">';
      fh+='<span onclick="scrollToSection(\''+secKey+'\')" style="font-size:.72rem;color:var(--cs-green);white-space:nowrap;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;flex:1" title="Edit '+fk+'">'+fk+'</span>';
      fh+='<span style="font-size:.8rem;font-weight:600;color:var(--text);white-space:nowrap">'+fmt(csSmart.breakdown[fk])+'</span>';
      fh+='<span onclick="confirmClearGroup(this)" data-key="'+fk.replace(/"/g,'&quot;')+'" style="cursor:pointer;font-size:.65rem;color:var(--red,#e74c3c);margin-left:.15rem;opacity:.6;line-height:1" title="Remove">\u2716</span>';
      fh+='</div>';
    }
    fh+='<div style="border-top:1px solid var(--border-color);margin-top:.4rem;padding-top:.3rem">';
    fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.7rem;color:var(--green)">Subscription</span><span style="font-size:.82rem;font-weight:600;color:var(--green)">'+fmt(csSmart.subTotal)+'</span></div>';
    fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.7rem;color:var(--orange)">Burst</span><span style="font-size:.82rem;font-weight:600;color:var(--orange)">'+fmt(csSmart.burstTotal)+'</span></div>';
    if(csSmart.upfront>0){fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.7rem;color:var(--cs-green)">Upfront</span><span style="font-size:.82rem;font-weight:600;color:var(--cs-green)">'+fmt(csSmart.upfront)+'</span></div>';}
    fh+='</div>';
    fh+='<div style="border-top:2px solid var(--cs-green);margin-top:.3rem;padding-top:.4rem;display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.75rem;font-weight:700;color:var(--cs-green)">TOTAL</span><span style="font-size:1.05rem;font-weight:700;color:var(--green)">'+fmt(csSmart.total)+'</span></div>';
    fb.innerHTML=fh;
  }
  renderBd('csBreakdown',csSmart.breakdown,csSmart.total);
  // Check if services are comparable (no CS-exclusive services configured)
  var hasExclusive=calcPaas()>0||calcOmnifabric()>0||calcTaas()>0;
  var bestCard=$('bestAlternativeCard'),cmpSec=$('section-body-cmp');
  if(hasExclusive){
    $('csTotal').textContent=fmt(csSmart.total);$('csTotal').style.color='var(--cs-green)';
    if(bestCard){bestCard.style.display='none';}
  } else {
    if(bestCard){bestCard.style.display='';}
    $('csTotal').textContent=fmt(csSmart.total);$('csTotal').style.color=csSmart.total<=best.total?'var(--green)':'var(--cs-green)';
    renderBd('bestBreakdown',best.breakdown,best.total,csSmart.total);
    $('bestTotal').textContent=fmt(best.total)+' ('+best.name+')';$('bestTotal').style.color=best.total<=csSmart.total?'var(--green)':'var(--red)';
  }
  var provs=[{name:'CloudSigma',tag:'cloudsigma',region:currentLocation.display_name,total:csSmart.total}].concat(all);
  if(hasExclusive){
    $('compGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;padding:2rem 1rem;color:var(--text-secondary);font-size:.85rem"><p style="font-size:1.2rem;margin-bottom:.5rem">⚠️</p>Provider comparison not available when PaaS, Omnifabric, or TaaS services are included.<br>These services are exclusive to CloudSigma and have no direct equivalent with AWS, Azure, or GCP.<br><br><span style="font-size:.78rem">Remove PaaS/Omnifabric/TaaS configurations to enable comparison.</span></div>';
  } else {
    var csRef=csSmart.total;
    $('compGrid').innerHTML=provs.map(function(p){var diff=p.total-csRef;var pct=csRef>0?Math.round((diff/csRef)*100):0;var sav='';if(p.tag==='cloudsigma'){sav=csRef<=best.total?'<div class="comp-savings" style="color:var(--green)">\u2713 Cheapest</div>':'<div class="comp-savings" style="color:var(--orange)">Not cheapest</div>'}else if(diff>0){sav='<div class="comp-savings" style="color:var(--red)">+'+fmt(diff)+' (+'+pct+'%)</div>'}else if(diff<0){sav='<div class="comp-savings" style="color:var(--green)">'+fmt(diff)+' ('+pct+'%)</div>'}else{sav='<div class="comp-savings" style="color:var(--text-secondary)">Same</div>'}return'<div class="comp-card '+p.tag+'"><div class="comp-name">'+p.name+'</div><div class="comp-region">'+p.region+'</div><div class="comp-cost">'+fmt(p.total)+'</div>'+sav+'</div>'}).join('');
  }
}
function renderBd(elId,bd,total,cmpT){
  var el=$(elId);var h='';
  for(var l in bd){var c=bd[l];var pct=total>0?Math.round((c/total)*100):0;h+='<div class="breakdown-row"><span>'+l+'</span><span>'+fmt(c)+' <span style="color:var(--text-secondary);font-size:.75rem">('+pct+'%)</span></span></div>';}
  h+='<div class="breakdown-row total"><span>Total</span><span>'+fmt(total)+'</span></div>';
  if(cmpT!==undefined){var diff=total-cmpT;var cls=diff>0?'loss':'savings';var sign=diff>0?'+':'';h+='<div class="breakdown-row '+cls+'" style="font-weight:600"><span>vs CloudSigma</span><span>'+sign+fmt(diff)+'</span></div>';}
  el.innerHTML=h;
}

/* ────── Helper: collect full quote data ────── */
function collectQuoteData(){
  var cs=calcCS(),csB=calcCSBurst(),csSmart=calcCSSmart();
  var customer=($('quoteCustomer')||{}).value||'';
  var opportunity=($('quoteOpportunity')||{}).value||'';
  var oppId=opportunityId;
  var notes=($('quoteNotes')||{}).value||'';
  var curLabel=displayCurrency;

  // Object Storage (read from persistent state)
  var objItems=[];
  ['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){
    var v=objStorageState[k]||0;if(v<=0)return;
    objItems.push({resource:LABELS[k]||k,resourceKey:k,qty:v,unit:'GB',sizeGB:v,subscriptionMo:v*csSubPrice(k),burstMo:v*csBurstPrice(k)});
  });

  // Network (read from persistent state)
  var netItems=[];
  if(netState.tx>0){
    netItems.push({resource:'Traffic',resourceKey:'tx',qty:netState.tx,unit:'GB',multiplier:netState.txQty,config:netState.tx+' GB x '+netState.txQty,subscriptionMo:netState.tx*netState.txQty*csSubPrice('tx'),burstMo:netState.tx*netState.txQty*csBurstPrice('tx')});
  }
  if(netState.bandwidth){
    var bwLabel=LABELS[netState.bandwidth]||netState.bandwidth;
    netItems.push({resource:bwLabel,resourceKey:netState.bandwidth,qty:1,unit:'subscription',config:'1',subscriptionMo:csSubPrice(netState.bandwidth),burstMo:csBurstPrice(netState.bandwidth)});
  }
  if(netState.vlan>0){netItems.push({resource:'VLAN',resourceKey:'vlan',qty:netState.vlan,unit:'VLANs',config:netState.vlan+' VLANs',subscriptionMo:netState.vlan*csSubPrice('vlan'),burstMo:netState.vlan*csBurstPrice('vlan')});}

  // PaaS
  var paasT=calcPaas();
  var paasItems=[];
  if(paasT>0){
    var dynC=parseInt(($('paas_dyn_cld')||{}).value)||0;
    var staC=parseInt(($('paas_sta_cld')||{}).value)||0;
    var stoGB=parseInt(($('paas_storage')||{}).value)||0;
    var txGB=parseInt(($('paas_traffic')||{}).value)||0;
    if(dynC>0)paasItems.push({resource:'Dynamic Cloudlets',qty:dynC,unit:'cloudlets',config:dynC+' cld ('+dynC*128+' MB / '+dynC*400+' MHz)',monthly:dynC*PAAS_PRICE.dynamicCloudlet*730});
    if(staC>0)paasItems.push({resource:'Static Cloudlets',qty:staC,unit:'cloudlets',config:staC+' cld ('+staC*128+' MB / '+staC*400+' MHz)',monthly:staC*PAAS_PRICE.staticCloudlet*730});
    if(stoGB>0)paasItems.push({resource:'Storage',qty:stoGB,unit:'GB',config:stoGB+' GB',monthly:stoGB*PAAS_PRICE.storagePerGBh*730});
    if(txGB>0)paasItems.push({resource:'External Traffic',qty:txGB,unit:'GB',config:txGB+' GB',monthly:txGB*PAAS_PRICE.trafficPerGB});
  }

  // Omnifabric
  var ofT=calcOmnifabric();
  var ofItems=[];
  if(ofT>0){
    ofInstances.forEach(function(inst,idx){
      var spec=OF_PRICE.compute[inst.spec]||OF_PRICE.compute[0];
      var mo=spec.priceHr*730*inst.qty + inst.storageGB*OF_PRICE.storagePerGBmo;
      ofItems.push({instance:'Instance '+(idx+1),spec:spec.label,qty:inst.qty,storageGB:inst.storageGB,monthly:mo});
    });
  }

  // TaaS
  var taasT=calcTaas();
  var taasItems=[];
  if(taasT>0){
    var tel=$('panel-taas');
    if(tel)tel.querySelectorAll('.taas-usage').forEach(function(inp){
      var mtok=parseFloat(inp.value)||0;
      if(mtok<=0)return;
      var pIn=parseFloat(inp.dataset.input)||0;
      var pOut=parseFloat(inp.dataset.output)||0;
      var cost=mtok*(pIn*0.5+pOut*0.5);
      taasItems.push({model:inp.dataset.model,mtokPerMo:mtok,monthly:cost});
    });
  }

  // Data Protection - split upfront vs subscription
  var dpUpfront=calcDpUpfront();
  var dpSubscription=calcDpSubscription();
  var dpItems=[];
  // Migration - upfront (one-time)
  if(dpUpfront>0)dpItems.push({resource:'Migration',qty:dpState.migration,unit:'units',upfront:dpUpfront,monthly:0});
  // Backup/DR/Capacity - subscription (monthly)
  if(dpSubscription>0){
    if(dpState.backup>0)dpItems.push({resource:'Backup',qty:dpState.backup,unit:'units',subscription:dpEurToDisplay(dpState.backup*DP_PRICE.backup),burst:0});
    if(dpState.backupCapacity>0)dpItems.push({resource:'Backup Capacity',qty:dpState.backupCapacity,unit:'GB',subscription:dpEurToDisplay(dpState.backupCapacity*DP_PRICE.backupCapacity),burst:0});
    if(dpState.dr>0)dpItems.push({resource:'DR',qty:dpState.dr,unit:'units',subscription:dpEurToDisplay(dpState.dr*DP_PRICE.dr),burst:0});
    if(dpState.drCapacity>0)dpItems.push({resource:'DR Capacity',qty:dpState.drCapacity,unit:'GB',subscription:dpEurToDisplay(dpState.drCapacity*DP_PRICE.drCapacity),burst:0});
  }

  // VM details
  var vmData=[];
  vmLines.forEach(function(vm){
    var q=vm.qty||1;var cpuR=cpuResForVm(vm),memR=memResForVm(vm),ipR=ipResForVm(vm);
    var cpuLabel=vm.hypervisor==='vmware'?'VMware':(vm.cpuType||'intel').toUpperCase();
    var rows=[];
    rows.push({resource:'CPU ('+cpuLabel+')',config:vm.cpu+' cores @ '+(vm.cpuSpeed||2)+' GHz',subscriptionMo:vm.cpu*(vm.cpuSpeed||2)*csSubPrice(cpuR)*730*q,burstMo:vm.cpu*(vm.cpuSpeed||2)*csBurstPrice(cpuR)*730*q});
    rows.push({resource:'RAM',config:vm.ram+' GB',subscriptionMo:vm.ram*csSubPrice(memR)*730*q,burstMo:vm.ram*csBurstPrice(memR)*730*q});
    vm.disks.forEach(function(d,i){var dl=LABELS[d.type]||d.type;rows.push({resource:'Disk '+(i+1)+' ('+dl+')',config:d.size+' GB',subscriptionMo:d.size*csSubPrice(d.type)*q,burstMo:d.size*csBurstPrice(d.type)*q});});
    if(vm.localDisk>0&&vm.hypervisor==='kvm')rows.push({resource:'Local NVMe',config:vm.localDisk+' GB',subscriptionMo:vm.localDisk*csSubPrice('local_nvme')*q,burstMo:vm.localDisk*csBurstPrice('local_nvme')*q});
    if(vm.backup>0)rows.push({resource:'Backup',config:vm.backup+' GB',subscriptionMo:vm.backup*csSubPrice('backup')*q,burstMo:vm.backup*csBurstPrice('backup')*q});
    if(vm.ip>0)rows.push({resource:'Public IPs',config:String(vm.ip),subscriptionMo:vm.ip*csSubPrice(ipR)*q,burstMo:vm.ip*csBurstPrice(ipR)*q});
    if(vm.gpu>0&&vm.hypervisor==='kvm')rows.push({resource:'GPU ('+vm.gpuType+')',config:String(vm.gpu),subscriptionMo:vm.gpu*csSubPrice(vm.gpuType)*730*q,burstMo:vm.gpu*csBurstPrice(vm.gpuType)*730*q});
    if(vm.winOs&&vm.winOsQty>0)rows.push({resource:'Windows OS',config:vm.winOsQty+' lic',subscriptionMo:vm.winOsQty*csSubPrice(vm.winOs)*q,burstMo:vm.winOsQty*csBurstPrice(vm.winOs)*q});
    if(vm.sqlLic&&vm.sqlLicQty>0)rows.push({resource:'SQL License',config:vm.sqlLicQty+' lic',subscriptionMo:vm.sqlLicQty*csSubPrice(vm.sqlLic)*q,burstMo:vm.sqlLicQty*csBurstPrice(vm.sqlLic)*q});
    if(vm.rdsQty>0)rows.push({resource:'RDS CALs',config:String(vm.rdsQty),subscriptionMo:vm.rdsQty*csSubPrice('msft_tfa_00523')*q,burstMo:vm.rdsQty*csBurstPrice('msft_tfa_00523')*q});
    vmData.push({name:vm.name,hypervisor:vm.hypervisor,qty:q,
      specs:{cpu:vm.cpu,cpuSpeed:vm.cpuSpeed||2,cpuType:vm.cpuType||'intel',ram:vm.ram,
        disks:vm.disks.map(function(d){return{type:d.type,sizeGB:d.size};}),
        localDiskGB:vm.localDisk||0,backupGB:vm.backup||0,publicIPs:vm.ip||0,
        gpu:vm.gpu||0,gpuType:vm.gpuType||'',
        winOs:vm.winOs||'',winOsQty:vm.winOsQty||0,
        sqlLic:vm.sqlLic||'',sqlLicQty:vm.sqlLicQty||0,rdsQty:vm.rdsQty||0},
      items:rows});
  });

  // Grand totals (including PaaS/OF/TaaS)
  var grandSubTotal=csSmart.subTotal;
  var grandBurstTotal=csSmart.burstTotal;
  var grandTotal=csSmart.total;

  return {
    opportunityId:oppId,
    customer:customer,
    opportunityName:opportunity,
    notes:notes,
    location:currentLocation.display_name,
    locationHost:$('locationSelect')?$('locationSelect').value:'',
    currency:curLabel,
    generatedAt:new Date().toISOString(),
    virtualMachines:vmData,
    objectStorage:objItems,
    network:netItems,
    paas:{pricingType:'burst',items:paasItems,total:paasT},
    omnifabric:{pricingType:'burst',items:ofItems,total:ofT},
    taas:{pricingType:'burst',items:taasItems,total:taasT},
    kubernetes:{pricingType:'burst',nodes:k8sState.nodes,vcpu:k8sState.vcpu,ram:k8sState.ram,storageGB:k8sState.storageGB,total:calcK8s()},
    dataProtection:{pricingType:'mixed',upfront:dpUpfront,subscription:dpSubscription,items:dpItems},
    totals:{
      subscriptionMonthly:grandSubTotal,
      burstMonthly:grandBurstTotal,
      upfront:csSmart.upfront||0,
      grandTotalMonthly:grandTotal,
      commitmentOptions:{
        monthly:{discount:'0%',subscriptionMo:grandSubTotal,burstMo:grandBurstTotal,totalMo:grandTotal,annualTotal:grandTotal*12},
        oneYear:{discount:'10%',subscriptionMo:grandSubTotal*0.90,burstMo:grandBurstTotal,totalMo:grandSubTotal*0.90+grandBurstTotal,annualTotal:(grandSubTotal*0.90+grandBurstTotal)*12,savingsPerYear:grandTotal*12-(grandSubTotal*0.90+grandBurstTotal)*12},
        threeYear:{discount:'25%',subscriptionMo:grandSubTotal*0.75,burstMo:grandBurstTotal,totalMo:grandSubTotal*0.75+grandBurstTotal,annualTotal:(grandSubTotal*0.75+grandBurstTotal)*12,savingsPerYear:grandTotal*12-(grandSubTotal*0.75+grandBurstTotal)*12}
      }
    },
    breakdown:csSmart.breakdown
  };
}

/* ────── PDF Export ────── */
function exportPDF(){
  var data=collectQuoteData();
  var cs=calcCS(),csB=calcCSBurst(),csSmart=calcCSSmart();
  var sub1Y=cs.total*0.90,sub3Y=cs.total*0.75;
  var curLabel=displayCurrency;
  var customer=data.customer;
  var opportunity=data.opportunityName;
  var notes=data.notes;
  var w=window.open('','_blank');
  var html='<html><head><title>CloudSigma Quote</title><style>';
  html+='body{font-family:Arial,sans-serif;padding:40px;color:#222;max-width:950px;margin:0 auto}';
  html+='h1{color:#00A94F;margin-bottom:5px}h2{color:#333;border-bottom:2px solid #00A94F;padding-bottom:5px;margin-top:25px}';
  html+='table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;font-size:13px}';
  html+='th{background:#f5f5f5;font-weight:600}.total-row{font-weight:700;border-top:2px solid #00A94F;font-size:14px}';
  html+='.green{color:#059669}.orange{color:#d97706}.muted{color:#888;font-size:11px}.blue{color:#2563eb}';
  html+='.discount-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:15px;margin:15px 0}';
  html+='.discount-box h3{margin:0 0 10px;color:#059669}';
  html+='.quote-info{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:15px;margin:15px 0}';
  html+='.quote-info table{margin:0}.quote-info td{border:none;padding:4px 10px;font-size:13px}';
  html+='.quote-info td:first-child{font-weight:600;color:#555;width:150px}';
  html+='.notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:15px;margin:15px 0}';
  html+='.notes-box h3{margin:0 0 8px;color:#92400e;font-size:14px}';
  html+='.notes-box p{margin:0;white-space:pre-wrap;font-size:13px;color:#78350f}';
  html+='</style></head><body>';
  html+='<h1>Instant Quoting Tool (IQT)</h1>';
  html+='<p class="muted">Location: '+currentLocation.display_name+' &bull; Currency: '+curLabel+' &bull; Generated: '+new Date().toLocaleDateString()+'</p>';

  // Customer & Opportunity info box
  html+='<div class="quote-info"><table>';
  if(customer)html+='<tr><td>Customer</td><td>'+customer.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td></tr>';
  if(opportunity)html+='<tr><td>Opportunity Name</td><td>'+opportunity.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td></tr>';
  html+='<tr><td>Opportunity ID</td><td style="font-family:monospace;font-size:12px">'+opportunityId+'</td></tr>';
  html+='<tr><td>Location</td><td>'+currentLocation.display_name+'</td></tr>';
  html+='<tr><td>Currency</td><td>'+curLabel+'</td></tr>';
  html+='<tr><td>Date</td><td>'+new Date().toLocaleDateString()+'</td></tr>';
  html+='</table></div>';

  vmLines.forEach(function(vm){
    var q=vm.qty||1;var hvLabel=vm.hypervisor==='vmware'?' (VMware)':' (KVM)';
    html+='<h2>'+vm.name+hvLabel+' (x'+q+')</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="green">Subscription/mo</th><th class="orange">Burst/mo</th></tr>';
    var cpuR=cpuResForVm(vm),memR=memResForVm(vm),ipR=ipResForVm(vm);
    var cpuLabel=vm.hypervisor==='vmware'?'VMware':(vm.cpuType||'intel').toUpperCase();
    var rows=[
      ['CPU ('+cpuLabel+')',vm.cpu+' cores @ '+(vm.cpuSpeed||2)+' GHz',vm.cpu*(vm.cpuSpeed||2)*csSubPrice(cpuR)*730*q,vm.cpu*(vm.cpuSpeed||2)*csBurstPrice(cpuR)*730*q],
      ['RAM',vm.ram+' GB',vm.ram*csSubPrice(memR)*730*q,vm.ram*csBurstPrice(memR)*730*q],
    ];
    vm.disks.forEach(function(d,i){var dl=LABELS[d.type]||d.type;rows.push(['Disk '+(i+1)+' ('+dl+')',d.size+' GB',d.size*csSubPrice(d.type)*q,d.size*csBurstPrice(d.type)*q]);});
    if(vm.localDisk>0&&vm.hypervisor==='kvm')rows.push(['Local NVMe',vm.localDisk+' GB',vm.localDisk*csSubPrice('local_nvme')*q,vm.localDisk*csBurstPrice('local_nvme')*q]);
    if(vm.backup>0)rows.push(['Backup',vm.backup+' GB',vm.backup*csSubPrice('backup')*q,vm.backup*csBurstPrice('backup')*q]);
    if(vm.ip>0)rows.push(['Public IPs',vm.ip,vm.ip*csSubPrice(ipR)*q,vm.ip*csBurstPrice(ipR)*q]);
    if(vm.gpu>0&&vm.hypervisor==='kvm')rows.push(['GPU ('+vm.gpuType+')',vm.gpu,vm.gpu*csSubPrice(vm.gpuType)*730*q,vm.gpu*csBurstPrice(vm.gpuType)*730*q]);
    if(vm.winOs&&vm.winOsQty>0)rows.push(['Windows OS',vm.winOsQty+' lic',vm.winOsQty*csSubPrice(vm.winOs)*q,vm.winOsQty*csBurstPrice(vm.winOs)*q]);
    if(vm.sqlLic&&vm.sqlLicQty>0)rows.push(['SQL License',vm.sqlLicQty+' lic',vm.sqlLicQty*csSubPrice(vm.sqlLic)*q,vm.sqlLicQty*csBurstPrice(vm.sqlLic)*q]);
    if(vm.rdsQty>0)rows.push(['RDS CALs',vm.rdsQty,vm.rdsQty*csSubPrice('msft_tfa_00523')*q,vm.rdsQty*csBurstPrice('msft_tfa_00523')*q]);
    rows.forEach(function(r){html+='<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="green">'+fmt(r[2])+'</td><td class="orange">'+fmt(r[3])+'</td></tr>';});
    html+='</table>';
  });

  // Object Storage section in PDF
  if(data.objectStorage.length>0){
    html+='<h2>Object Storage</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="green">Subscription/mo</th><th class="orange">Burst/mo</th></tr>';
    var objSubT=0,objBurstT=0;
    data.objectStorage.forEach(function(item){
      html+='<tr><td>'+item.resource+'</td><td>'+item.sizeGB+' GB</td><td class="green">'+fmt(item.subscriptionMo)+'</td><td class="orange">'+fmt(item.burstMo)+'</td></tr>';
      objSubT+=item.subscriptionMo;objBurstT+=item.burstMo;
    });
    html+='<tr class="total-row"><td>Object Storage Total</td><td></td><td class="green">'+fmt(objSubT)+'</td><td class="orange">'+fmt(objBurstT)+'</td></tr>';
    html+='</table>';
  }

  // Network section in PDF
  if(data.network.length>0){
    html+='<h2>Network</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="green">Subscription/mo</th><th class="orange">Burst/mo</th></tr>';
    var netSubT=0,netBurstT=0;
    data.network.forEach(function(item){
      html+='<tr><td>'+item.resource+'</td><td>'+item.config+'</td><td class="green">'+fmt(item.subscriptionMo)+'</td><td class="orange">'+fmt(item.burstMo)+'</td></tr>';
      netSubT+=item.subscriptionMo;netBurstT+=item.burstMo;
    });
    html+='<tr class="total-row"><td>Network Total</td><td></td><td class="green">'+fmt(netSubT)+'</td><td class="orange">'+fmt(netBurstT)+'</td></tr>';
    html+='</table>';
  }

  // PaaS section in PDF (burst only)
  var paasT=calcPaas();
  if(paasT>0){
    html+='<h2>PaaS (Cloudlets) — Burst</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="orange">Burst/mo</th></tr>';
    data.paas.items.forEach(function(item){
      html+='<tr><td>'+item.resource+'</td><td>'+item.config+'</td><td class="orange">'+fmt(item.monthly)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>PaaS Total</td><td></td><td class="orange">'+fmt(paasT)+'</td></tr>';
    html+='</table>';
  }

  // Omnifabric section in PDF (burst only)
  var ofT=calcOmnifabric();
  if(ofT>0){
    html+='<h2>Omnifabric — Burst</h2>';
    html+='<table><tr><th>Instance</th><th>Spec</th><th>Qty</th><th>Storage</th><th class="orange">Burst/mo</th></tr>';
    data.omnifabric.items.forEach(function(item){
      html+='<tr><td>'+item.instance+'</td><td>'+item.spec+'</td><td>'+item.qty+'</td><td>'+item.storageGB+' GB</td><td class="orange">'+fmt(item.monthly)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>Omnifabric Total</td><td></td><td></td><td></td><td class="orange">'+fmt(ofT)+'</td></tr>';
    html+='</table>';
  }

  // TaaS section in PDF (burst only)
  var taasT=calcTaas();
  if(taasT>0){
    html+='<h2>TaaS (AI Models) — Burst</h2>';
    html+='<table><tr><th>Model</th><th>M tokens/mo</th><th class="orange">Burst/mo</th></tr>';
    data.taas.items.forEach(function(item){
      html+='<tr><td>'+item.model+'</td><td>'+item.mtokPerMo+'</td><td class="orange">'+fmt(item.monthly)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>TaaS Total</td><td></td><td class="orange">'+fmt(taasT)+'</td></tr>';
    html+='</table>';
  }

  // Kubernetes section in PDF
  var k8sT=calcK8s();
  if(k8sT>0){
    html+='<h2>Kubernetes — Burst</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="orange">Burst/mo</th></tr>';
    var k8sCompMo=k8sState.nodes*((k8sState.vcpu*K8S_VCPU_PRICE_HR)+(k8sState.ram*K8S_RAM_PRICE_HR))*730;
    var k8sStoMo=k8sState.storageGB*K8S_STORAGE_PRICE_MO;
    html+='<tr><td>Worker Nodes (Compute)</td><td>'+k8sState.nodes+' node(s) &times; '+k8sState.vcpu+' vCPU / '+k8sState.ram+' GB RAM</td><td class="orange">'+fmt(k8sCompMo)+'</td></tr>';
    if(k8sStoMo>0)html+='<tr><td>Persistent Storage</td><td>'+k8sState.storageGB+' GB</td><td class="orange">'+fmt(k8sStoMo)+'</td></tr>';
    html+='<tr class="total-row"><td>Kubernetes Total</td><td></td><td class="orange">'+fmt(k8sT)+'</td></tr>';
    html+='</table>';
  }

  // Data Protection section in PDF (burst only)
  var dpTpdf=calcDp();
  if(dpTpdf>0){
    html+='<h2>Data Protection \u2014 Burst</h2>';
    html+='<table><tr><th>Resource</th><th>Qty</th><th class="orange">Burst/mo</th></tr>';
    data.dataProtection.items.forEach(function(item){
      html+='<tr><td>'+item.resource+'</td><td>'+item.qty+' '+item.unit+'</td><td class="orange">'+fmt(item.monthly)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>Data Protection Total</td><td></td><td class="orange">'+fmt(dpTpdf)+'</td></tr>';
    html+='</table>';
  }

  // Grand Totals (including all services)
  html+='<h2>Monthly Totals</h2><table>';
  html+='<tr><td>Subscription (Monthly)</td><td></td><td class="green">'+fmt(csSmart.subTotal)+'</td><td></td></tr>';
  html+='<tr><td>Burst (Monthly)</td><td></td><td class="orange">'+fmt(csSmart.burstTotal)+'</td><td></td></tr>';
  if(csSmart.upfront>0){html+='<tr><td>Upfront (One-time)</td><td></td><td class="cs-green">'+fmt(csSmart.upfront)+'</td><td></td></tr>';}
  html+='<tr class="total-row"><td><strong>Grand Total (Monthly)</strong></td><td></td><td class="green"><strong>'+fmt(csSmart.total)+'</strong></td><td></td></tr>';
  html+='</table>';

  var burstMo=csSmart.burstTotal;
  var totalMo0=cs.total+burstMo;
  var total1Y=sub1Y+burstMo;
  var total3Y=sub3Y+burstMo;
  html+='<div class="discount-box"><h3>\uD83D\uDCB0 Subscription Commitment Discounts</h3>';
  html+='<p style="font-size:12px;color:#555;margin-bottom:10px">Commitment discounts apply to subscription pricing. Burst pricing remains unchanged. The total column combines the discounted subscription with burst.</p>';
  html+='<table>';
  html+='<tr><th>Commitment</th><th>Discount</th><th class="green">Subscription/mo</th><th class="orange">Burst/mo</th><th style="color:#00A94F;font-weight:700">Total/mo</th><th>Annual Total</th><th>Savings/yr</th></tr>';
  html+='<tr><td>Monthly</td><td>\u2014</td><td class="green">'+fmt(cs.total)+'</td><td class="orange">'+fmt(burstMo)+'</td><td style="font-weight:700">'+fmt(totalMo0)+'</td><td>'+fmt(totalMo0*12)+'</td><td>\u2014</td></tr>';
  html+='<tr style="background:#f0fdf4"><td><strong>1 Year</strong></td><td class="blue"><strong>10%</strong></td><td class="green"><strong>'+fmt(sub1Y)+'</strong></td><td class="orange">'+fmt(burstMo)+'</td><td style="font-weight:700"><strong>'+fmt(total1Y)+'</strong></td><td><strong>'+fmt(total1Y*12)+'</strong></td><td class="green"><strong>'+fmt(totalMo0*12-total1Y*12)+'</strong></td></tr>';
  html+='<tr style="background:#ecfdf5"><td><strong>3 Year</strong></td><td class="blue"><strong>25%</strong></td><td class="green"><strong>'+fmt(sub3Y)+'</strong></td><td class="orange">'+fmt(burstMo)+'</td><td style="font-weight:700"><strong>'+fmt(total3Y)+'</strong></td><td><strong>'+fmt(total3Y*12)+'</strong></td><td class="green"><strong>'+fmt(totalMo0*12-total3Y*12)+'</strong></td></tr>';
  html+='</table></div>';

  // Notes section
  if(notes){
    html+='<div class="notes-box"><h3>\uD83D\uDCDD Notes</h3><p>'+notes.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</p></div>';
  }

  html+='<p class="muted" style="margin-top:30px">Estimate only. Subscription = level 0 (monthly). Burst = current load pricing. Commitment discounts apply to subscription only.</p>';
  html+='</body></html>';
  w.document.write(html);w.document.close();
}
window.exportPDF=exportPDF;

/* ────── JSON Export ────── */
function exportJSON(){
  var data=collectQuoteData();
  // Round all numeric values to 2 decimal places for readability
  var jsonStr=JSON.stringify(data,function(key,val){
    if(typeof val==='number'&&key!=='qty'&&key!=='sizeGB'&&key!=='storageGB'&&key!=='mtokPerMo')return Math.round(val*100)/100;
    return val;
  },2);
  var blob=new Blob([jsonStr],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  var filename='cloudsigma-quote';
  if(data.customer)filename+='-'+data.customer.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
  filename+='-'+new Date().toISOString().slice(0,10)+'.json';
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportJSON=exportJSON;

/* ────── Admin ────── */
async function loadAdmin(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var allRes=['intel_cpu','intel_mem','arm_cpu','arm_mem','cpu_vmware','mem_vmware','dssd','dssd_vmware','nvme','nvme_vmware','nvme_basic','nvme_standard','nvme_fast','nvme_super_fast','local_nvme','ip','ip_vmware','vlan','vlan_vmware','tx','tx_vmware','backup','gpu_nvidia_a100','gpu_nvidia_l40s','obj_hdd','obj_nvme','obj_caching','zadara','msft_6wc_00002','msft_9ea_00039','msft_7nq_00302','msft_7jq_00341','msft_tfa_00523'];
  avail.forEach(function(r){if(allRes.indexOf(r)===-1)allRes.push(r)});allRes.sort();
  $('adminResource').innerHTML=allRes.map(function(r){return'<option value="'+r+'">'+r+'</option>'}).join('');
  var res=await fetch('/api/admin/overrides');var overrides=await res.json();renderOverrides(overrides);
  $('applyOverride').onclick=async function(){var host=$('adminLocation').value;var resource=$('adminResource').value;var currency=$('adminCurrency').value;var price=parseFloat($('adminPrice').value);if(isNaN(price)){alert('Enter a valid price');return}var r=await fetch('/api/admin/overrides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:host,resource:resource,currency:currency,price:price})});var data=await r.json();renderOverrides(data.overrides);await onLocationChange()};
  $('resetOverrides').onclick=async function(){if(!confirm('Reset all?'))return;var res=await fetch('/api/admin/overrides');var ov=await res.json();for(var loc in ov){for(var r in ov[loc]){await fetch('/api/admin/overrides/'+loc+'/'+r,{method:'DELETE'})}}renderOverrides({});await onLocationChange()};
}
function renderOverrides(ov){
  var el=$('overridesList');var entries=[];
  for(var loc in ov){for(var r in ov[loc]){entries.push({loc:loc,resource:r,currency:ov[loc][r].currency,price:ov[loc][r].price})}}
  if(!entries.length){el.innerHTML='<div style="color:var(--text-secondary);font-size:.85rem">No overrides.</div>';return}
  var h='<table style="width:100%;border-collapse:collapse;font-size:.85rem"><tr style="border-bottom:1px solid var(--border-color)"><th style="padding:.4rem;text-align:left;color:var(--text-secondary)">Location</th><th style="padding:.4rem;text-align:left;color:var(--text-secondary)">Resource</th><th style="padding:.4rem;text-align:left;color:var(--text-secondary)">Cur</th><th style="padding:.4rem;text-align:left;color:var(--text-secondary)">Price</th><th></th></tr>';
  entries.forEach(function(e){h+='<tr style="border-bottom:1px solid var(--border-color)"><td style="padding:.4rem">'+e.loc+'</td><td style="padding:.4rem">'+e.resource+'</td><td style="padding:.4rem">'+e.currency+'</td><td style="padding:.4rem">'+e.price+'</td><td style="padding:.4rem"><button class="btn-rm" onclick="delOverride(\''+e.loc+'\',\''+e.resource+'\')">&#10005;</button></td></tr>';});
  h+='</table>';el.innerHTML=h;
}
window.delOverride=async function(loc,r){await fetch('/api/admin/overrides/'+loc+'/'+r,{method:'DELETE'});var res=await fetch('/api/admin/overrides');renderOverrides(await res.json());await onLocationChange()};

/* ────── Save Quote to backend ────── */
// _savedQuoteId tracks the current loaded/saved quote ID to avoid opportunityId drift
var _savedQuoteId=null;

async function saveQuote(){
  var data=collectQuoteData();
  var statusEl=$('saveStatus');
  var btn=$('btnSaveQuote');
  if(btn)btn.disabled=true;
  if(statusEl)statusEl.innerHTML='<span style="color:var(--text-secondary)">Saving...</span>';
  try{
    var isUpdate=!!_savedQuoteId;
    var url=isUpdate?'/api/quotes/'+_savedQuoteId:'/api/quotes';
    var method=isUpdate?'PUT':'POST';
    // Always send the canonical ID: existing quote ID on update, current opportunityId on create
    data.opportunityId=isUpdate?_savedQuoteId:opportunityId;
    var res=await fetch(url,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    var result=await res.json();
    if(res.ok){
      // Track the saved ID so subsequent saves go to PUT
      _savedQuoteId=result.opportunityId||data.opportunityId;
      opportunityId=_savedQuoteId;
      if($('quoteOpportunityId'))$('quoteOpportunityId').value=opportunityId;
      var label=isUpdate?'Updated':'Saved';
      if(statusEl)statusEl.innerHTML='<span style="color:var(--green)">\u2713 '+label+' ('+result.opportunityId.substring(0,8)+'...)</span>';
    }else{
      if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 '+(result.error||'Save failed')+'</span>';
    }
  }catch(e){
    if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 Network error</span>';
  }
  if(btn)btn.disabled=false;
  setTimeout(function(){if(statusEl)statusEl.innerHTML='';},5000);
}
window.saveQuote=saveQuote;

/* ────── Load Quote list ────── */
async function loadQuoteList(){
  var panel=$('quoteListPanel');
  if(!panel)return;
  // Toggle panel
  if(panel.style.display!=='none'){panel.style.display='none';return;}
  panel.style.display='block';
  panel.innerHTML='<div style="padding:.5rem;text-align:center;color:var(--text-secondary);font-size:.75rem">Loading...</div>';
  try{
    var res=await fetch('/api/quotes');
    var result=await res.json();
    if(!result.quotes||result.quotes.length===0){
      panel.innerHTML='<div style="padding:.5rem;text-align:center;color:var(--text-secondary);font-size:.75rem">No saved quotes</div>';
      return;
    }
    var h='';
    result.quotes.forEach(function(q){
      var date=q.savedAt?new Date(q.savedAt).toLocaleDateString()+' '+new Date(q.savedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'—';
      var custName=q.customer||'(no customer)';
      var idShort=q.opportunityId?q.opportunityId.substring(0,8)+'...':'—';
      h+='<div style="padding:.45rem .6rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:.4rem">';
      h+='<div onclick="loadQuote(\''+q.opportunityId+'\')" style="flex:1;cursor:pointer" onmouseover="this.style.opacity=\'0.8\'" onmouseout="this.style.opacity=\'1\'">';
      h+='<div style="font-size:.78rem;font-weight:600;color:var(--text-primary)">'+custName.replace(/</g,'&lt;')+'</div>';
      h+='<div style="font-size:.65rem;color:var(--text-secondary);display:flex;justify-content:space-between;margin-top:.15rem">';
      h+='<span style="font-family:monospace">'+idShort+'</span>';
      h+='<span>'+date+'</span>';
      h+='</div>';
      if(q.opportunityName)h+='<div style="font-size:.65rem;color:var(--cs-green);margin-top:.1rem">'+q.opportunityName.replace(/</g,'&lt;')+'</div>';
      h+='</div>';
      h+='<button onclick="deleteQuote(\''+q.opportunityId+'\')" title="Delete quote" style="background:none;border:1px solid var(--red,#e74c3c);color:var(--red,#e74c3c);border-radius:4px;cursor:pointer;font-size:.65rem;padding:.2rem .35rem;white-space:nowrap;flex-shrink:0">\uD83D\uDDD1</button>';
      h+='</div>';
    });
    panel.innerHTML=h;
  }catch(e){
    panel.innerHTML='<div style="padding:.5rem;text-align:center;color:var(--red,#e74c3c);font-size:.75rem">Error loading quotes</div>';
  }
}
window.loadQuoteList=loadQuoteList;

/* ────── Delete a quote ────── */
async function deleteQuote(id){
  var shortId=id.substring(0,8)+'...';
  if(!confirm('Delete quote '+shortId+'?\nThis cannot be undone.'))return;
  var statusEl=$('saveStatus');
  try{
    var res=await fetch('/api/quotes/'+encodeURIComponent(id),{method:'DELETE'});
    var result=await res.json();
    if(res.ok){
      if(statusEl)statusEl.innerHTML='<span style="color:var(--green)">\u2713 Deleted '+shortId+'</span>';
      // Refresh the list
      var panel=$('quoteListPanel');
      if(panel)panel.style.display='none';
      loadQuoteList();
    }else{
      if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 '+(result.error||'Delete failed')+'</span>';
    }
  }catch(e){
    if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 Network error</span>';
  }
  setTimeout(function(){if(statusEl)statusEl.innerHTML='';},4000);
}
window.deleteQuote=deleteQuote;

/* ────── Load a single quote and populate the form ────── */
async function loadQuote(id){
  var panel=$('quoteListPanel');
  if(panel)panel.style.display='none';
  var statusEl=$('saveStatus');
  if(statusEl)statusEl.innerHTML='<span style="color:var(--text-secondary)">Loading quote...</span>';
  try{
    var res=await fetch('/api/quotes/'+encodeURIComponent(id));
    var q=await res.json();
    if(!res.ok){if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 '+(q.error||'Not found')+'</span>';return;}

    // Restore location and currency first (triggers pricing reload)
    if(q.locationHost&&$('locationSelect')){
      $('locationSelect').value=q.locationHost;
      await onLocationChange();
    }
    if(q.currency&&$('currencySelect')){
      var csel=$('currencySelect');
      // Check if currency option exists, if so select it
      for(var i=0;i<csel.options.length;i++){
        if(csel.options[i].value===q.currency){csel.value=q.currency;break;}
      }
      displayCurrency=csel.value;
    }

    // Restore opportunity ID — also track as saved ID to enable PUT on next save
    opportunityId=q.opportunityId||opportunityId;
    _savedQuoteId=opportunityId;
    if($('quoteOpportunityId'))$('quoteOpportunityId').value=opportunityId;

    // Restore customer, opportunity name, notes
    if($('quoteCustomer'))$('quoteCustomer').value=q.customer||'';
    if($('quoteOpportunity'))$('quoteOpportunity').value=q.opportunityName||'';
    if($('quoteNotes'))$('quoteNotes').value=q.notes||'';

    // Restore VMs from specs
    if(q.virtualMachines&&q.virtualMachines.length>0){
      vmLines=[];
      nextVmId=1;
      q.virtualMachines.forEach(function(vm){
        var s=vm.specs||{};
        var disks=(s.disks&&s.disks.length>0)?s.disks.map(function(d){return{type:d.type||'dssd',size:d.sizeGB||0}}):[{type:'dssd',size:0}];
        vmLines.push({id:nextVmId++,qty:vm.qty||1,name:vm.name||'VM '+nextVmId,
          cpu:s.cpu||0,cpuSpeed:s.cpuSpeed||2,ram:s.ram||0,cpuType:s.cpuType||'intel',
          hypervisor:vm.hypervisor||'kvm',disks:disks,
          localDisk:s.localDiskGB||0,backup:s.backupGB||0,gpu:s.gpu||0,gpuType:s.gpuType||'gpu_nvidia_a100',
          ip:s.publicIPs||0,winOs:s.winOs||'',winOsQty:s.winOsQty||0,
          sqlLic:s.sqlLic||'',sqlLicQty:s.sqlLicQty||0,rdsQty:s.rdsQty||0});
      });
      renderVmTable();
    }

    // Restore Object Storage — populate persistent state BEFORE rebuilding panel
    if(q.objectStorage){
      q.objectStorage.forEach(function(item){
        if(item.resourceKey)objStorageState[item.resourceKey]=item.qty||item.sizeGB||0;
      });
      buildObjPanel();
    }

    // Restore Network — populate persistent state BEFORE rebuilding panel
    if(q.network){
      q.network.forEach(function(item){
        if(item.resourceKey==='tx'){
          netState.tx=item.qty||0;
          netState.txQty=item.multiplier||1;
        }else if(item.resourceKey==='vlan'){
          netState.vlan=item.qty||0;
        }else if(item.resourceKey){
          netState.bandwidth=item.resourceKey;
        }
      });
      buildNetPanel();
    }

    // Restore PaaS
    if(q.paas&&q.paas.items){
      q.paas.items.forEach(function(item){
        if(item.resource==='Dynamic Cloudlets'){var e=$('paas_dyn_cld');if(e)e.value=item.qty||0;}
        if(item.resource==='Static Cloudlets'){var e=$('paas_sta_cld');if(e)e.value=item.qty||0;}
        if(item.resource==='Storage'){var e=$('paas_storage');if(e)e.value=item.qty||0;}
        if(item.resource==='External Traffic'){var e=$('paas_traffic');if(e)e.value=item.qty||0;}
      });
    }

    // Restore Data Protection
    if(q.dataProtection&&q.dataProtection.items){
      q.dataProtection.items.forEach(function(item){
        if(item.resource==='Migration')dpState.migration=item.qty||0;
        if(item.resource==='Backup')dpState.backup=item.qty||0;
        if(item.resource==='Backup Capacity')dpState.backupCapacity=item.qty||0;
        if(item.resource==='DR')dpState.dr=item.qty||0;
        if(item.resource==='DR Capacity')dpState.drCapacity=item.qty||0;
      });
      buildDpPanel();
    }

    // Restore Omnifabric
    if(q.omnifabric&&q.omnifabric.items&&q.omnifabric.items.length>0){
      ofInstances=[];
      q.omnifabric.items.forEach(function(item){
        // Find spec index by label
        var specIdx=0;
        OF_PRICE.compute.forEach(function(c,ci){if(c.label===item.spec)specIdx=ci;});
        ofInstances.push({id:ofNextId++,spec:specIdx,qty:item.qty||1,storageGB:item.storageGB||0});
      });
      buildOfPanel();
    }

    // Restore TaaS
    if(q.taas&&q.taas.items&&q.taas.items.length>0){
      // Ensure TaaS models are loaded and panel is built
      if(!taasModels.length){
        await loadTaasModels();
        buildTaasPanel();
      }
      // TaaS panel may still be rendering — wait for inputs to appear
      var taasRetries=0;
      var restoreTaasValues=function(){
        var tel=$('panel-taas');
        if((!tel||!tel.querySelectorAll('.taas-usage').length)&&taasRetries<20){
          taasRetries++;
          setTimeout(restoreTaasValues,300);
          return;
        }
        if(!tel)return;
        q.taas.items.forEach(function(item){
          tel.querySelectorAll('.taas-usage').forEach(function(inp){
            if(inp.dataset.model===item.model){
              inp.value=item.mtokPerMo||0;
            }
          });
        });
        if(typeof updateTaas==='function')updateTaas();
        recalc();
      };
      restoreTaasValues();
    }

    // Trigger recalculation
    recalc();

    if(statusEl)statusEl.innerHTML='<span style="color:var(--green)">\u2713 Quote loaded ('+opportunityId.substring(0,8)+'...)</span>';
    setTimeout(function(){if(statusEl)statusEl.innerHTML='';},4000);
  }catch(e){
    if(statusEl)statusEl.innerHTML='<span style="color:var(--red)">\u2717 Load error</span>';
  }
}
window.loadQuote=loadQuote;

init();
