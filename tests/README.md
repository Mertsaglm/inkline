# Testler

> **Bu paketin amacı, projeyi tanımayan birinin — insan ya da model — sessizce
> bir şey bozmasını engellemek.** Testlerin çoğu üslup denetimi değil: her biri
> ya yaşanmış bir hatanın ya da `AGENTS.md`'de yazılı bir sınırın karşılığı.

```bash
npm test              # tek seferlik çalıştır
npm run test:watch    # geliştirirken
npm run test:coverage # kapsam raporu (coverage/)
npm run verify        # tsc --noEmit && vitest run && next build  ← teslimden önce bu
```

## Bir test kırmızıya döndüğünde

1. **Önce testi değil, kodu şüpheli say.** Bu testlerin büyük kısmı, hatanın
   ekranda görünmediği durumları yakalıyor (yanlış kelimenin altı çizilir,
   seviye yanlış hesaplanır, AI yedeklemesi sessizce devre dışı kalır).
2. Testin üstündeki yorumu oku — kuralın **neden** var olduğu orada yazılı.
3. Kuralı gerçekten değiştirmek istiyorsan `AGENTS.md`'yi ve testi **birlikte**
   güncelle. Testi tek başına silmek, kuralın var olduğunu unutturur.

## Yapı

| Klasör | Neyi korur |
| --- | --- |
| `unit/` | Saf mantık: CEFR matematiği, AI sağlayıcı zinciri, prompt kuralları, Zod şemaları, anonim oturum |
| `api/` | Sekiz route handler'ın tamamı: yetki kapıları, doğrulama, durum kodları, DB yan etkileri |
| `editor/` | İşaret konumlandırma ve "düzeltmeyi uygula" zinciri |
| `components/` | Küçük arayüz bileşenleri (model rozeti, nav, tema, kurulum ekranı, marka) |
| `pages/` | Sunucu sayfalarının veri türetimi + istemci sayfalarının akışları |
| `contracts/` | `AGENTS.md` kurallarının ve SQL↔TS↔Zod tutarlılığının çalıştırılabilir hâli |
| `helpers/` | Supabase taklidi, sabit veriler, kaynak dosya okuyucular |

## En kritik dört alan

**1. `api/check.test.ts` → `safeReplacement` guard**
`replacement` alanı öğrencinin essay'ine **birebir** yazılıyor. Model kural
gereği sadece düzeltmeyi yazmalı, ama zaman zaman açıklama/alternatif döküyor
(`"you are really enjoying" veya daha uygun: "you really enjoy"`). Guard tırnak,
satır sonu ve aşırı uzunluk gören her düzeltmeyi `null`'a düşürüp öneriyi
"sadece açıklama" hâline getiriyor. Bu blok sadeleştirilirse öğrencilerin
metinleri bozulur ve kimse fark etmez.

**2. `unit/provider.test.ts` → model zinciri**
Zincirin sırası, anahtarsız sağlayıcının elenmesi, akıl yürütme modellerine
`temperature` gönderilmemesi (400 döner), `gemini-2.5-*`'a `thinkingLevel`
gönderilmemesi (400 döner). Bu kurallar bozulduğunda uygulama Gemini kotası
dolana kadar sorunsuz görünür, sonra tamamen cevapsız kalır.

**3. `contracts/conventions.test.ts` → AGENTS.md**
Tailwind v4'ün sessizce düşürdüğü `@layer` blokları, `@ai-sdk`'nin tek giriş
noktası, giriş ekranı eklenmemesi, `prefers-color-scheme` yasağı, `tr-TR`
tarihleri, RLS'siz tablo bırakılmaması, `.env.example`'da anahtar kalmaması,
`gereksiz/` ve `Proje Yardımcısı*/` klasörlerinin git'e sızmaması.

**4. `contracts/schema-drift.test.ts` → dört kopya**
`kind`, `severity`, `source`, `status`, CEFR bandları ve rubrik alanları
SQL CHECK kısıtında, TypeScript union'ında, Zod enum'unda ve route beyaz
listesinde ayrı ayrı yazılı. Biri değişip diğerleri kalırsa TypeScript
hiçbir şey demez — sorun üretimde Postgres 500'ü olarak çıkar.

## Test altyapısı hakkında bilinmesi gerekenler

- **Ortam**: varsayılan `node`. DOM gerektiren dosyalar kendi başlarında
  `// @vitest-environment jsdom` satırı taşır. (Global jsdom, route
  testlerinde `Request`/`Response` global'lerini bozuyor.)
- **`tests/setup.ts`** yalnızca *çerçeveyi* taklit eder: `next/navigation`,
  `next/link` ve Node 25'in bozuk `localStorage` global'i. Uygulama modülleri
  asla burada taklit edilmez — bunu isteyen test kendi dosyasında açıkça yapar.
- **`TZ=UTC`** `vitest.config.ts` içinde sabitlenmiştir; `tr-TR` tarihleri
  aksi hâlde geliştiricinin saat dilimine göre farklı gün gösterir.
- **`helpers/supabase-mock.ts`** gerçek istemcinin zincirlenebilir + "thenable"
  şeklini taşır ve her DB işlemini kaydeder; testler hem dönen veriyi hem
  *route'un DB'ye ne yazdığını* doğrulayabilir.
- Yeni bir AI route'u eklendiğinde `contracts/conventions.test.ts` içindeki
  `ALL_ROUTES`/`AI_ROUTES` listeleri kırmızıya döner — bu kasıtlı: yeni
  route'un kurallara dahil edilmesini hatırlatır.

## jsdom'da yazılamayan şey

TipTap'in `contenteditable` alanına jsdom içinde gerçekten yazmak mümkün değil.
`editor/EssayEditor.test.tsx` bu yüzden AI kontrolünü diğer iki yoldan
tetikliyor: "AI uyarıları" anahtarını açmak ve "Tamamla & Değerlendir".
Kritik zincirin tamamı (öneri gelir → altı çizilir → tıklanır → uygulanır →
metin değişir → analitiğe yazılır) bu yolla kapsanıyor. Kapsanmayan tek şey
yazma sırasındaki debounce zamanlaması.

## Bu paket yazılırken yakalanan hata

`components/editor/EssayEditor.tsx` içindeki `toggleAi`, profil güncellemesini
`await` etmiyordu:

```ts
// ÖNCE — istek hiç gönderilmiyordu
supabase.from("profiles").update({ ai_warnings_enabled: next }).eq("user_id", …)
```

supabase-js sorgu kurucuları **tembel thenable**'dır: `await` edilmediği sürece
`fetch` hiç çağrılmaz. Editördeki AI anahtarı bu yüzden kalıcı olmuyordu — sayfa
yenilenince profildeki eski değere dönüyordu. Hata düzeltildi ve
`editor/EssayEditor.test.tsx` içindeki
*"açıldığında tercihi profile KAYDEDER"* testiyle sabitlendi.

Bu, taklit Supabase istemcisinin neden bilerek "tembel" davrandığını da açıklıyor
(`helpers/supabase-mock.ts`): işlem yalnızca zincir **tüketildiğinde** kaydedilir.
Taklit hevesle davransaydı bu hata testten geçerdi. Ayrıntı: Usta klasöründe
`ai/LESSONS.md` → L-011.
