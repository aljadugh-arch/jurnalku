# Absensi RFID — ESP32 + RC522

Alat mandiri untuk absensi tap kartu siswa. Tap kartu → UID dikirim ke Jurnalku
via endpoint API-key → absensi tercatat (masuk/pulang otomatis dari jam) → buzzer
+ LED memberi umpan.

## Komponen
- ESP32 DevKit v1 (atau ESP8266 — sesuaikan pin)
- Modul RFID RC522 (13.56MHz, kartu Mifare Classic) + kartu/tag
- Buzzer aktif + 2 LED (hijau/merah) + resistor 220Ω

## Wiring (ESP32 ↔ RC522, WAJIB 3.3V)
| RC522 | ESP32 | RC522 | ESP32 |
|-------|-------|-------|-------|
| SDA/SS | GPIO5 | SCK | GPIO18 |
| MOSI | GPIO23 | MISO | GPIO19 |
| RST | GPIO4 | 3.3V | 3V3 |
| GND | GND | — | — |

Buzzer → GPIO25, LED hijau → GPIO26, LED merah → GPIO27.

## Langkah
1. Di aplikasi Jurnalku: menu **Kartu RFID** → petakan UID tiap siswa
   (atau isi kolom **RFID UID** saat impor Excel data siswa).
2. Menu **REST API Developer** → buat API key dengan izin **absensi:write**.
3. Isi `WIFI_SSID`, `WIFI_PASS`, `SERVER`, `API_KEY` di sketch, lalu flash
   (Arduino IDE + library MFRC522 & ArduinoJson).
4. Tap kartu: buzzer 2× pendek + LED hijau = tercatat; buzzer 1× panjang + LED
   merah = kartu belum dipetakan / gagal.

## Endpoint yang dipakai
`POST /api/external/v1/absensi/scan`
Header: `x-api-key: <key>` · Body: `{ "rfid_uid": "04A2B1C3" }` (atau `{ "token": "<QR>" }`).
Balasan: `{ ok, nama, sesi, already }` — `already:true` berarti sudah tercatat.

## Alternatif tanpa firmware
Reader RFID USB/Bluetooth **mode keyboard** (HID): tap kartu → UID "diketik"
otomatis ke kolom input. Pakai mode **RFID** di halaman "Absensi QR Siswa" (guru)
atau tempel UID di menu **Kartu RFID** (admin).
