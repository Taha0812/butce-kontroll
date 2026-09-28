# 💸 Bütçe Kontroll

**Maliye (ru.innim.my_finance)** uygulamasına benzer, modern ve minimalist **kişisel finans / gelir–gider takip** uygulaması.
Saf HTML + CSS + JavaScript, harici kütüphane yok. **Kayıt/Giriş ile her hesabın verisi tamamen ayrı** tutulur;
sunucu (`server.js`, bağımlılık yok) verileri kullanıcı bazında `data\` klasöründe saklar, sunucu yoksa uygulama
**Yerel Mod**'da aynı arayüzle çalışmaya devam eder.

> 📦 **Depo:** [github.com/Taha0812/butce-kontroll](https://github.com/Taha0812/butce-kontroll) · `main`
> 🌐 **Canlı (telefon/tablet):** [taha0812.github.io/butce-kontroll](https://taha0812.github.io/butce-kontroll/)
>
> ```bash
> git clone https://github.com/Taha0812/butce-kontroll.git
> cd butce-kontroll
> baslat.bat        # ya da: node server.js  →  http://localhost:8123
> ```
>
> Kişisel veriler (`data\`) repoya **dahil değildir** (`.gitignore`) — ilk çalıştırmada sıfırdan oluşur.

---

## 🚀 Çalıştırma (terminalden)

**1. Yöntem — tek komut (önerilen, hesap sistemi dahil):**

```powershell
& "C:\Users\PC\Desktop\Proje\Bütce Kontroll\baslat.bat"
```

Sunucuyu başlatır ve `http://localhost:8123` adresini tarayıcında açar.
**Kayıt/Giriş + hesap başına veri ayrımı ancak bu yöntemle (Node sunucusuyla) tam çalışır.**

**2. Yöntem — elle sunucu başlat:**

```powershell
node "C:\Users\PC\Desktop\Proje\Bütce Kontroll\server.js"
# sonra tarayıcıda aç:  http://localhost:8123
```

**3. Yöntem — dosyayı doğrudan aç (yerel mod):** `index.html` dosyasına çift tıkla.
Sunucu yoksa **Yerel Mod**: kayıt/giriş yine çalışır ama hesaplar ve veriler yalnızca o tarayıcıda
saklanır. Canlı kur/altın fiyatları da `file://` ile bazı tarayıcılarda çalışmayabilir — bu yüzden
1. yöntem tercih edilir.

---

## 📱 Mobil kullanım

**Yayında (telefonunla aç):** [taha0812.github.io/butce-kontroll](https://taha0812.github.io/butce-kontroll/)
— GitHub Pages üzerinden servis edilir, kurulum gerektirmez.

- **Uygulama gibi aç:** sayfayı aç → tarayıcıda **Paylaş** → **Ana Ekrana Ekle**.
  `manifest.webmanifest` sayesinde tam ekran (standalone), kendi ikonu ve tema rengiyle açılır.
- **PWA kısayolları:** ana ekrana eklerken *Gelir ekle* / *Gider ekle* kısayolları da gelir
  (`./?add=income`, `./?add=expense`) → doğrudan hızlı ekleme ekranı açılır.
- **Mobil düzen:** alt menü + ortadaki ➕ butonu güvenli alan (`safe-area`) hesaba katılarak yerleşir,
  çentikli cihazlarda başlık durum çubuğunun altına kaçmaz, form alanları 16 px (iOS yakınlaştırma
  engellenir), dokunma hedefleri ≥ 44 px, tuş takımı kısa ekranlarda küçülür, yatay kullanım desteklenir.
- **Canlı fiyatlar telefonda da çalışır:** kur/altın API'leri `Access-Control-Allow-Origin: *`
  gönderir; çevrimdışıysa son bilinen değer ve uyarı gösterilir.
- Pages'te sunucu olmadığı için uygulama **Yerel Mod**'da çalışır: hesaplar ve kayıtlar o tarayıcıda
  (localStorage) tutulur. Bilgisayarında tam senkron istersen 1. yöntemi (`node server.js`) kullan;
  verini *Ayarlar → Dışa aktar / İçe aktar* ile taşıyabilirsin.
- Ayarlar → *Görünüm* kartında da "Ana Ekrana Ekle" ipucu bulunur (uygulama olarak açıldıysa gizlenir).

---

## 🔐 Hesaplar & giriş

Uygulama açılırken **Giriş yap / Kayıt ol / Şifre sıfırla** ekranı gelir; giriş yapılmadan veriler görünmez.

| | **Sunucu Modu** (`server.js` açık) | **Yerel Mod** (sunucu yok / dosyayla açıldı) |
|---|---|---|
| Hesaplar | `data\users.json` — parolalar **scrypt** ile hash'lenir | Tarayıcıda: tuz + 2500 turluk SHA-256 |
| Kayıtlar | `data\u_<id>.json` — **her hesap ayrı dosya** | `localStorage` → `butceKontroll.data.<kullanıcı>` |
| Oturum | Rastgele token (45 gün), sunucuda geçersiz kılınabilir | Tarayıcıda token |
| Cihazlar arası | Aynı hesapla başka tarayıcıdan da giriş yapılır | Yalnızca o tarayıcı |
| Senkron | Her kayıt ~1,2 sn içinde otomatik sunucuya yazılır | yok (yerelde kalır) |

**Hesap izolasyonu:** bir hesabın işlemleri, kartları, varlıkları, bütçesi ve ayarları diğerinden
tamamen ayrıdır — ikinci hesap sıfırdan başlar, hiçbir veri sızmaz (testlerle doğurulandı).

**Ek davranışlar:**
- **E-posta ile hesap:** kayıtta e-posta verilirse giriş ekranında kullanıcı adı yerine e-posta da
  yazılabilir (`ahmet@ornek.com`), büyük/küçük harf fark etmez. E-posta tektir.
- **Şifremi unuttum / yenile:** kayıtta seçilen **güvenlik sorusu** ile şifre sıfırlanır
  (giriş ekranı → *Şifre sıfırla* sekmesi). Cevap yalnızca hash'lenir; sunucu modunda sıfırlama
  kullanıcının **tüm oturumlarını** iptal eder. Cevap büyük/küçük harf ve boşluk duyarlı değildir.
- **Hesaplar arası aktarım:** *Ayarlar → Veri & hesaplar arası aktarım → Dışa aktar* ile JSON
  indirilir, hedef hesapta *İçe aktar* ile **Birleştir** (eksik kayıtlar eklenir, ayarlar korunur)
  veya **Üzerine yaz** (dosyadakilerle tam değiştirilir) seçilir. Tekrar birleştirmek kopya oluşturmaz.
- Daha önce **misafir** olarak kullanıldıysa, ilk kayıtta bu veriler otomatik olarak yeni hesaba
  taşınır ve misafir alanı temizlenir.
- Sunucu modunda cihazda da önbellek tutulur; çakışmada **daha yeni kayıt** (`__savedAt`) kazanır.
- Sunucu kapalıysa uygulama kilitlenmez → hesabın diske düşmüş hâli yerel önbellekten açılır ya da
  giriş ekranında "Yerel mod" uyarısı görünür.
- **Misafir olarak devam et** ile hesapsız kullanım mümkün (yalnızca o cihazda saklanır).
- Çıkış: başlıktaki **👤** butonu veya *Ayarlar → Hesap → Çıkış*.

### API (`server.js`)

| Uç | Metot | Açıklama |
|---|---|---|
| `/api/health` | GET | Sunucu var mı? (mod tespiti için) |
| `/api/register` | POST | `{username, password, email?, question?, answer?}` → `{token, user, email}` |
| `/api/login` | POST | `{identifier, password}` → `{token, user, email}` (kullanıcı adı **veya** e-posta) |
| `/api/security-question` | POST | `{identifier}` → `{question}` — şifre sıfırlama 1. adım |
| `/api/reset-password` | POST | `{identifier, answer, password}` → `{token, user}` — eski oturumlar iptal edilir |
| `/api/logout` | POST | Token'ı geçersiz kılar |
| `/api/me` | GET | Oturumdaki kullanıcı + e-posta |
| `/api/data` | GET / PUT | Kullanıcının tüm kayıtları (Bearer token zorunlu) |

Kurallar: kullanıcı adı 3–24 karakter (`a-z 0-9 . _ -`), şifre ≥ 6 karakter, e-posta opsiyonel ve
tektir (büyük/küçük harf duyarsız), güvenlik sorusu/cevabı opsiyonel ama verildiyse zorunlu
(`soru ≥ 4`, `cevap ≥ 2 karakter); başarısız giriş ve yanlış cevap denemelerinde hız sınırı;
`/data/` ve `/server.js` istemciye sunulmaz (403); `data\` klasörüne doğrudan yazılmaz
(geçici dosya + atomik yeniden adlandırma).

> ⚠️ Bu yerel/kişisel bir araçtır. Halka açık bir sunucuya koyacaksan arkasına **HTTPS** ve gerçek
> bir kimlik doğrulama servisi koymalısın.

---

## ✨ Özellikler

| Özellik | Durum |
| --- | --- |
| **Kayıt / giriş / çıkış, hesap başına izole veri** | ✅ |
| E-posta ile giriş (kullanıcı adı **veya** e-posta) | ✅ |
| Şifremi unuttum → güvenlik sorusu ile şifre yenileme | ✅ |
| Hesaplar arası veri aktarımı (JSON: birleştir / üzerine yaz) | ✅ |
| Hızlı gelir/gider ekleme (kategori çipleri + sayısal tuş takımı) | ✅ |
| Esnek bütçe dönemi (her ayın 1'inde değil, 15'inde başlayan dönem vb.) | ✅ |
| Dönem bütçesi, kalan bütçe, harcama yüzdesi, günlük harcama önerisi | ✅ |
| Çoklu para birimi & altın/gümüş — **canlı API**, portföy toplam değeri | ✅ |
| Görsel raporlama: pasta (donut) + günlük harcama alan grafiği + kategori barları | ✅ |
| Dönemler arası karşılaştırma (% değişim) | ✅ |
| Kredi kartı: kesim günü, son ödeme geri sayımı, limit kullanım oranı | ✅ |
| Taksitli harcama: otomatik taksit planı, kalan taksit takibi | ✅ |
| Karanlık / aydınlık tema, misafir modu, JSON yedek al/geri yükle | ✅ |
| Mobil öncelikli arayüz, masaüstünde ortalanmış uygulama kabuğu | ✅ |
| PWA: `manifest` + ikon, ana ekrana ekleme, hızlı ekleme kısayolları (`?add=`) | ✅ |
| **🔁 Tekrarlayan (otomatik) işlemler** — kira, maaş, abonelik; duraklat/sil | ✅ |
| **🚧 Kategori limitleri** — kategori bazlı dönem bütçesi + aşım uyarısı + rapor çubuğu | ✅ |
| **🎯 Birikim hedefleri** — hedef, son gün, katkı, "ne kadar/ay" önerisi | ✅ |
| **🔍 İşlem arama & filtre** — metin arama, gelir/gider, kategori, kart filtresi | ✅ |
| **📄 CSV içe/dışa aktarma** — Excel & diğer uygulamalar uyumlu, önizlemeli, mükerrer atlar | ✅ |

### 🔎 İncelenen diğer bütçe uygulamaları ve buraya taşınanlar

Sürüm 2 için sektördeki uygulamalar tek tek incelendi; hepsinde ortak olan, bu uygulamanın
mimarisine (saf JS, build yok, yerel/hibrit depolama) uyan özellikler buraya alındı:

| İncelenen uygulama | Öne çıkan yaklaşım | Buradaki karşılığı |
| --- | --- | --- |
| **Monefy**, **Money Manager (Realbyte)**, **Wallet (BudgetBakers)** | Tekrar eden kayıt, kategori limiti, CSV/Excel dışa aktarma | 🔁 Tekrarlayan işlemler, 🚧 Kategori limitleri, 📄 CSV |
| **butce.app** | Kategori bazlı aylık bütçe, etiket/tarih/kart filtresi, takip listesi | 🚧 Limitler, 🔍 Arama/filtre, 🔁 Vade kartı |
| **YNAB**, **Quicken Simplifi**, **PocketGuard** | Birikim hedefi, "bu kadar ayır" önerisi, hedefi bütçeleme | 🎯 Birikim hedefleri (aylık gerekli katkı hesabı) |
| **Goodbudget** | Zarf (envelope) sistemi: kategoriye para ayır, aşınca uyarı | 🚧 Limit + ana ekranda 🚧 banner + raporda ilerleme |
| **Monely**, **Honeydue**, **Copilot** | Baştan sona içe aktarma, önizleme, mükerrer tespiti | 📄 CSV önizleme (aynı satır iki kez girilmez) |
| **Monarch**, **Rocket Money**, **Empower** | Abonelik/vade takibi, net görünüm | 🔁 "7 gün içindeki vadeler" kartı + kart kesim/son ödeme uyarıları |

> **Bilinçli olarak yapılmayanlar:** banka otomatik bağlama (Plaid vb.), AI kategori tahmini,
> bulut eşitleme — hepsi harici servis/anahtar gerektirir; uygulamanın "bağımlılıksız, veri cihazda"
> ilkesiyle çelişir. Bunların yerine veri taşınabilirliği (JSON + CSV) güçlendirildi.

### Canlı veri kaynakları (anahtarsız, ücretsiz)
- **Kur:** `https://open.er-api.com/v6/latest/USD` → USD/EUR/GBP/CHF/JPY (TRY karşılıkları)
- **Altın & gümüş:** `https://api.gold-api.com/price/XAU` ve `/XAG` → ons, gram, çeyrek, yarım, gümüş

10 dakikada bir otomatik yenilenir (başlıktaki 🔄 ile elle de yenilenebilir).
İnternet yoksa son bilinen/fallback fiyatlar gösterilir ve “çevrimdışı” etiketi görünür.

---

## 🗂 Proje yapısı

```
Bütce Kontroll/
├─ index.html          # Uygulama iskeleti + giriş/kayıt ekranı
├─ manifest.webmanifest# PWA tanımı (ana ekrana ekle, tam ekran, kısayollar)
├─ icons/icon.svg      # Uygulama ikonu (yol tabanlı, tüm sistemlerde çizilir)
├─ server.js           # Yerel sunucu: statik dosyalar + hesap API'si (bağımlılık yok)
├─ baslat.bat          # Tek tıkla sunucu + tarayıcı açılışı
├─ data/               # [sunucu tarafından üretilir] kullanıcılar, oturumlar, hesap verileri
│   ├─ users.json      #   kullanıcı adı → scrypt hash + tuz
│   ├─ sessions.json   #   token → kullanıcı (45 gün)
│   └─ u_<id>.json     #   hesabın tüm kayıtları (işlem, kart, varlık, ayar)
├─ css/
│  └─ styles.css       # Tema değişkenleri, giriş ekranı, mobil öncelikli bileşenler
├─ js/
│  ├─ store.js         # Veri katmanı: namespace'li state, dönem/rapor hesapları, kur servisi
│  ├─ charts.js        # Kütüphanesiz SVG grafikler (donut, alan, bar) + tooltip
│  ├─ ui.js            # Biçimlendirme, toast, alt-pencere (sheet), gezinme, tema
│  ├─ views.js         # Ekran çizimleri: ana, rapor, varlık, kart, ayarlar
│  ├─ auth.js          # Kayıt/giriş, oturum, SHA-256, sunucu senkronu, giriş ekranı
│  └─ app.js           # Ekleme/düzenleme akışı, tuş takımı, kart & varlık formları, boot
├─ test/               # Test paketleri (gitignore: node_modules hariç repoda)
│  ├─ store.test.js    #   veri/dönem + birleştirme + v2 (otomatik/limit/hedef/CSV)
│  ├─ server.test.js   #   hesap API'si + izolasyon
│  ├─ dom.test.js      #   jsdom ile arayüz (yerel mod)
│  └─ dom.server.test.js # uçtan uca (gerçek sunucu, sunucu modu)
└─ README.md
```

> **Testler:** `test\` klasöründe (uygulamayı çalıştırmak için gerekli değil):
>
> ```bash
> cd test
> npm install     # yalnızca jsdom — bir kez yeter
> npm test        # 4 paket → 284 assert
> ```
>
> Tek tek çalıştırmak için:
> - `node test\store.test.js` — veri/dönem, birleştirme, otomatik işlem, limit, hedef, CSV (69 assert)
> - `node test\server.test.js` — hesap API'si + izolasyon (46 assert)
> - `node test\dom.test.js` — jsdom ile arayüz, yerel mod (133 assert; `dom.*` testleri
>   `http://localhost:8123` sunucusunun açık olmasını bekler)
> - `node test\dom.server.test.js` — uçtan uca, gerçek sunucu ile sunucu modu (36 assert)

---

## 🗄 Veri şeması

Sunucuda: `data\u_<id>.json` · Tarayıcıda: `localStorage["butceKontroll.data.<kullanıcı>"]`
(Misafir için: `butceKontroll.v1`)

```jsonc
{
  "__savedAt": 1790000000000,       // çakışmada hangi kopya güncel?
  "settings":  { "theme": "dark", "periodStartDay": 15, "periodBudget": 15000, "reminders": true,
                 "categoryBudgets": { "market": 3000, "eglence": 800 } },   // 🚧 kategori limitleri
  "categories":[ { "id": "market", "name": "Market", "icon": "🛒", "type": "expense", "color": "#ff8a3d" } ],
  "transactions": [
    { "id": "t_…", "type": "expense|income", "amount": 125.5, "categoryId": "market",
      "date": "2026-09-27", "note": "", "cardId": null,
      "planId": null, "installmentIndex": null, "installmentCount": null, "createdAt": 0,
      "recurringId": null, "recurringKey": null }   // 🔁 otomatik üretilen kayıt → mükerrer koruması
  ],
  "cards":  [ { "id": "k_…", "name": "Bonus", "last4": "4411", "statementDay": 5, "dueDay": 12, "limit": 20000, "color": "#2f6fed" } ],
  "assets": [ { "id": "a_…", "code": "USD|GRAM|…", "amount": 500 } ],
  "recurring": [                                    // 🔁 tekrarlayan (otomatik) işlemler
    { "id": "r_…", "name": "Kira", "type": "expense", "categoryId": "ev", "amount": 8000,
      "freq": "daily|weekly|monthly|yearly", "startDate": "2026-09-01", "nextDate": "2026-10-01",
      "cardId": null, "note": "", "active": true }
  ],
  "goals": [                                        // 🎯 birikim hedefleri
    { "id": "g_…", "name": "Tatil", "target": 50000, "deadline": "2027-07-01", "note": "",
      "contributions": [ { "id": "gc_…", "date": "2026-09-27", "amount": 4000 } ] }
  ],
  "rates":  { "updatedAt": 0, "live": true, "map": { "USD": 48.9, "GRAM": 6740 }, "prev": { } }
}
```

**Dönem hesabı:** `periodStartDay = 15` ise dönem *her ayın 15'i → gelecek ayın 14'ü*.
Bugün 27 Eylül ise içinde bulunulan dönem **15 Eylül – 14 Ekim**, harcamalar ve bütçe bu aralığa göre hesaplanır.

**🔁 Otomatik işlemler:** uygulama açıldığında `nextDate ≤ bugün` olan her kural için kayıt üretilir
(`recurringKey = kuralId + ":" + tarih` sayesinde aynı vade asla iki kez kaydedilmez); kural
`active: false` ise duraklatılır. Aylık kuralda gün 1–28 arasına sabitlenir → şubat/ay sonu sorunu yaşanmaz.

**🎯 Hedef katkıları** harcama sayılmaz: birikim, paranın hâlâ kullanıcıda olmasıdır; raporlara ve
bütçe tüketimine girmez.

**📄 CSV biçimi:** `Tarih,Tur,Kategori,Tutar,Kart,Not` (virgül; okuyucu `;` ayracını ve tırnakları da
anlar). İçe aktarmada sütunlar başlıktan eşleşir (Türkçe/İngilizce), başlık yoksa konumsal okunur;
`tarih` biçimi `2026-09-27` / `27.09.2026` olabilir, `1.500,75` gibi tutarlar çözümlenir ve
aynı işlem (tarih+tür+tutar+kategori+not) mükerrer sayılır.

---

## 🧭 Kullanım ipuçları

- **＋** butonu → kategori seç → tutarı tuş takımıyla gir (masaüstünde klavye de çalışır) → kaydet.
- **Kart + Taksit** seçersen gelecek aylar için otomatik taksit planı oluşur (Kartlar ekranında görünür).
- Ana ekrandaki kategori çiplerine **doğrudan dokunmak** = o kategoriden hızlı gider girmek.
- Ayarlar → *Dönem başlangıç günü* → maaş/gün bazlı bütçe dönemini özelleştir.
- **🔁 Otomatik işlemler:** ana sayfadaki *Otomatik işlemler → Ekle*; kira/maaş/abonelik gibi tekrar
  edenler sen uygulamayı her açtığında kendiliğinden kaydedilir. `?add=expense` kısayolu gibi
  ana ekran kısayolları PWA'de *Ana Ekrana Ekle* ile başlatılabilir.
- **🚧 Kategori limiti:** Ayarlar → *Kategori limitleri* → kategoriye üst sınır yaz → *Limitleri kaydet*.
  Aşım olursa ana ekranda 🚧 banner, Raporlar'da ilerleme çubuğu görünür.
- **🎯 Hedef:** Varlıklar → *Hedef ekle*; son gün belirlersen uygulama "bu kadar/ay ayır" önerir.
- **🔍 Arama:** *Tüm işlemler* → kategori, not, kart, tutara göre filtrele; gelir/gider + kategori + kart çipleri.
- **📄 CSV:** Ayarlar → *CSV olarak dışa aktar* (Excel/Monefy/Money Manager) ya da *CSV içe aktar*
  (banka ekstresi → önizleme → mükerrerler otomatik atlanır).
- Başlıktaki **👤** → hesap paneli: kullanıcı, mod, senkron durumu, çıkış.
