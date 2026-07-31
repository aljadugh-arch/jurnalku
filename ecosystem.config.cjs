module.exports={apps:[
  {name:'jurnalku-api',script:'server/index.cjs'},
  {name:'jurnalku-wa',script:'server/wa-worker.mjs',max_restarts:10,restart_delay:5000}
]}
