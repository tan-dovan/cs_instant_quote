var locations=[],pricing={},competitors={},currentLocation=null;
var vmLines=[{id:1,qty:1,name:'VM 1',cpu:0,cpuSpeed:2,ram:0,cpuType:'intel',hypervisor:'kvm',disks:[{type:'dssd',size:0}],localDisk:0,backup:0,gpu:0,gpuType:'gpu_nvidia_a100',ip:0,winOs:'',winOsQty:0,sqlLic:'',sqlLicQty:0,rdsQty:0}];
var nextVmId=2;
var FX={USD:1,CHF:1.12,EUR:1.08,GBP:1.27,CZK:0.045,AUD:0.65,JPY:0.0067,SAR:0.27,TRY:0.031,MXN:0.058,PHP:0.018,MYR:0.22,EGP:0.032,BGN:0.55};
var burstLevels={};
var collapsed={loc:true,cfg:true,vm:true,obj:true,net:true,paas:true,of:true,taas:true,sum:true,cmp:true};
var taasModels=[];
var displayCurrency='USD'; // current display currency code
var localCurrency='EUR';   // local currency for this location
var CC_MAP={CH:'CHF',US:'USD',GB:'GBP',CZ:'CZK',GR:'EUR',AU:'AUD',JP:'JPY',SA:'SAR',TR:'TRY',MX:'MXN',PH:'PHP',MY:'MYR',EG:'EGP',BG:'BGN',DE:'EUR',IE:'EUR',ZA:'MYR',NL:'EUR',SE:'EUR'};

function flag(cc){if(!cc||cc.length!==2)return'';return String.fromCodePoint.apply(null,cc.toUpperCase().split('').map(function(c){return 0x1F1E6+c.charCodeAt(0)-65}))}
function $(id){return document.getElementById(id)}

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
  paas_tx:'External outbound traffic from PaaS environments. Per GB.'
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
function getCpuFreq(){return pricing.cpu_frequency||{min:0.5,max:5.0,default:2.0};}
function getCpuFreqDefault(){return getCpuFreq().default||2.0;}
function getCpuFreq(){return pricing.cpu_frequency||{min:0.5,max:5.0,default:2.0};}
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

/* ── Init ── */
async function init(){
  await loadLocations();
  renderVmTable();buildObjPanel();buildNetPanel();buildPaasPanel();buildOfPanel();
  $('locationSelect').addEventListener('change',onLocationChange);
  $('currencySelect').addEventListener('change',onCurrencyChange);
  await onLocationChange();
  // Load TaaS models in background (non-blocking)
  loadTaasModels().then(function(){buildTaasPanel();renderResourceTable();});
}
async function loadLocations(){var res=await fetch('/api/locations');var data=await res.json();locations=data.objects;var opts=locations.map(function(l){var host=l.api_endpoint.replace('https://','').replace('/api/2.0/','');return'<option value="'+host+'" data-cc="'+l.country_code+'">'+flag(l.country_code)+'  '+l.display_name+'</option>'}).join('');$('locationSelect').innerHTML=opts;if($('adminLocation'))$('adminLocation').innerHTML=opts}

function onCurrencyChange(){
  displayCurrency=$('currencySelect').value;
  renderResourceTable();renderVmTable();buildObjPanel();buildNetPanel();buildPaasPanel();buildOfPanel();buildTaasPanel();recalc();
}

async function onLocationChange(){
  var host=$('locationSelect').value;var cc=$('locationSelect').selectedOptions[0].dataset.cc;
  currentLocation=locations.find(function(l){return l.api_endpoint.includes(host)});
  localCurrency=CC_MAP[cc]||'EUR';
  // Update currency selector
  var csel=$('currencySelect');
  var opts='<option value="USD">USD (US Dollar)</option>';
  if(localCurrency!=='USD')opts+='<option value="'+localCurrency+'">'+localCurrency+' (Local)</option>';
  csel.innerHTML=opts;
  displayCurrency='USD';
  $('currencyInfo').textContent='Local currency: '+localCurrency;
  var results=await Promise.all([fetch('/api/pricing/'+host),fetch('/api/competitors/'+cc)]);
  pricing=await results[0].json();competitors=await results[1].json();
  burstLevels=pricing.current||{};
  // Clamp cpuSpeed to location limits
  var cf=getCpuFreq();
  vmLines.forEach(function(vm){
    if(vm.cpuSpeed<cf.min)vm.cpuSpeed=cf.min;
    if(vm.cpuSpeed>cf.max)vm.cpuSpeed=cf.max;
  });
  renderResourceTable();renderVmTable();buildObjPanel();buildNetPanel();buildPaasPanel();buildOfPanel();buildTaasPanel();recalc();
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
    h+='<div class="vm-row'+(ok?'':' vm-row-disabled')+'"><div class="vm-row-label">'+r.label+' '+infoBubble(r.key)+freeTag(r.key)+'</div>';
    h+='<div class="vm-row-input"><input type="number" id="sl_'+r.key+'" min="0" max="50000" step="100" value="0"'+(ok?'':' disabled')+'> <span class="vm-row-unit">GB/mo</span></div>';
    h+=priceCell(0,0,'ps_'+r.key,'pb_'+r.key)+'</div>';
  });
  el.innerHTML=h;
  items.forEach(function(r){
    if(!avail.includes(r.key))return;
    var inp=$('sl_'+r.key);
    function update(){var v=parseInt(inp.value)||0;var e1=$('ps_'+r.key),e2=$('pb_'+r.key);if(e1)e1.textContent=fmt(v*csSubPrice(r.key));if(e2)e2.textContent=fmt(v*csBurstPrice(r.key));recalc();}
    inp.addEventListener('input',update);inp.addEventListener('change',update);
  });
}

/* ────── Network ────── */
function buildNetPanel(){
  var avail=pricing.resource_types?Object.keys(pricing.resource_types):[];
  var el=$('panel-network');var h='';
  var txOk=avail.includes('tx');
  h+='<div class="vm-row'+(txOk?'':' vm-row-disabled')+'"><div class="vm-row-label">Traffic '+infoBubble('tx')+freeTag('tx')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="sl_tx" min="0" max="100000" step="100" value="0"'+(txOk?'':' disabled')+'> <span class="vm-row-unit">GB/mo</span>';
  h+=' &times; <input type="number" id="qty_tx" value="1" min="1" max="100"'+(txOk?'':' disabled')+' style="width:55px"></div>';
  h+=priceCell(0,0,'ps_net_tx','pb_net_tx')+'</div>';

  var bwKeys=avail.filter(function(k){return k.indexOf('bandwidth_')===0;}).sort(function(a,b){return(parseInt(a.split('_')[1])||0)-(parseInt(b.split('_')[1])||0);});
  h+='<div class="vm-row'+(bwKeys.length?'':' vm-row-disabled')+'"><div class="vm-row-label">Bandwidth '+infoBubble('bandwidth')+'</div>';
  h+='<div class="vm-row-input"><select id="sl_bandwidth"'+(bwKeys.length?'':' disabled')+'><option value="">None</option>';
  bwKeys.forEach(function(k){var s=k.replace('bandwidth_','');var label=parseInt(s)>=1000?(parseInt(s)/1000)+' Gbps':s+' Mbps';h+='<option value="'+k+'">'+label+'</option>';});
  h+='</select></div>';
  h+=priceCell(0,0,'ps_net_bandwidth','pb_net_bandwidth')+'</div>';

  var vlanOk=avail.includes('vlan');
  h+='<div class="vm-row'+(vlanOk?'':' vm-row-disabled')+'"><div class="vm-row-label">VLAN '+infoBubble('vlan')+freeTag('vlan')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="sl_vlan" min="0" max="10" step="1" value="0"'+(vlanOk?'':' disabled')+'> <span class="vm-row-unit">VLANs</span></div>';
  h+=priceCell(0,0,'ps_net_vlan','pb_net_vlan')+'</div>';

  el.innerHTML=h;
  function updateNet(){
    var txV=(parseInt($('sl_tx').value)||0)*(parseInt($('qty_tx').value)||1);
    var e1=$('ps_net_tx'),e2=$('pb_net_tx');if(e1)e1.textContent=fmt(txV*csSubPrice('tx'));if(e2)e2.textContent=fmt(txV*csBurstPrice('tx'));
    var bwKey=$('sl_bandwidth').value;var bwS=bwKey?csSubPrice(bwKey):0,bwB=bwKey?csBurstPrice(bwKey):0;
    var e3=$('ps_net_bandwidth'),e4=$('pb_net_bandwidth');if(e3)e3.textContent=fmt(bwS);if(e4)e4.textContent=fmt(bwB);
    var vlV=parseInt($('sl_vlan').value)||0;var e5=$('ps_net_vlan'),e6=$('pb_net_vlan');if(e5)e5.textContent=fmt(vlV*csSubPrice('vlan'));if(e6)e6.textContent=fmt(vlV*csBurstPrice('vlan'));
    recalc();
  }
  ['sl_tx','qty_tx','sl_bandwidth','sl_vlan'].forEach(function(id){var e=$(id);if(e){e.addEventListener('input',updateNet);e.addEventListener('change',updateNet);}});
}

/* ────── PaaS (Cloudlet-based) ────── */
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
  h+='<table class="res-price-table"><thead><tr><th>Instance</th><th>Spec</th><th>Qty</th><th>Storage (GB)</th><th>Monthly</th><th></th></tr></thead><tbody>';
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
    h+='<td style="font-weight:600">'+fmt(mo)+'</td>';
    h+='<td><button onclick="removeOfInstance('+inst.id+')" style="background:none;border:none;color:var(--red,#e74c3c);cursor:pointer;font-size:1rem">\u2716</button></td>';
    h+='</tr>';
  });
  h+='</tbody></table>';
  h+='<button onclick="addOfInstance()" style="margin-top:.5rem;padding:.3rem .8rem;font-size:.78rem;background:var(--cs-green);color:#fff;border:none;border-radius:4px;cursor:pointer">+ Add Instance</button>';
  var total=calcOmnifabric();
  h+='<div style="text-align:right;margin-top:.5rem;font-size:.9rem;font-weight:700;color:var(--cs-green)">Omnifabric Total: '+fmt(total)+'/mo</div>';
  el.innerHTML=h;
  recalc();
}

function buildPaasPanel(){
  var el=$('panel-paas');if(!el)return;
  var h='';
  h+='<div style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-secondary)">1 cloudlet = 128 MB RAM + 400 MHz CPU</div>';

  // Dynamic cloudlets (auto-scaling)
  h+='<div class="vm-row"><div class="vm-row-label">Dynamic Cloudlets '+infoBubble('paas_dyn')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_dyn_cld" min="0" max="256" value="0"> <span class="vm-row-unit">cloudlets</span></div>';
  h+=priceCell(0,0,'ps_paas_dyn','pb_paas_dyn')+'</div>';

  // Static cloudlets (reserved)
  h+='<div class="vm-row"><div class="vm-row-label">Static Cloudlets '+infoBubble('paas_sta')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_sta_cld" min="0" max="256" value="0"> <span class="vm-row-unit">cloudlets</span></div>';
  h+=priceCell(0,0,'ps_paas_sta','pb_paas_sta')+'</div>';

  // Storage
  h+='<div class="vm-row"><div class="vm-row-label">Storage '+infoBubble('paas_sto')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_storage" min="0" max="10000" step="10" value="0"> <span class="vm-row-unit">GB</span></div>';
  h+=priceCell(0,0,'ps_paas_sto','pb_paas_sto')+'</div>';

  // Traffic
  h+='<div class="vm-row"><div class="vm-row-label">External Traffic '+infoBubble('paas_tx')+'</div>';
  h+='<div class="vm-row-input"><input type="number" id="paas_traffic" min="0" max="100000" step="100" value="0"> <span class="vm-row-unit">GB/mo</span></div>';
  h+=priceCell(0,0,'ps_paas_tx','pb_paas_tx')+'</div>';

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
    s('ps_paas_dyn',dynMo);s('pb_paas_dyn',dynMo);
    s('ps_paas_sta',staMo);s('pb_paas_sta',staMo);
    s('ps_paas_sto',stoMo);s('pb_paas_sto',stoMo);
    s('ps_paas_tx',txMo);s('pb_paas_tx',txMo);

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

  var h='<div style="margin-bottom:.75rem;font-size:.85rem;color:var(--text-secondary)">AI model pricing per million tokens (input/output). Select models and estimate monthly usage.</div>';

  // Model selector table
  h+='<table class="res-price-table"><thead><tr><th>Model</th><th>Supplier</th><th>Input</th><th>Output</th><th style="width:120px">M tokens/mo</th><th style="width:90px">Monthly</th></tr></thead><tbody>';

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
      h+='<td class="taas-cost" id="taas_cost_'+m.id.replace(/[^a-zA-Z0-9]/g,'_')+'" style="font-size:.78rem;font-weight:600">$0.00</td>';
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
  var objT=0;['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){var s=$('sl_'+k);if(s)objT+=parseFloat(s.value)*priceFn(k);});
  if(objT>0)bd['\uD83D\uDDC4\uFE0F Object Storage']=objT;
  var netT=0;var txSl=$('sl_tx'),txQt=$('qty_tx');if(txSl&&txQt)netT+=(parseInt(txQt.value)||1)*parseFloat(txSl.value)*priceFn('tx');
  var bwKey=$('sl_bandwidth');if(bwKey&&bwKey.value)netT+=priceFn(bwKey.value);
  var vlSl=$('sl_vlan');if(vlSl)netT+=parseFloat(vlSl.value)*priceFn('vlan');
  if(netT>0)bd['\uD83C\uDF10 Network']=netT;
  var total=0;for(var k in bd)total+=bd[k];return{total:total,breakdown:bd};
}
function addBurstOnlyItems(r){
  var paasT=calcPaas();if(paasT>0){r.breakdown['\u2601\uFE0F PaaS']=paasT;r.total+=paasT;}
  var ofT=calcOmnifabric();if(ofT>0){r.breakdown['\uD83D\uDDC4\uFE0F Omnifabric']=ofT;r.total+=ofT;}
  var taasT=calcTaas();if(taasT>0){r.breakdown['\uD83E\uDD16 TaaS']=taasT;r.total+=taasT;}
  return r;
}
function calcCS(){return calcCSMode(csSubPrice);}
function calcCSBurst(){return calcCSMode(csBurstPrice);}
function calcCSSmart(){
  var r=addBurstOnlyItems(calcCSMode(csSmartPrice));
  r.subTotal=calcCS().total;
  r.burstTotal=r.total-r.subTotal;
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
  var objT=0;['obj_hdd','obj_nvme','obj_caching'].forEach(function(k){var s=$('sl_'+k);if(s)objT+=parseFloat(s.value)*(prov.obj_storage||0.023);});
  if(objT>0)bd['\uD83D\uDDC4\uFE0F Object Storage']=objT;
  var netT=0;var txSl=$('sl_tx'),txQt=$('qty_tx');if(txSl&&txQt)netT+=(parseInt(txQt.value)||1)*parseFloat(txSl.value)*(prov.bandwidth||0.09);
  if(netT>0)bd['\uD83C\uDF10 Network']=netT;
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
  // Floating total box
  var fb=$('floatBreakdown');
  if(fb){
    var fh='';
    for(var fk in csSmart.breakdown){
      fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.72rem;color:var(--text-secondary);white-space:nowrap">'+fk+'</span><span style="font-size:.8rem;font-weight:600;color:var(--text);white-space:nowrap">'+fmt(csSmart.breakdown[fk])+'</span></div>';
    }
    fh+='<div style="border-top:1px solid var(--border-color);margin-top:.4rem;padding-top:.3rem">';
    fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.7rem;color:var(--green)">Subscription</span><span style="font-size:.82rem;font-weight:600;color:var(--green)">'+fmt(csSmart.subTotal)+'</span></div>';
    fh+='<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.7rem;color:var(--orange)">Burst</span><span style="font-size:.82rem;font-weight:600;color:var(--orange)">'+fmt(csSmart.burstTotal)+'</span></div>';
    fh+='</div>';
    fh+='<div style="border-top:2px solid var(--cs-green);margin-top:.3rem;padding-top:.4rem;display:flex;justify-content:space-between;align-items:baseline;gap:.5rem"><span style="font-size:.75rem;font-weight:700;color:var(--cs-green)">TOTAL</span><span style="font-size:1.05rem;font-weight:700;color:var(--green)">'+fmt(csSmart.total)+'</span></div>';
    fb.innerHTML=fh;
  }
  renderBd('csBreakdown',csSmart.breakdown,csSmart.total);
  $('csTotal').textContent=fmt(csSmart.total);$('csTotal').style.color=csSmart.total<=best.total?'var(--green)':'var(--cs-green)';
  renderBd('bestBreakdown',best.breakdown,best.total,csSmart.total);
  $('bestTotal').textContent=fmt(best.total)+' ('+best.name+')';$('bestTotal').style.color=best.total<=csSmart.total?'var(--green)':'var(--red)';
  var provs=[{name:'CloudSigma',tag:'cloudsigma',region:currentLocation.display_name,total:csSmart.total}].concat(all);
  $('compGrid').innerHTML=provs.map(function(p){var diff=p.total-cs.total;var pct=cs.total>0?Math.round((diff/cs.total)*100):0;var sav='';if(p.tag==='cloudsigma'){sav=cs.total<=best.total?'<div class="comp-savings" style="color:var(--green)">\u2713 Cheapest</div>':'<div class="comp-savings" style="color:var(--orange)">Not cheapest</div>'}else if(diff>0){sav='<div class="comp-savings" style="color:var(--red)">+'+fmt(diff)+' (+'+pct+'%)</div>'}else if(diff<0){sav='<div class="comp-savings" style="color:var(--green)">'+fmt(diff)+' ('+pct+'%)</div>'}else{sav='<div class="comp-savings" style="color:var(--text-secondary)">Same</div>'}return'<div class="comp-card '+p.tag+'"><div class="comp-name">'+p.name+'</div><div class="comp-region">'+p.region+'</div><div class="comp-cost">'+fmt(p.total)+'</div>'+sav+'</div>'}).join('');
}
function renderBd(elId,bd,total,cmpT){
  var el=$(elId);var h='';
  for(var l in bd){var c=bd[l];var pct=total>0?Math.round((c/total)*100):0;h+='<div class="breakdown-row"><span>'+l+'</span><span>'+fmt(c)+' <span style="color:var(--text-secondary);font-size:.75rem">('+pct+'%)</span></span></div>';}
  h+='<div class="breakdown-row total"><span>Total</span><span>'+fmt(total)+'</span></div>';
  if(cmpT!==undefined){var diff=total-cmpT;var cls=diff>0?'loss':'savings';var sign=diff>0?'+':'';h+='<div class="breakdown-row '+cls+'" style="font-weight:600"><span>vs CloudSigma</span><span>'+sign+fmt(diff)+'</span></div>';}
  el.innerHTML=h;
}

/* ────── PDF Export ────── */
function exportPDF(){
  var cs=calcCS(),csB=calcCSBurst();
  var sub1Y=cs.total*0.90,sub3Y=cs.total*0.75;
  var curLabel=displayCurrency;
  var w=window.open('','_blank');
  var html='<html><head><title>CloudSigma Quote</title><style>';
  html+='body{font-family:Arial,sans-serif;padding:40px;color:#222;max-width:950px;margin:0 auto}';
  html+='h1{color:#0099cc;margin-bottom:5px}h2{color:#333;border-bottom:2px solid #0099cc;padding-bottom:5px;margin-top:25px}';
  html+='table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #ddd;font-size:13px}';
  html+='th{background:#f5f5f5;font-weight:600}.total-row{font-weight:700;border-top:2px solid #0099cc;font-size:14px}';
  html+='.green{color:#059669}.orange{color:#d97706}.muted{color:#888;font-size:11px}.blue{color:#2563eb}';
  html+='.discount-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:15px;margin:15px 0}';
  html+='.discount-box h3{margin:0 0 10px;color:#059669}';
  html+='</style></head><body>';
  html+='<h1>CloudSigma Pricing Quote</h1>';
  html+='<p class="muted">Location: '+currentLocation.display_name+' &bull; Currency: '+curLabel+' &bull; Generated: '+new Date().toLocaleDateString()+'</p>';

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

  // PaaS section in PDF
  var paasT=calcPaas();
  if(paasT>0){
    var dynC=parseInt(($('paas_dyn_cld')||{}).value)||0;
    var staC=parseInt(($('paas_sta_cld')||{}).value)||0;
    var stoGB=parseInt(($('paas_storage')||{}).value)||0;
    var txGB=parseInt(($('paas_traffic')||{}).value)||0;
    html+='<h2>PaaS (Cloudlets)</h2>';
    html+='<table><tr><th>Resource</th><th>Config</th><th class="green">Monthly</th></tr>';
    if(dynC>0)html+='<tr><td>Dynamic Cloudlets</td><td>'+dynC+' cld ('+dynC*128+' MB / '+dynC*400+' MHz)</td><td class="green">'+fmt(dynC*PAAS_PRICE.dynamicCloudlet*730)+'</td></tr>';
    if(staC>0)html+='<tr><td>Static Cloudlets</td><td>'+staC+' cld ('+staC*128+' MB / '+staC*400+' MHz)</td><td class="green">'+fmt(staC*PAAS_PRICE.staticCloudlet*730)+'</td></tr>';
    if(stoGB>0)html+='<tr><td>Storage</td><td>'+stoGB+' GB</td><td class="green">'+fmt(stoGB*PAAS_PRICE.storagePerGBh*730)+'</td></tr>';
    if(txGB>0)html+='<tr><td>External Traffic</td><td>'+txGB+' GB</td><td class="green">'+fmt(txGB*PAAS_PRICE.trafficPerGB)+'</td></tr>';
    html+='<tr class="total-row"><td>PaaS Total</td><td></td><td class="green">'+fmt(paasT)+'</td></tr>';
    html+='</table>';
  }

  // Omnifabric section in PDF
  var ofT=calcOmnifabric();
  if(ofT>0){
    html+='<h2>Omnifabric</h2>';
    html+='<table><tr><th>Instance</th><th>Spec</th><th>Qty</th><th>Storage</th><th class="green">Monthly</th></tr>';
    ofInstances.forEach(function(inst,idx){
      var spec=OF_PRICE.compute[inst.spec]||OF_PRICE.compute[0];
      var mo=spec.priceHr*730*inst.qty + inst.storageGB*OF_PRICE.storagePerGBmo;
      html+='<tr><td>Instance '+(idx+1)+'</td><td>'+spec.label+'</td><td>'+inst.qty+'</td><td>'+inst.storageGB+' GB</td><td class="green">'+fmt(mo)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>Omnifabric Total</td><td></td><td></td><td></td><td class="green">'+fmt(ofT)+'</td></tr>';
    html+='</table>';
  }

  // TaaS section in PDF
  var taasT=calcTaas();
  if(taasT>0){
    html+='<h2>TaaS (AI Models)</h2>';
    html+='<table><tr><th>Model</th><th>M tokens/mo</th><th class="green">Monthly</th></tr>';
    var tel=$('panel-taas');
    if(tel)tel.querySelectorAll('.taas-usage').forEach(function(inp){
      var mtok=parseFloat(inp.value)||0;
      if(mtok<=0)return;
      var pIn=parseFloat(inp.dataset.input)||0;
      var pOut=parseFloat(inp.dataset.output)||0;
      var cost=mtok*(pIn*0.5+pOut*0.5);
      html+='<tr><td>'+inp.dataset.model+'</td><td>'+mtok+'</td><td class="green">'+fmt(cost)+'</td></tr>';
    });
    html+='<tr class="total-row"><td>TaaS Total</td><td></td><td class="green">'+fmt(taasT)+'</td></tr>';
    html+='</table>';
  }

  html+='<h2>Monthly Totals</h2><table>';
  html+='<tr class="total-row"><td>Subscription (Monthly)</td><td></td><td class="green">'+fmt(cs.total)+'</td><td></td></tr>';
  html+='<tr class="total-row"><td>Burst (Current)</td><td></td><td class="orange">'+fmt(csB.total)+'</td><td></td></tr>';
  html+='</table>';

  html+='<div class="discount-box"><h3>\uD83D\uDCB0 Subscription Commitment Discounts</h3><table>';
  html+='<tr><th>Commitment</th><th>Discount</th><th>Monthly</th><th>Annual</th><th>Savings/yr</th></tr>';
  html+='<tr><td>Monthly</td><td>\u2014</td><td class="green">'+fmt(cs.total)+'</td><td>'+fmt(cs.total*12)+'</td><td>\u2014</td></tr>';
  html+='<tr style="background:#f0fdf4"><td><strong>1 Year</strong></td><td class="blue"><strong>10%</strong></td><td class="green"><strong>'+fmt(sub1Y)+'</strong></td><td><strong>'+fmt(sub1Y*12)+'</strong></td><td class="green"><strong>'+fmt(cs.total*12-sub1Y*12)+'</strong></td></tr>';
  html+='<tr style="background:#ecfdf5"><td><strong>3 Year</strong></td><td class="blue"><strong>25%</strong></td><td class="green"><strong>'+fmt(sub3Y)+'</strong></td><td><strong>'+fmt(sub3Y*12)+'</strong></td><td class="green"><strong>'+fmt(cs.total*12-sub3Y*12)+'</strong></td></tr>';
  html+='</table></div>';

  html+='<p class="muted" style="margin-top:30px">Estimate only. Subscription = level 0 (monthly). Burst = current load pricing. Commitment discounts apply to subscription only.</p>';
  html+='</body></html>';
  w.document.write(html);w.document.close();
  setTimeout(function(){w.print();},500);
}
window.exportPDF=exportPDF;

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
init();
