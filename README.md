# Başarı Akademi Öğrenci Takip

Railway üzerinde yayınlanmaya hazır Node.js + PostgreSQL öğrenci takip uygulamasıdır.

## Yeni Sistem Mantığı

- Ayrı öğretmen ve öğrenci girişi yoktur.
- Öğrenciler sisteme giriş yapmaz.
- Günlük soru, deneme, yanlış analizi ve not girişlerini öğretmen yapar.
- Uygulama tek yönetim paneli olarak açılır.
- Logo `public/mg-logo.png` dosyasından yüklenir.

## Railway Değişkenleri

Uygulamanın çalışması için sadece şu değişkenler yeterlidir:

```env
DATABASE_URL=postgresql://...
NODE_ENV=production
```

Neon kullanıyorsanız `DATABASE_URL` alanına Neon connection string yapıştırın.

## Railway Domain Portu

Public domain oluştururken port sorarsa:

```text
3000
```

## Çalıştırma

```bash
npm install
npm start
```

İlk açılışta örnek öğrenciler, dersler, deneme sonuçları ve yanlış analizleri otomatik oluşturulur.
