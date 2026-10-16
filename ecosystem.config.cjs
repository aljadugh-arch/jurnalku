module.exports={apps:[
  {name:'jurnalku-api',script:'server/index.cjs'},
  // jurnalku-wa: worker WhatsApp (Baileys). `node_args` memberi ruang heap yang
  // cukup untuk beberapa sesi, dan `max_memory_restart` menghidupkan ulang
  // proses bila menembus batas — mencegah OOM "Reached heap limit" yang membuat
  // status tenant macet di 'connecting'.
  {name:'jurnalku-wa',script:'server/wa-worker.mjs',node_args:'--max-old-space-size=1536',max_memory_restart:'1700M',max_restarts:10,restart_delay:5000}
]}
