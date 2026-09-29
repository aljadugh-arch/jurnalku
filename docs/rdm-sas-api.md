# Kontrak API RDM untuk integrasi SAS Jurnalku

Tanggal verifikasi live: 2026-09-29
Host sampel: `https://ma-sd7.rdmku.pro`
RDM: 3.1, Kurikulum Merdeka (`kurikulum=2`)

## Alur yang dipakai

1. `GET /auth`
   - Ambil `csrf_token` dari HTML.
   - Ambil opsi `<option selected>` untuk `tahunajaran` dan `semester`.
2. `POST /login/dologin`
   - Form: `csrf_token`, `username`, `password`, `tahunajaran`, `semester`.
   - Respons terverifikasi: `{"success":true}`.
   - Pertahankan cookie sesi.
3. `POST /guru/getkelas`
   - Scope akun guru.
   - Respons: `data[]` berisi `ajar_id` dan `mapel_id`; pada sampel live terdapat 5 ajar.
4. Set cookie `selectkelas=<ajar_id>`.
   - Controller Angular RDM memakai `$cookies.put("selectkelas", idkelas)`.
   - Route HTTP `/selectkelas` tidak dipakai: percobaan live mengembalikan HTTP 404.
5. `GET /guru/kelas/datasiswa/<ajar_id>`
   - Respons `data[]`: `siswa_id` (ID internal/terenkripsi), `siswa_nis`, `siswa_nisn`, `siswa_nama`.
6. `GET /guru/pengetahuan/sumatif`
   - Respons utama:
     - `datapas[siswa_id]`: nilai SAS (`paspat` di konfigurasi RDM).
     - `datarapor[siswa_id].rapor_nilai`: nilai rapor RDM.
     - `datarapor[siswa_id].rapor_deskripsi`: deskripsi capaian.
     - `nilailock`: status penguncian nilai.
7. `GET /guru/kelas/bobot/<ajar_id>`
   - Respons `bobot.bobotkelas`: `{harian, paspat, porto, praktek, proyek}`.
   - `paspat` adalah komponen SAS.

## Hasil live yang sudah diverifikasi

Dengan akun guru RDM yang tersedia:

- Login sukses.
- `guru/getkelas`: 5 ajar.
- Ajar pertama: mapel ID `145`, bobot `{harian:1,paspat:1,porto:1,praktek:0,proyek:0}`, kurikulum `2`.
- `guru/kelas/datasiswa`: 37 siswa.
- `guru/pengetahuan/sumatif`: SAS terisi `37/37`, `nilailock=3`.
- Semua 5 ajar yang diproses: `37/37`, `28/28`, `28/28`, `40/40`, `37/37` nilai SAS terisi.
- Tidak ada endpoint tulis nilai yang dipanggil oleh smoke test.

## Pemetaan ke Jurnalku

RDM:

- `harian` = Sumatif/komponen harian RDM.
- `paspat` = SAS.

Jurnalku menyimpan asesmen SAS melalui endpoint internal yang sudah ada:

`POST /api/rapor/asesmen`

Payload per batch:

```json
{
  "jenis": "sas",
  "tahun_ajaran": "2025/2026",
  "semester": "ganjil",
  "rombel_id": "<rombel Jurnalku>",
  "items": [
    {"siswa_id":"<siswa Jurnalku>","mapel_id":"<mapel Jurnalku>","nilai":80}
  ]
}
```

Sebelum impor, mapping wajib dilakukan berdasarkan NIS/NISN (bukan `rdmSiswaId`), dan mapel berdasarkan identitas mapel yang disepakati. ID RDM internal tidak boleh disimpan sebagai ID siswa Jurnalku.

Bobot RDM relatif `{harian:1,paspat:1}` dinormalisasi menjadi bobot SAS Jurnalku `{harian:0.5,sts:0,sas:0.5}`. Fungsi implementasinya adalah `bobotRdmKeJurnalku()` di `server/rdm-sas-connector.cjs`.

## Batasan dan keamanan

- Endpoint nilai RDM terbukti guru-scoped. Akun proktor/admin dapat melihat status kirim kelas, tetapi tidak menjadi sumber nilai SAS massal melalui endpoint guru.
- Connector bersifat read-only terhadap RDM: hanya `auth`, `login/dologin`, `guru/getkelas`, `guru/kelas/*`, dan `guru/pengetahuan/sumatif`.
- Password tidak ditulis ke disk, log, payload laporan, atau file hasil smoke test.
- Nilai harus ditinjau/mapping sebelum diposting ke Jurnalku; otomatisasi impor ke production belum diaktifkan.
- Jika nilai RDM berstatus terkunci (`nilailock=3` pada sampel), perlakukan sebagai read-only dan jangan mencoba endpoint `save`, `kirimnilai`, `batalnilai`, atau `locknilai`.
