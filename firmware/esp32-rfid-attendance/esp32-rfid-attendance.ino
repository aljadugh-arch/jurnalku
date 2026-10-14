/*
 * Absensi RFID — ESP32 + RC522 (MFRC522, 13.56MHz)
 * Tap kartu -> kirim UID ke Jurnalku (endpoint API-key) -> buzzer + LED umpan balik.
 *
 * Wiring (ESP32 DevKit v1 <-> RC522, 3.3V SAJA):
 *   RC522 SDA/SS -> GPIO5     RC522 SCK  -> GPIO18
 *   RC522 MOSI   -> GPIO23    RC522 MISO -> GPIO19
 *   RC522 RST    -> GPIO4     RC522 3.3V -> 3V3     RC522 GND -> GND
 *   Buzzer (+)   -> GPIO25    LED hijau -> GPIO26    LED merah -> GPIO27
 *
 * Library (Arduino Library Manager): "MFRC522" by GithubCommunity, "ArduinoJson".
 *
 * Konfigurasi di bawah: isi WIFI_SSID/PASS, SERVER, API_KEY.
 * Buat API key di aplikasi: menu REST API Developer -> buat key dengan izin
 * "absensi:write". Endpoint memakai header x-api-key (bukan login staf).
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// ====== KONFIGURASI ======
const char* WIFI_SSID = "NAMA_WIFI";
const char* WIFI_PASS = "PASSWORD_WIFI";
const char* SERVER    = "https://jurnal.contoh.sch.id"; // tanpa trailing slash
const char* API_KEY   = "ISI_API_KEY_ABSENSI_WRITE";     // izin: absensi:write

// ====== PIN ======
#define SS_PIN   5
#define RST_PIN  4
#define BUZZER   25
#define LED_OK   26
#define LED_ERR  27

MFRC522 rfid(SS_PIN, RST_PIN);

void beep(int ms) { digitalWrite(BUZZER, HIGH); delay(ms); digitalWrite(BUZZER, LOW); }

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT); pinMode(LED_OK, OUTPUT); pinMode(LED_ERR, OUTPUT);
  digitalWrite(LED_OK, LOW); digitalWrite(LED_ERR, LOW);

  SPI.begin();
  rfid.PCD_Init();
  Serial.println("\n[RFID] RC522 siap.");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Menyambung");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\n[WiFi] Tersambung: %s\n", WiFi.localIP().toString().c_str());
}

String uidToHex(MFRC522::Uid *uid) {
  String s;
  for (byte i = 0; i < uid->size; i++) {
    if (uid->uidByte[i] < 0x10) s += "0";
    s += String(uid->uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

// Kirim UID ke server. Return true bila 200 (tercatat/duplikat).
bool kirimAbsensi(const String &uid) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  String url = String(SERVER) + "/api/external/v1/absensi/scan";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  StaticJsonDocument<128> req;
  req["rfid_uid"] = uid;
  String body; serializeJson(req, body);

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.printf("[RFID] UID=%s HTTP=%d resp=%s\n", uid.c_str(), code, resp.c_str());

  if (code == 200) return true;
  // 404 UNMAPPED_RFID = kartu belum dipetakan ke siswa.
  return false;
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = uidToHex(&rfid.uid);
  bool ok = kirimAbsensi(uid);

  if (ok) { digitalWrite(LED_OK, HIGH); beep(120); delay(120); beep(120); digitalWrite(LED_OK, LOW); }
  else    { digitalWrite(LED_ERR, HIGH); beep(600); digitalWrite(LED_ERR, LOW); }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(800); // jeda anti-dobel tap
}
