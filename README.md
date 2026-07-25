# Inkline — Canlı AI Destekli İngilizce Writing Koçu

Yazma (writing) odaklı, canlı AI destekli interaktif İngilizce öğrenme uygulaması.
AI kullanıcının seviyesini takip eder, seviyeye uygun essay konuları önerir,
yazarken kritik hatalarda öğretici uyarılar verir, istenildiği yerde destek sunar,
essay'i rubrikle notlar ve kişisel bir **Gelişim** planı çıkarır.

## Özellikler

- **Seviye tespiti (onboarding):** kısa bir yazıyla CEFR (A1–C2) tahmini.
- **Konu önerisi:** seviyeye ve ilgi alanlarına göre 4 essay konusu.
- **Canlı uyarılar:** yazarken kritik hatalar Grammarly tarzı altı çizili işaretlenir;
  tıklayınca açıklama + öneri + "Uygula/Yoksay". **Aç/kapa** düğmesi var.
- **İsteğe bağlı yardım:** metni seç → AI'dan gramer / kelime / cümle yapısı desteği.
- **Notlama + arşiv:** IELTS benzeri rubrik, düzeltilmiş metin, güçlü/zayıf yönler; tüm essayler notlarıyla saklanır.
- **Gelişim paneli:** seviye ve hata grafikleri + AI koçun kişisel yol haritası.
- **Seviyeye göre dil:** açıklamalar başlangıçta Türkçe, seviye yükseldikçe İngilizce.

## Teknoloji

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Vercel AI SDK
(**Gemini → GPT** model zinciri) · Supabase (Postgres + **anonim** auth + RLS) ·
TipTap (ProseMirror) · Recharts.

> **Kimlik:** Kullanıcı hiçbir kayıt/giriş ekranı görmez. İlk açılışta Supabase
> **Anonymous Auth** ile her tarayıcıya gerçek bir `auth.uid()` verilir (çok-kullanıcılı
> altyapı + RLS). İleride bu anonim hesap e-posta ile gerçek hesaba yükseltilebilir.

## Kurulum

### 1) Bağımlılıklar
```bash
npm install
```

### 2) Supabase projesi
1. [supabase.com](https://supabase.com) → yeni proje oluştur.
2. **SQL Editor**'de `supabase/migrations/` altındaki dosyaları sırayla çalıştır
   (`0001_init.sql`, sonra `0002_ai_model.sql`).
3. **Authentication → Sign In / Providers → Anonymous sign-ins** ayarını **aç**.
4. **Project Settings → API**'den `URL` ve `anon public` anahtarını al.

### 3) AI anahtarı
En az biri gerekli; ikisi de varsa zincir tam çalışır (bkz. *AI model zinciri*):

- **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Gemini:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

Anahtarlar yalnızca sunucuda kullanılır, tarayıcıya düşmez.

### 4) Ortam değişkenleri
`.env.example` dosyasını `.env.local` olarak kopyala ve doldur:
```bash
cp .env.example .env.local
```
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
# opsiyonel:
OPENAI_REASONING_EFFORT=low         # OpenAI tarafı düşünme bütçesi
GEMINI_THINKING_LEVEL=medium        # Gemini 3+ düşünme bütçesi
AI_MODEL_CHAIN=...                  # zinciri tamamen değiştirir (virgüllü liste)
```

### 5) Çalıştır
```bash
npm run dev
```
> `NEXT_PUBLIC_*` değişkenleri değiştirdikten sonra dev sunucusunu **yeniden başlat**.
> Prod build (`next build`) mutlaka env ayarlandıktan **sonra** alınmalı.

## Vercel'e deploy

Repo: [github.com/Mertsaglm/Inkline](https://github.com/Mertsaglm/Inkline) →
Vercel'de **Add New → Project → Import**.

| Alan | Değer |
| --- | --- |
| Framework Preset | `Next.js` (otomatik algılanır) |
| Root Directory | `./` (repo kökü) |
| Build / Output / Install | **Değiştirme** — varsayılanlar doğru |
| Node.js Version | 24.x (varsayılan; proje `>=20.9` istiyor) |

**Environment Variables** — dördü de `Production`, `Preview` ve `Development`
ortamlarına eklenmeli:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENAI_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
```

> ⚠️ **`NEXT_PUBLIC_*` değişkenleri build sırasında koda gömülür.** İlk deploy'dan
> **önce** eklenmezlerse uygulama derlenir ama "Kurulum gerekli" ekranında kalır.
> Sonradan eklersen **Redeploy** şart (cache'siz), yoksa değişiklik uygulanmaz.
> AI anahtarları sunucuda okunduğu için onlar build'e gömülmez, ama tutarlılık
> için aynı anda girmek en temizi.

Opsiyonel `OPENAI_REASONING_EFFORT`, `GEMINI_THINKING_LEVEL` ve `AI_MODEL_CHAIN`
girilmezse koddaki varsayılanlar (`low` / `medium` / §*AI model zinciri*) geçerli.

**Bölge.** `vercel.json` fonksiyonları **`fra1` (Frankfurt)** bölgesine sabitler —
hem Türkiye'ye en yakın bölge hem de Supabase `eu-central-1` ile aynı yerde.
Supabase projen başka bir bölgedeyse `vercel.json`'daki `regions` değerini ona
göre değiştir, yoksa her DB sorgusu kıtalararası gidip gelir.

**Supabase tarafı.** Deploy öncesi `supabase/migrations/` altındaki dosyalar
çalıştırılmış ve **Anonymous sign-ins** açık olmalı. Anonim auth yönlendirme
(redirect URL) kullanmadığı için Vercel domain'ini Supabase'e ayrıca tanıtman
gerekmez.

### Deploy'da yaşanmış iki tuzak

Bu ikisi ilk kurulumda gerçekten başa geldi; tekrar kurarken kontrol et:

1. **Build yeşil ama her adres `404: NOT_FOUND`** → Framework Preset `Next.js`
   değil. Preset yanlış olunca Vercel `.next/` çıktısını yok sayıp `public/`
   klasörünü statik site olarak sunar; orada `index.html` olmadığı için kök dizin
   404 verir. Hata kodunun `DEPLOYMENT_NOT_FOUND` değil düz `NOT_FOUND` olması bu
   teşhisin imzasıdır (deployment var, route yok). Düzeltme: Settings → Build and
   Deployment → Framework Preset → `Next.js`, sonra **cache'siz Redeploy** —
   preset değişikliği geriye dönük çalışmaz.
2. **Siteye sadece sen girebiliyorsun, başkası `vercel.com/sso-api`'ye
   yönleniyor** → **Deployment Protection** yeni projelerde varsayılan açık.
   Settings → Deployment Protection → Vercel Authentication → `Disabled`.

## AI model zinciri

Tüm AI çağrıları `lib/ai/provider.ts` üzerinden tek noktadan geçer. Görev ayrımı
yoktur — her istek aynı sıralı zinciri baştan dener:

| # | Model | Sağlayıcı | Düşünme bütçesi |
| --- | --- | --- | --- |
| 1 | `gemini-3.5-flash` | Google | `thinkingLevel: medium` |
| 2 | `gemini-3.1-flash-lite-preview` | Google | `thinkingLevel: medium` |
| 3 | `gpt-5-mini` | OpenAI | `reasoningEffort: low` |
| 4 | `gemini-3-flash-preview` | Google | `thinkingLevel: medium` |
| 5 | `gemini-2.5-flash` | Google | dinamik (bkz. aşağıdaki not) |

Bir model **cevap veremezse** (kota, geçersiz anahtar, bulunamayan model, ağ,
zaman aşımı, şemaya uymayan çıktı — fark etmez) hemen sıradakine geçilir. Yedeği
olan modelde yeniden deneme kapalıdır (`maxRetries: 0`), böylece failover anında
olur; yeniden deneme yalnızca zincirin son halkasında devrededir.

Anahtarı olmayan sağlayıcının modelleri zincirden düşer — yani tek anahtarla da
çalışır. `AI_MODEL_CHAIN` ile zincir tamamen değiştirilebilir (virgülle ayrılmış
liste; sağlayıcı model adından anlaşılır).

**Düşünme bütçesi notları.** OpenAI'nin `gpt-5` / `o` serisi `temperature` kabul
etmez, bu yüzden provider katmanı o parametreyi bu modellerde otomatik atlar ve
yerine `reasoningEffort` kullanır (`OPENAI_REASONING_EFFORT`, varsayılan `low`).
Gemini tarafında `thinkingLevel` **Gemini 3 ve sonrasının** parametresidir
(`GEMINI_THINKING_LEVEL`, varsayılan `medium`); `gemini-2.5-flash` bunu tanımadığı
için parametre gönderilmez ve model kendi dinamik düşünme varsayılanıyla çalışır.

## Hangi model cevap verdi?

Her AI route'u yanıtında gerçekten cevabı üreten modelin adını (`model`) döndürür
ve arayüz bunu **“Bu cevapta X modeli kullanıldı”** rozetiyle gösterir
(`components/ModelNote.tsx`). Rozet altı yerde çıkar: konu önerileri, seviye
tespiti, canlı kontrol, AI yardım çekmecesi, gelişim planı ve essay notu.

Essay notu sunucuda DB'den okunduğu için model adı `essay_grades.ai_model`
sütununda saklanır (migration `0002_ai_model.sql`). Bu migration'dan önceki
notlarda değer `null`'dır ve rozet çizilmez.

## Maliyet notu

Canlı kontrol yazım durunca (debounce) çalışır; uyarılar kapalıyken **hiç AI
çağrısı gitmez**.

## Mimari — kısa harita

```
proxy.ts                     # her istekte oturum yenile + anonim giriş
app/layout.tsx               # fontlar, tema script'i, grain dokusu, Nav
app/globals.css              # token'lar (:root açık / .dark koyu) + ProseMirror
app/{page,onboarding,write,essays,progress,settings}
app/{icon.svg,favicon.ico,apple-icon.png,manifest.ts}
app/api/ai/*                 # topics, diagnostic, check, assist, grade, coach (sunucu)
app/api/essays, /api/feedback
lib/ai/provider.ts           # model zinciri + failover + generateAiObject
lib/ai/{schemas,prompts}.ts
lib/supabase/{client,server,middleware}.ts
lib/{cefr,config}.ts, lib/db/{types,profile}.ts
components/Nav.tsx           # sticky üst bar + aktif link + tema düğmesi
components/ThemeToggle.tsx   # .dark sınıfını çevirir, ink-theme'e yazar
components/SetupNotice.tsx   # env eksikse "Kurulum gerekli" ekranı
components/ModelNote.tsx     # "Bu cevapta X modeli kullanıldı" rozeti
components/brand/Inkline.tsx # logo — glyph, wordmark, lockup
components/editor/{EssayEditor.tsx,issueHighlight.ts}
supabase/migrations/{0001_init,0002_ai_model}.sql
scripts/render-icons.py      # SVG mark'tan favicon/app-icon PNG üretir
design/LOGO_SPEC.md          # gönderilen logonun spesifikasyonu
vercel.json                  # fonksiyon bölgesi: fra1
```

## Marka

Logo "The Nib Rise": tek kalem darbesi + ağırlık/opsz ile ikiye ayrılan
"Ink·line" wordmark'ı. Tam spesifikasyon, kullanım kuralları ve misuse listesi:
[design/LOGO_SPEC.md](design/LOGO_SPEC.md). İkon rasterlarını yeniden üretmek
için `python3 scripts/render-icons.py` (Pillow gerekir).

## Tema

Açık ve koyu tema da birinci sınıf, ama **varsayılan her zaman açık.** Ürünün
metaforu "sıcak kâğıt üzerine mürekkep"; ilk izlenim sayfa olmalı, gece vardiyası
değil. Bu yüzden işletim sisteminin `prefers-color-scheme` tercihi **bilerek
dikkate alınmaz** — koyu tema yalnızca kullanıcı nav'daki düğmeye bastığında
devreye girer.

Mekanik: açık tema `:root`'un kendisi, koyu tema ise `<html>` üzerindeki `.dark`
sınıfı (`app/globals.css`). Tercih `localStorage`'da `ink-theme` anahtarında
saklanır ve `app/layout.tsx`'teki satır içi script ilk boyamadan önce uygular, bu
sayede sayfa açılırken tema titremesi (FOUC) olmaz.

## Depoya girmeyen klasörler

İki klasör `.gitignore`'da; yalnızca yerel diskte yaşarlar ve uygulama ikisine de
bağımlı değildir:

- **`gereksiz/`** — işi bitmiş tasarım ara çıktıları (brief'ler, ham Claude Design
  ve Stitch export'ları). Ayrıntı: `gereksiz/README.md`.
- **`Proje Yardımcısı/`** — projeden bağımsız, taşınabilir AI asistan bağlamı
  ("Usta" sistemi: `AGENTS.md` + `ai/` hafıza dosyaları).
