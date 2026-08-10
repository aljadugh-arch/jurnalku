(function(){
const token=()=>localStorage.getItem('jurnalku_token')||'';
const api=(url,opt={})=>fetch('/api'+url,{...opt,headers:{'Authorization':'Bearer '+token(),...(opt.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(opt.headers||{})}}).then(r=>r.json());
const style=document.createElement('style');style.textContent='.pf-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin:14px 0;box-shadow:0 1px 2px #0001}.pf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pf-input{border:1px solid #ddd;padding:8px;border-radius:8px;min-width:0;font-size:13px}.pf-btn{padding:8px 14px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:13px}.pf-primary{background:#2563eb;color:white;border-color:#2563eb}.pf-danger{border-color:#fca5a5;color:#dc2626}.pf-success{background:#16a34a;color:white;border-color:#16a34a}.pf-muted{font-size:12px;color:#666}.pf-scroll{overflow:auto;max-width:100%}.pf-badge-ok{background:#dcfce7;color:#166534;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}.pf-badge-fail{background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}@media(max-width:768px){.pf-row{flex-direction:column;align-items:stretch}.pf-row>*{width:100%!important}}table.pf-table{width:100%;border-collapse:collapse;font-size:13px}table.pf-table th{background:#f9fafb;text-align:left;padding:8px 10px;font-weight:600;position:sticky;top:0}table.pf-table td{padding:8px 10px;border-top:1px solid #f0f0f0}.pf-select{border:1px solid #ddd;padding:7px 10px;border-radius:8px;font-size:13px;background:#fff;min-width:140px}';document.head.appendChild(style);

function isLoggedIn(){return !!token()}

/* ======================== JAMAAH REKAP ======================== */
let jamaahReady=false;
function jamaahPage(){
  if(!isLoggedIn())return;
  if(!(location.pathname.includes('/admin/absensi-kegiatan')&&location.hash==='#jamaah'))return;
  if(jamaahReady)return; jamaahReady=true;
  setTimeout(()=>{
    const root=document.querySelector('main .space-y-6, main > div, main')||document.body;
    if(!root)return;
    // Sembunyikan konten existing di dalam main saja, bukan sidebar
    const main=document.querySelector('main');
    if(main){[...main.children].forEach(ch=>{if(ch.id!=='jamaah-full-page')ch.style.display='none'});}
    if(document.getElementById('jamaah-full-page'))return;
    const d=document.createElement('div');d.id='jamaah-full-page';d.className='space-y-6';d.style.padding='16px';d.style.paddingBottom='96px';d.style.display='block';
    d.innerHTML='<div><h1 style="font-size:22px;font-weight:700;margin:0 0 4px">Absensi Jamaah Sholat</h1><p class="pf-muted">Input jumlah kehadiran per siswa. Lolos jika >= batas minimal.</p></div><div class="pf-card"><div class="pf-row" style="margin-bottom:10px"><input id="aj_nama" class="pf-input" value="Shalat Jamaah" style="flex:1"><input id="aj_periode" class="pf-input" placeholder="Periode: 1-7 Agustus 2026" style="flex:2"><input id="aj_min" class="pf-input" type="number" value="10" min="1" style="width:80px"><select id="aj_rombel" class="pf-select"><option value="">Semua Rombel</option></select></div><div class="pf-row"><button id="aj_tab_input" class="pf-btn pf-primary">Input</button><button id="aj_tab_rekap" class="pf-btn">Rekap</button><button id="aj_all_min" class="pf-btn">Semua=Min</button><button id="aj_all_zero" class="pf-btn">Semua=0</button><button id="aj_save" class="pf-btn pf-success" style="margin-left:auto">Simpan</button></div></div><div id="aj_input_section" class="pf-card" style="padding:0;overflow:hidden"><div class="pf-scroll" style="max-height:420px"><table class="pf-table"><thead><tr><th style="width:30px">#</th><th>Siswa</th><th style="width:70px;text-align:center">Hadir</th><th style="width:90px;text-align:center">Ket</th></tr></thead><tbody id="aj_tbody"></tbody></table></div></div><div id="aj_rekap_section" class="pf-card" style="padding:0;overflow:hidden;display:none"><div class="pf-scroll" style="max-height:420px"><table class="pf-table"><thead><tr><th>#</th><th>Siswa</th><th style="text-align:center">Periode</th><th style="text-align:center">Hadir</th><th style="text-align:center">Min</th><th style="text-align:center">Ket</th></tr></thead><tbody id="aj_rekap_tbody"></tbody></table></div></div><div id="aj_msg" class="pf-muted"></div>';
    root.appendChild(d);
    let allSiswa=[],rombels=[],kehadiran={};
    const tbody=document.getElementById('aj_tbody'),rekapTbody=document.getElementById('aj_rekap_tbody'),msg=document.getElementById('aj_msg');
    async function loadData(){try{allSiswa=await api('/siswa');kehadiran={};allSiswa.forEach(s=>{kehadiran[s.id]=0})}catch{msg.textContent='Gagal memuat siswa'}try{rombels=await api('/rombel');const sel=document.getElementById('aj_rombel');rombels.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.nama;sel.appendChild(o)})}catch{}renderTable()}
    function getFiltered(){const rid=document.getElementById('aj_rombel').value;return rid?allSiswa.filter(s=>s.rombel_id===rid):allSiswa}
    function renderTable(){const min=Number(document.getElementById('aj_min').value)||1;const list=getFiltered();tbody.innerHTML=list.map((s,i)=>{const jml=kehadiran[s.id]||0;const lulus=jml>=min;return'<tr><td style="color:#999">'+(i+1)+'</td><td><b>'+s.nama+'</b><div class="pf-muted">'+(s.nis||'')+' - '+(s.rombel_nama||'-')+'</div></td><td style="text-align:center"><input type="number" min="0" value="'+jml+'" data-sid="'+s.id+'" class="pf-input" style="width:50px;text-align:center"></td><td style="text-align:center"><span class="'+(lulus?'pf-badge-ok':'pf-badge-fail')+'">'+(lulus?'Lolos':'Tdk')+'</span></td></tr>'}).join('');tbody.querySelectorAll('input[type=number]').forEach(inp=>{inp.addEventListener('input',()=>{kehadiran[inp.dataset.sid]=Number(inp.value)||0;renderTable()})})}
    document.getElementById('aj_rombel').addEventListener('change',renderTable);
    document.getElementById('aj_min').addEventListener('input',renderTable);
    document.getElementById('aj_all_min').onclick=()=>{const min=Number(document.getElementById('aj_min').value)||1;getFiltered().forEach(s=>{kehadiran[s.id]=min});renderTable()};
    document.getElementById('aj_all_zero').onclick=()=>{getFiltered().forEach(s=>{kehadiran[s.id]=0});renderTable()};
    document.getElementById('aj_tab_input').onclick=()=>{document.getElementById('aj_input_section').style.display='';document.getElementById('aj_rekap_section').style.display='none';document.getElementById('aj_tab_input').className='pf-btn pf-primary';document.getElementById('aj_tab_rekap').className='pf-btn'};
    document.getElementById('aj_tab_rekap').onclick=async()=>{document.getElementById('aj_input_section').style.display='none';document.getElementById('aj_rekap_section').style.display='';document.getElementById('aj_tab_rekap').className='pf-btn pf-primary';document.getElementById('aj_tab_input').className='pf-btn';try{const r=await api('/jamaah/rekap-manual?minimal_hadir='+(document.getElementById('aj_min').value||10));const rows=r.rows||[];rekapTbody.innerHTML=rows.length?rows.map((x,i)=>'<tr><td style="color:#999">'+(i+1)+'</td><td><b>'+x.nama+'</b><div class="pf-muted">'+(x.nis||'')+'</div></td><td style="text-align:center;font-size:11px">'+x.periode+'</td><td style="text-align:center;font-weight:600">'+x.jumlah_hadir+'</td><td style="text-align:center">'+x.minimal_hadir+'</td><td style="text-align:center"><span class="'+(x.hasil==='lolos'?'pf-badge-ok':'pf-badge-fail')+'">'+(x.hasil==='lolos'?'Lolos':'Tdk')+'</span></td></tr>').join(''):'<tr><td colspan="6" style="text-align:center;padding:20px;color:#999">Belum ada rekap</td></tr>'}catch{rekapTbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:20px;color:#c00">Gagal</td></tr>'}};
    document.getElementById('aj_save').onclick=async()=>{const periode=document.getElementById('aj_periode').value;if(!periode){msg.textContent='Isi periode dulu';return}const min=Number(document.getElementById('aj_min').value)||10;const data=getFiltered().map(s=>({siswa_id:s.id,jumlah_hadir:kehadiran[s.id]||0}));try{const r=await api('/jamaah/rekap-manual',{method:'POST',body:JSON.stringify({nama:document.getElementById('aj_nama').value,periode,minimal_hadir:min,data})});msg.textContent=r.message||('Tersimpan: '+r.count+' data')}catch{msg.textContent='Gagal menyimpan'}};
    loadData();
  },400);
}
function jamaahClean(){if(!(location.pathname.includes('/admin/absensi-kegiatan')&&location.hash==='#jamaah')){jamaahReady=false;document.getElementById('jamaah-full-page')?.remove();const main=document.querySelector('main');if(main)[...main.children].forEach(ch=>ch.style.display='')}}

/* ======================== WA QR ======================== */
let waReady=false;
function waPage(){
  if(!isLoggedIn())return;
  if(!location.pathname.includes('/admin/wa-gateway'))return;
  if(waReady)return;waReady=true;
  setTimeout(()=>{
    const main=document.querySelector('main');if(!main)return;
    const anchor=main.querySelector('.space-y-6');if(!anchor)return;
    if(document.getElementById('patch-wa-qr'))return;
    const d=document.createElement('div');d.id='patch-wa-qr';d.className='pf-card';
    d.innerHTML='<h2 style="font-weight:600;margin:0 0 10px">Koneksi WhatsApp</h2><div class="pf-row" style="margin-bottom:10px"><div id="wa_status_dot" style="width:12px;height:12px;border-radius:50%;background:#ef4444"></div><span id="wa_status_text" style="font-weight:500">Tidak terhubung</span><span id="wa_phone" class="pf-muted"></span></div><div class="pf-row"><button id="wa_connect" class="pf-btn pf-primary">Hubungkan / QR</button><button id="wa_refresh" class="pf-btn">Cek Status</button><button id="wa_logout" class="pf-btn pf-danger">Logout</button></div><div id="wa_error" class="pf-muted" style="color:#dc2626;margin-top:6px"></div><div id="wa_qr_box" style="margin-top:12px;display:none;text-align:center"><p class="pf-muted" style="margin-bottom:8px">Scan QR dengan WhatsApp > Perangkat Tertaut:</p><img id="wa_qr_img" style="width:260px;max-width:100%;border:1px solid #ddd;border-radius:12px;padding:8px;background:white"><p class="pf-muted" style="margin-top:6px">QR refresh otomatis</p></div>';
    anchor.insertBefore(d,anchor.children[1]||null);
    let pollId=null;
    async function checkStatus(){try{const r=await api('/wa-gateway/status');const dot=document.getElementById('wa_status_dot'),txt=document.getElementById('wa_status_text'),ph=document.getElementById('wa_phone'),err=document.getElementById('wa_error');if(r.status==='connected'){dot.style.background='#22c55e';txt.textContent='Terhubung';ph.textContent=r.phone?('No: '+r.phone):'';err.textContent='';document.getElementById('wa_qr_box').style.display='none';if(pollId){clearInterval(pollId);pollId=null}}else if(r.status==='connecting'){dot.style.background='#eab308';txt.textContent='Menghubungkan...';ph.textContent=''}else{dot.style.background='#ef4444';txt.textContent='Tidak terhubung';ph.textContent=''}if(r.last_error)err.textContent=r.last_error}catch{}}
    document.getElementById('wa_refresh').onclick=checkStatus;
    document.getElementById('wa_connect').onclick=async()=>{document.getElementById('wa_error').textContent='';document.getElementById('wa_status_text').textContent='Menghubungkan...';document.getElementById('wa_status_dot').style.background='#eab308';try{await api('/wa-gateway/connect',{method:'POST',body:'{}'})}catch{}if(pollId)clearInterval(pollId);let tries=0;pollId=setInterval(async()=>{tries++;if(tries>60){clearInterval(pollId);pollId=null;return}try{const r=await api('/wa-gateway/qr-image');if(r.image){document.getElementById('wa_qr_box').style.display='';document.getElementById('wa_qr_img').src=r.image}if(r.status==='connected'){clearInterval(pollId);pollId=null;document.getElementById('wa_qr_box').style.display='none';checkStatus()}}catch{}},3000)};
    document.getElementById('wa_logout').onclick=async()=>{if(!confirm('Logout WhatsApp?'))return;try{await api('/wa-gateway/logout',{method:'POST',body:'{}'})}catch{}document.getElementById('wa_qr_box').style.display='none';if(pollId){clearInterval(pollId);pollId=null}checkStatus()};
    checkStatus();
  },400);
}
function waClean(){if(!location.pathname.includes('/admin/wa-gateway')){waReady=false;document.getElementById('patch-wa-qr')?.remove()}}

/* ======================== TAGIHAN ROMBEL FILTER ======================== */
let tagihanReady=false;
function tagihanPage(){
  if(!isLoggedIn())return;
  if(!location.pathname.includes('/admin/tagihan'))return;
  if(location.hash==='#keuangan')return;
  if(document.getElementById('pf-tag-rombel'))return;
  const main=document.querySelector('main');if(!main)return;
  const searchWrap=main.querySelector('.relative')||main.querySelector('input[type="text"]')?.parentElement;
  if(!searchWrap)return;
  tagihanReady=true;
  // Add rombel select next to search
  const sel=document.createElement('select');
  sel.id='pf-tag-rombel';
  sel.style.cssText='padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;min-width:150px;margin-left:8px';
  sel.innerHTML='<option value="">Semua Rombel</option>';
  const parent=searchWrap.parentElement;
  if(parent){parent.style.display='flex';parent.style.gap='8px';parent.style.alignItems='center';parent.style.flexWrap='wrap';parent.appendChild(sel)}
  api('/rombel').then(rombels=>{rombels.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.nama;sel.appendChild(o)})});
  sel.addEventListener('change',async()=>{
    const rid=sel.value;
    let url='/tagihan?';
    if(rid)url+='rombel_id='+rid+'&';
    const activeBtn=[...main.querySelectorAll('button')].find(b=>(b.classList.contains('bg-red-600')&&b.classList.contains('text-white'))||(b.classList.contains('bg-green-600')&&b.classList.contains('text-white')));
    if(activeBtn){if(activeBtn.textContent.includes('Belum'))url+='status=belum_bayar&';else if(activeBtn.textContent.includes('Lunas'))url+='status=lunas&'}
    try{
      const data=await api(url);
      const tbody=main.querySelector('table tbody')||main.querySelector('tbody');
      if(!tbody)return;
      const fmt=n=>'Rp '+Number(n).toLocaleString('id-ID');
      if(!data.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:20px;color:#999">Tidak ada data untuk rombel ini</td></tr>';return}
      tbody.innerHTML=data.map(t=>{
        const cls=t.status==='lunas'?'bg-green-100 text-green-700':'bg-red-100 text-red-700';
        const stxt=t.status==='lunas'?'Lunas':'Belum Bayar';
        return '<tr class="border-t hover:bg-gray-50"><td class="px-3 py-2.5"><div class="font-medium text-gray-800">'+t.siswa_nama+'</div><div style="font-size:11px;color:#999">'+(t.nis||'')+(t.rombel_nama?' \u2022 '+t.rombel_nama:'')+'</div></td><td class="px-3 py-2.5 text-sm">'+(t.jenis_nama||'-')+'</td><td class="px-3 py-2.5 text-sm">'+(t.bulan||'-')+' '+(t.tahun||'')+'</td><td class="px-3 py-2.5 text-sm font-medium">'+fmt(t.nominal)+'</td><td class="px-3 py-2.5"><span class="px-2 py-1 rounded-full text-xs font-medium '+cls+'">'+stxt+'</span></td><td class="px-3 py-2.5 text-sm text-gray-500">'+(t.tanggal_bayar||'-')+'</td><td class="px-3 py-2.5"></td></tr>'
      }).join('');
    }catch{}
  });
}
function tagihanClean(){if(!location.pathname.includes('/admin/tagihan')){tagihanReady=false;document.getElementById('pf-tag-rombel')?.remove()}}

/* ======================== TABUNGAN ROMBEL FILTER ======================== */
let tabunganReady=false;
function tabunganPage(){
  if(!isLoggedIn())return;
  if(!location.pathname.includes('/admin/tabungan')&&!location.pathname.includes('/admin/bendahara'))return;
  if(document.getElementById('pf-tab-rombel'))return;
  const main=document.querySelector('main');if(!main)return;
  const searchWrap=main.querySelector('.relative')||main.querySelector('input[type="text"]')?.parentElement;
  if(!searchWrap)return;
  tabunganReady=true;
  const sel=document.createElement('select');
  sel.id='pf-tab-rombel';
  sel.style.cssText='padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;background:#fff;min-width:150px;margin-left:8px';
  sel.innerHTML='<option value="">Semua Rombel</option>';
  const parent=searchWrap.parentElement;
  if(parent){parent.style.display='flex';parent.style.gap='8px';parent.style.alignItems='center';parent.style.flexWrap='wrap';parent.appendChild(sel)}
  api('/rombel').then(rombels=>{rombels.forEach(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=r.nama;sel.appendChild(o)})});
  sel.addEventListener('change',()=>{
    const rid=sel.value;
    const rombelName=sel.selectedOptions[0]?.textContent||'';
    const listContainer=main.querySelector('.divide-y.divide-gray-100')||main.querySelector('.divide-y');
    if(!listContainer)return;
    [...listContainer.children].forEach(el=>{
      if(!rid){el.style.display='';return}
      const txt=(el.textContent||'');
      el.style.display=txt.includes(rombelName)?'':'none';
    });
  });
}
function tabunganClean(){if(!location.pathname.includes('/admin/tabungan')){tabunganReady=false;document.getElementById('pf-tab-rombel')?.remove()}}

/* ======================== MODAL SEARCH SISWA ======================== */
function enhanceModals(){
  if(!isLoggedIn())return;
  if(!location.pathname.startsWith('/admin'))return;
  // Enhance Generate Tagihan modal - find select with siswa options or rombel
  const modals=document.querySelectorAll('.fixed.inset-0');
  modals.forEach(modal=>{
    if(modal.style.display==='none'||!modal.offsetParent&&!modal.querySelector('.bg-white'))return;
    // Find all selects inside modal
    const selects=modal.querySelectorAll('select');
    selects.forEach(sel=>{
      // Check if this is a siswa select (has many options with names)
      if(sel.dataset.searchEnhanced)return;
      if(sel.options.length<5)return;
      // Check if options look like siswa names
      const firstOpt=sel.options[1]?.textContent||'';
      if(!firstOpt.match(/\(|\d{4,}/))return; // siswa options usually have (NIS) or long numbers
      sel.dataset.searchEnhanced='1';
      // Insert search input before select
      const wrap=document.createElement('div');
      wrap.style.cssText='position:relative;margin-bottom:4px';
      wrap.innerHTML='<input type="text" placeholder="Ketik nama siswa..." style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none" class="pf-modal-search">';
      sel.parentElement.insertBefore(wrap,sel);
      const searchInput=wrap.querySelector('input');
      // Store original options
      const allOpts=[...sel.options].map(o=>({value:o.value,text:o.textContent,html:o.outerHTML}));
      searchInput.addEventListener('input',()=>{
        const q=searchInput.value.toLowerCase().trim();
        sel.innerHTML=allOpts.filter(o=>!q||o.value===''||o.text.toLowerCase().includes(q)).map(o=>o.html).join('');
      });
    });
  });
}

// Also enhance Tabungan transaksi modal specifically
function enhanceTabunganModal(){
  if(!isLoggedIn())return;
  if(!location.pathname.includes('/admin/tabungan')&&!location.pathname.includes('/admin/bendahara'))return;
  const modal=document.querySelector('.fixed.inset-0:not([style*="display: none"])');
  if(!modal)return;
  const selects=modal.querySelectorAll('select');
  selects.forEach(sel=>{
    if(sel.dataset.searchEnhanced)return;
    // Tabungan modal: siswa select has format "Nama (NIS)"
    if(sel.options.length<3)return;
    const hasNIS=[...sel.options].some(o=>o.textContent.includes('('));
    if(!hasNIS)return;
    sel.dataset.searchEnhanced='1';
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-bottom:4px';
    wrap.innerHTML='<input type="text" placeholder="Cari siswa..." style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none">';
    sel.parentElement.insertBefore(wrap,sel);
    const input=wrap.querySelector('input');
    const allOpts=[...sel.options].map(o=>({value:o.value,text:o.textContent,html:o.outerHTML}));
    input.addEventListener('input',()=>{
      const q=input.value.toLowerCase().trim();
      sel.innerHTML=allOpts.filter(o=>!q||o.value===''||o.text.toLowerCase().includes(q)).map(o=>o.html).join('');
    });
  });
}

/* ======================== LAPORAN BENDAHARA ======================== */
let laporanReady=false;
function laporanPage(){
  if(!isLoggedIn())return;
  if(!(location.pathname.includes('/admin/bendahara')&&location.hash==='#laporan'))return;
  const main=document.querySelector('main');if(!main)return;
  [...main.children].forEach(ch=>{if(ch.id!=='laporan-page')ch.style.display='none'});
  if(laporanReady)return;laporanReady=true;
  setTimeout(()=>{
    [...main.children].forEach(ch=>{if(ch.id!=='laporan-page')ch.style.display='none'});
    if(document.getElementById('laporan-page'))return;
    const d=document.createElement('div');d.id='laporan-page';d.style.padding='0';d.style.display='block';
    const today=new Date();
    const mon1=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10);
    const monEnd=today.toISOString().slice(0,10);
    const week1=new Date(today-6*86400000).toISOString().slice(0,10);
    d.innerHTML=`
<h1 style="font-size:22px;font-weight:700;margin:0 0 4px">Laporan Keuangan</h1>
<p class="pf-muted" style="margin-bottom:12px">Ringkasan pemasukan & pengeluaran</p>

<div class="pf-card" style="margin-bottom:12px">
  <div class="pf-row" style="margin-bottom:10px">
    <button id="lp_week" class="pf-btn pf-primary">Minggu Ini</button>
    <button id="lp_month" class="pf-btn">Bulan Ini</button>
    <button id="lp_custom" class="pf-btn">Custom</button>
    <input id="lp_mulai" type="date" class="pf-input" value="${week1}" style="width:140px">
    <input id="lp_selesai" type="date" class="pf-input" value="${monEnd}" style="width:140px">
    <button id="lp_load" class="pf-btn pf-success">Tampilkan</button>
    <button id="lp_print" class="pf-btn" style="margin-left:auto">Cetak</button>
  </div>
</div>

<div id="lp_content">
  <div id="lp_summary" class="pf-row" style="gap:12px;margin-bottom:12px;flex-wrap:wrap"></div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px" id="lp_grid">
    <div class="pf-card" style="padding:16px">
      <h3 style="font-weight:600;font-size:14px;margin:0 0 10px;color:#16a34a">Pemasukan (Uang Masuk)</h3>
      <div id="lp_masuk"></div>
    </div>
    <div class="pf-card" style="padding:16px">
      <h3 style="font-weight:600;font-size:14px;margin:0 0 10px;color:#dc2626">Pengeluaran (Uang Keluar)</h3>
      <div id="lp_keluar"></div>
    </div>
  </div>

  <div class="pf-card" style="padding:16px">
    <h3 style="font-weight:600;font-size:14px;margin:0 0 10px">Harian</h3>
    <div id="lp_harian" class="pf-scroll" style="max-height:300px"></div>
  </div>
</div>
`;
    main.appendChild(d);

    const fmt=n=>'Rp '+Number(n||0).toLocaleString('id-ID');

    function setPreset(type){
      const now=new Date();
      let m,s;
      if(type==='week'){m=new Date(now-6*86400000);s=now}
      else{m=new Date(now.getFullYear(),now.getMonth(),1);s=now}
      document.getElementById('lp_mulai').value=m.toISOString().slice(0,10);
      document.getElementById('lp_selesai').value=s.toISOString().slice(0,10);
      document.getElementById('lp_week').className='pf-btn'+(type==='week'?' pf-primary':'');
      document.getElementById('lp_month').className='pf-btn'+(type==='month'?' pf-primary':'');
      document.getElementById('lp_custom').className='pf-btn'+(type==='custom'?' pf-primary':'');
      loadLaporan();
    }

    async function loadLaporan(){
      const mulai=document.getElementById('lp_mulai').value;
      const selesai=document.getElementById('lp_selesai').value;
      try{
        const r=await api('/bendahara/laporan?mulai='+mulai+'&selesai='+selesai);

        // Summary cards
        document.getElementById('lp_summary').innerHTML=
          '<div style="background:#f0fdf4;padding:14px 18px;border-radius:10px;flex:1;min-width:140px"><div style="font-size:11px;color:#666;margin-bottom:2px">Total Pemasukan</div><div style="font-size:20px;font-weight:700;color:#16a34a">'+fmt(r.pemasukan.total)+'</div></div>'+
          '<div style="background:#fef2f2;padding:14px 18px;border-radius:10px;flex:1;min-width:140px"><div style="font-size:11px;color:#666;margin-bottom:2px">Total Pengeluaran</div><div style="font-size:20px;font-weight:700;color:#dc2626">'+fmt(r.pengeluaran.total)+'</div></div>'+
          '<div style="background:#eff6ff;padding:14px 18px;border-radius:10px;flex:1;min-width:140px"><div style="font-size:11px;color:#666;margin-bottom:2px">Saldo Bersih</div><div style="font-size:20px;font-weight:700;color:#2563eb">'+fmt(r.saldo_bersih)+'</div></div>'+
          '<div style="background:#fefce8;padding:14px 18px;border-radius:10px;flex:1;min-width:140px"><div style="font-size:11px;color:#666;margin-bottom:2px">Tagihan Pending</div><div style="font-size:20px;font-weight:700;color:#ca8a04">'+fmt(r.tagihan_pending.total)+'</div><div style="font-size:11px;color:#999">'+r.tagihan_pending.jumlah+' tagihan</div></div>';

        // Pemasukan detail
        document.getElementById('lp_masuk').innerHTML=
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span>Tagihan Lunas</span><span style="font-weight:600;color:#16a34a">'+fmt(r.pemasukan.tagihan.total)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span>Tabungan Setor</span><span style="font-weight:600;color:#16a34a">'+fmt(r.pemasukan.tabungan_setor.total)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span>Keuangan Debet</span><span style="font-weight:600;color:#16a34a">'+fmt(r.pemasukan.keuangan_debet.total)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:15px"><span>Total Masuk</span><span style="color:#16a34a">'+fmt(r.pemasukan.total)+'</span></div>';

        // Pengeluaran detail
        document.getElementById('lp_keluar').innerHTML=
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span>Tabungan Tarik</span><span style="font-weight:600;color:#dc2626">'+fmt(r.pengeluaran.tabungan_tarik.total)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee"><span>Keuangan Kredit</span><span style="font-weight:600;color:#dc2626">'+fmt(r.pengeluaran.keuangan_kredit.total)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:15px"><span>Total Keluar</span><span style="color:#dc2626">'+fmt(r.pengeluaran.total)+'</span></div>';

        // Harian
        if(r.harian&&r.harian.length){
          document.getElementById('lp_harian').innerHTML='<table class="pf-table"><thead><tr><th>Tanggal</th><th style="text-align:right">Jumlah</th></tr></thead><tbody>'+r.harian.map(h=>'<tr><td>'+h.tanggal+'</td><td style="text-align:right;font-weight:600;color:#16a34a">'+fmt(h.total)+'</td></tr>').join('')+'</tbody></table>';
        }else{
          document.getElementById('lp_harian').innerHTML='<p style="text-align:center;color:#999;padding:16px">Tidak ada data harian untuk periode ini</p>';
        }
      }catch{
        document.getElementById('lp_summary').innerHTML='<p style="color:#dc2626">Gagal memuat laporan</p>';
      }
    }

    document.getElementById('lp_week').onclick=()=>setPreset('week');
    document.getElementById('lp_month').onclick=()=>setPreset('month');
    document.getElementById('lp_custom').onclick=()=>{
      document.getElementById('lp_week').className='pf-btn';
      document.getElementById('lp_month').className='pf-btn';
      document.getElementById('lp_custom').className='pf-btn pf-primary';
    };
    document.getElementById('lp_load').onclick=loadLaporan;
    document.getElementById('lp_print').onclick=()=>{
      const content=document.getElementById('lp_content').innerHTML;
      const w=window.open('','_blank');
      w.document.write('<html><head><title>Laporan Keuangan</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:30px;font-size:13px}h3{margin-bottom:8px}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #ddd;text-align:left}@media print{body{padding:10px}}</style></head><body><h1 style="text-align:center;margin-bottom:4px">LAPORAN KEUANGAN</h1><p style="text-align:center;color:#666;margin-bottom:20px">Periode: '+document.getElementById('lp_mulai').value+' s/d '+document.getElementById('lp_selesai').value+'</p>'+content+'<div style="text-align:center;margin-top:20px" class="no-print"><button onclick="window.print()" style="padding:10px 24px;background:#333;color:white;border:none;border-radius:8px;cursor:pointer">Cetak</button></div></body></html>');
      w.document.close();
    };

    // Initial load
    setPreset('week');
  },400);
}
function laporanClean(){
  if(!(location.pathname.includes('/admin/bendahara')&&location.hash==='#laporan')){
    laporanReady=false;
    document.getElementById('laporan-page')?.remove();
    const main=document.querySelector('main');
    if(main)[...main.children].forEach(ch=>ch.style.display='');
  }
}

/* ======================== SIDEBAR: LAPORAN MENU ======================== */
function addLaporanMenu(){
  if(!isLoggedIn())return;
  if(!location.pathname.startsWith('/admin'))return;
  // Check all link containers — re-inject every time if missing
  const allLinks=[...document.querySelectorAll('a')];
  const exists=allLinks.some(a=>(a.getAttribute('href')||'').includes('#laporan'));
  if(exists)return;
  // Try multiple anchor points
  const anchors=allLinks.filter(a=>{const h=a.getAttribute('href')||'';return h==='/admin/tabungan'||h==='/admin/bendahara'||h==='/admin/tagihan'});
  for(const link of anchors){
    const parent=link.parentElement;if(!parent)continue;
    const a=document.createElement('a');
    a.textContent='Laporan Keuangan';
    a.setAttribute('href','/admin/bendahara#laporan');
    a.setAttribute('data-pf-laporan','1');
    a.className=link.className;
    a.style.cssText=link.style.cssText||'';
    a.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();
      if(location.pathname.includes('/admin/bendahara')){location.hash='#laporan';laporanReady=false;laporanPage()}
      else{window.location.href='/admin/bendahara#laporan'}
    });
    if(link.nextSibling)parent.insertBefore(a,link.nextSibling);else parent.appendChild(a);
    return;
  }
}

/* ======================== SIDEBAR MENU ======================== */
function addJamaahMenu(){
  if(!isLoggedIn())return;
  if(!location.pathname.startsWith('/admin'))return;
  const exists=[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').includes('#jamaah'));
  if(exists)return;
  const links=[...document.querySelectorAll('a')].filter(a=>{const h=a.getAttribute('href')||'';return h==='/admin/absensi-kegiatan'||h.includes('/admin/absensi-kegiatan')});
  for(const link of links){
    const parent=link.parentElement;if(!parent)continue;
    const a=document.createElement('a');
    a.textContent='Absensi Jamaah';
    a.setAttribute('href','/admin/absensi-kegiatan#jamaah');
    a.className=link.className;
    a.style.cssText=link.style.cssText;
    a.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();if(location.pathname==='/admin/absensi-kegiatan'){location.hash='#jamaah';jamaahReady=false;jamaahPage()}else{window.location.href='/admin/absensi-kegiatan#jamaah'}});
    if(link.nextSibling)parent.insertBefore(a,link.nextSibling);else parent.appendChild(a);
    break;
  }
}

/* ======================== OBSERVER ======================== */
let _pfBusy=false;
function keuanganPage(){}
function keuanganClean(){}
function addKeuanganMenu(){}
function runAll(){
  if(_pfBusy)return;
  _pfBusy=true;
  try{
    jamaahClean();jamaahPage();
    waClean();waPage();
    tagihanClean();tagihanPage();
    tabunganClean();tabunganPage();
    laporanClean();laporanPage();
    addJamaahMenu();addLaporanMenu();
    enhanceModals();enhanceTabunganModal();
  }catch(e){console.error('pf error',e)}
  _pfBusy=false;
}

runAll();
setInterval(runAll, 600);

let _pfTimer=null;
const _pfObs=new MutationObserver(()=>{
  if(_pfTimer)clearTimeout(_pfTimer);
  _pfTimer=setTimeout(runAll, 150);
});
setTimeout(()=>{
  const sidebar=document.querySelector('aside')||document.querySelector('nav');
  if(sidebar)_pfObs.observe(sidebar,{childList:true,subtree:true});
},2000);

})();
