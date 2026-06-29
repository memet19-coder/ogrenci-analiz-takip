# Öğrenci Analiz ve Takip Uygulaması

Railway üzerinde yayınlanmaya hazır Node.js + PostgreSQL sürümüdür.

## Railway Kurulum

1. Railway'de yeni proje oluşturun.
2. Bu klasörü GitHub'a gönderip Railway'e bağlayın ya da Railway CLI ile deploy edin.
3. Railway projesine PostgreSQL servisi ekleyin.
4. Uygulama servisinde şu değişkenleri tanımlayın:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEACHER_PASSWORD=guclu-bir-sifre
SESSION_SECRET=uzun-rastgele-bir-anahtar
NODE_ENV=production
```

5. Railway otomatik olarak `npm install` ve `npm start` çalıştırır.

## Giriş

- Öğretmen: belirlediğiniz `TEACHER_PASSWORD` ile giriş yapar.
- Öğrenci: öğretmen panelindeki öğrenci koduyla giriş yapar.

Öğrenci deneme, günlük soru veya yanlış analizi girdiğinde kayıt PostgreSQL'e yazılır. Öğretmen paneli aynı veritabanından okuduğu için bu kayıtları görür.

## Demo Bilgileri

İlk açılışta örnek öğrenciler ve şu öğrenci kodları oluşturulur:

- `arda-2026`
- `zeynep-2026`
- `can-2026`
- `elif-2026`
- `mert-2026`

Varsayılan öğretmen şifresi sadece yerel/demo kullanım içindir: `demo123`. Railway'de mutlaka `TEACHER_PASSWORD` değiştirin.
