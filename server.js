import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function initDb() {
  await pool.query(`
    create extension if not exists pgcrypto;

    create table if not exists students (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      class_name text not null,
      target_exam text not null,
      target_net numeric not null default 0,
      target_score numeric not null default 0,
      weekly_goal integer not null default 500,
      archived boolean not null default false,
      access_code text not null unique default encode(gen_random_bytes(4), 'hex'),
      created_at timestamptz not null default now()
    );

    create table if not exists subjects (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      topics text[] not null default '{}'
    );

    create table if not exists entries (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      date date not null,
      subject text not null,
      topic text not null,
      total integer not null default 0,
      correct integer not null default 0,
      wrong integer not null default 0,
      blank integer not null default 0,
      study_minutes integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists exams (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      name text not null,
      date date not null,
      type text not null,
      score numeric not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists exam_details (
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references exams(id) on delete cascade,
      subject text not null,
      total integer not null default 0,
      correct integer not null default 0,
      wrong integer not null default 0,
      blank integer not null default 0
    );

    create table if not exists mistakes (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      date date not null,
      subject text not null,
      topic text not null,
      type text not null,
      count integer not null default 1,
      note text not null default '',
      created_at timestamptz not null default now()
    );

    create table if not exists notes (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      date date not null default current_date,
      text text not null,
      created_at timestamptz not null default now()
    );

    create table if not exists reading_entries (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null references students(id) on delete cascade,
      date date not null,
      book_title text not null default '',
      pages integer not null default 0,
      note text not null default '',
      created_at timestamptz not null default now()
    );

    create table if not exists upcoming_exams (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      date date not null,
      type text not null
    );
  `);
  await pool.query("alter table students add column if not exists archived boolean not null default false");
  await pool.query("alter table students add column if not exists access_code text");
  await pool.query("update students set access_code = encode(gen_random_bytes(4), 'hex') where access_code is null");
  await pool.query("alter table students alter column access_code set default encode(gen_random_bytes(4), 'hex')");
  await pool.query("alter table students alter column access_code set not null");
  await pool.query("alter table entries add column if not exists study_minutes integer not null default 0");
  await normalizeMiddleSchoolSubjects();

  const [{ count }] = await query("select count(*)::int as count from students");
  if (count === 0) await seedDb();
}

function middleSchoolCurriculumSubjects() {
  return [
    ["Türkçe", [
      "5. Sınıf - Oyun Dünyası", "5. Sınıf - Atatürk'ü Tanımak", "5. Sınıf - Duygularımı Tanıyorum", "5. Sınıf - Geleneklerimiz", "5. Sınıf - İletişim ve Sosyal İlişkiler", "5. Sınıf - Sağlıklı Yaşıyorum",
      "6. Sınıf - Dilimizin Zenginliği", "6. Sınıf - Bağımsızlık Yolu", "6. Sınıf - Farklı Dünyalar", "6. Sınıf - İletişim ve Sosyal İlişkiler", "6. Sınıf - Bilim ve Teknoloji", "6. Sınıf - Lider Ruhlar",
      "7. Sınıf - Hayat Boyu Gelişim", "7. Sınıf - Bir Hilal Uğruna", "7. Sınıf - İletişim ve Sosyal İlişkiler", "7. Sınıf - Türk Sanatı", "7. Sınıf - Okuma Kültürü", "7. Sınıf - Hak ve Sorumluluklar",
      "8. Sınıf - İletişim ve Sosyal İlişkiler", "8. Sınıf - Vatan Sevgisi", "8. Sınıf - Doğa ve İnsan", "8. Sınıf - Türk Hikaye Geleneği ve Destanları", "8. Sınıf - Sanat ve Estetik", "8. Sınıf - Akademik Düşünme Dünyası"
    ]],
    ["Matematik", [
      "5. Sınıf - Sayılar ve Nicelikler 1", "5. Sınıf - Sayılar ve Nicelikler 2", "5. Sınıf - İşlemlerle Cebirsel Düşünme", "5. Sınıf - Geometrik Şekiller", "5. Sınıf - Geometrik Nicelikler", "5. Sınıf - İstatistiksel Araştırma Süreci", "5. Sınıf - Veriden Olasılığa",
      "6. Sınıf - Sayılar ve Nicelikler 1", "6. Sınıf - Sayılar ve Nicelikler 2", "6. Sınıf - İşlemlerle Cebirsel Düşünme ve Değişimler", "6. Sınıf - Geometrik Şekiller", "6. Sınıf - Geometrik Nicelikler", "6. Sınıf - İstatistiksel Araştırma Süreci", "6. Sınıf - Veriden Olasılığa",
      "7. Sınıf - Sayılar ve Nicelikler 1", "7. Sınıf - Sayılar ve Nicelikler 2", "7. Sınıf - İşlemlerle Cebirsel Düşünme ve Değişimler", "7. Sınıf - Dönüşüm", "7. Sınıf - Geometrik Nicelikler 1", "7. Sınıf - Geometrik Nicelikler 2", "7. Sınıf - Geometrik Şekiller", "7. Sınıf - İstatistiksel Araştırma Süreci", "7. Sınıf - Veriden Olasılığa",
      "8. Sınıf - Sayılar ve Nicelikler", "8. Sınıf - Cebirsel Düşünme ve Değişimler", "8. Sınıf - Geometrik Şekiller", "8. Sınıf - Geometrik Nicelikler", "8. Sınıf - Dönüşüm", "8. Sınıf - İstatistiksel Araştırma Süreci", "8. Sınıf - Veriden Olasılığa"
    ]],
    ["Fen Bilimleri", [
      "5. Sınıf - Gökyüzündeki Komşularımız ve Biz", "5. Sınıf - Kuvveti Tanıyalım", "5. Sınıf - Canlıların Yapısına Yolculuk", "5. Sınıf - Işığın Dünyası", "5. Sınıf - Maddenin Doğası", "5. Sınıf - Yaşamımızdaki Elektrik", "5. Sınıf - Sürdürülebilir Yaşam ve Geri Dönüşüm",
      "6. Sınıf - Güneş Sistemi ve Tutulmalar", "6. Sınıf - Kuvvetin Etkisinde Hareket", "6. Sınıf - Canlılarda Sistemler", "6. Sınıf - Işığın Yansıması ve Renkler", "6. Sınıf - Maddenin Ayırt Edici Özellikleri", "6. Sınıf - Elektriğin İletimi ve Direnç", "6. Sınıf - Sürdürülebilir Yaşam ve Etkileşim",
      "7. Sınıf - Uzay Çağı", "7. Sınıf - Kuvvet ve Enerjiyi Keşfedelim", "7. Sınıf - Vücudumuzdaki Sistemler", "7. Sınıf - Işığın Kırılması ve Mercekler", "7. Sınıf - Maddenin Doğasına Yolculuk", "7. Sınıf - Elektriklenme", "7. Sınıf - Sürdürülebilir Yaşam ve Geri Dönüşüm",
      "8. Sınıf - Mevsimler ve İklim", "8. Sınıf - Yaşamı Kolaylaştıran Kuvvet", "8. Sınıf - Yaşamın Gizemi", "8. Sınıf - Sesin Dünyası", "8. Sınıf - Periyodik Tablo ve Maddenin Etkileşimi", "8. Sınıf - Elektriğin Yolculuğu", "8. Sınıf - Sürdürülebilir Yaşam ve Madde Döngüleri"
    ]],
    ["Sosyal Bilimler", [
      "5. Sınıf - Birlikte Yaşamak", "5. Sınıf - Evimiz Dünya", "5. Sınıf - Ortak Mirasımız", "5. Sınıf - Yaşayan Demokrasimiz", "5. Sınıf - Hayatımızdaki Ekonomi", "5. Sınıf - Teknoloji ve Sosyal Bilimler",
      "6. Sınıf - Birlikte Yaşamak", "6. Sınıf - Evimiz Dünya", "6. Sınıf - Ortak Mirasımız", "6. Sınıf - Yaşayan Demokrasimiz", "6. Sınıf - Hayatımızdaki Ekonomi", "6. Sınıf - Teknoloji ve Sosyal Bilimler",
      "7. Sınıf - Birlikte Yaşamak", "7. Sınıf - Evimiz Dünya", "7. Sınıf - Ortak Mirasımız", "7. Sınıf - Yaşayan Demokrasimiz", "7. Sınıf - Hayatımızdaki Ekonomi", "7. Sınıf - Teknoloji ve Sosyal Bilimler",
      "8. Sınıf - Mustafa Kemal'in Hayatı", "8. Sınıf - Birinci Dünya Savaşı", "8. Sınıf - Milli Mücadele", "8. Sınıf - Türkiye Cumhuriyeti'nin Kuruluşu ve İnkılaplar"
    ]],
    ["Din Kültürü", [
      "5. Sınıf - Allah İnancı", "5. Sınıf - Namaz", "5. Sınıf - Kur'an-ı Kerim", "5. Sınıf - Peygamber Kıssaları", "5. Sınıf - Mimarimizde Dini Motifler",
      "6. Sınıf - Peygamber ve İlahi Kitap İnancı", "6. Sınıf - Ramazan ve Oruç", "6. Sınıf - Ahlaki Davranışlar", "6. Sınıf - Peygamberliğinden Önce Hz. Muhammed", "6. Sınıf - Kültürümüzdeki Dini Motifler",
      "7. Sınıf - Melek ve Ahiret İnancı", "7. Sınıf - Hac, Umre ve Kurban", "7. Sınıf - İslam Düşüncesinde Yorumlar", "7. Sınıf - Peygamber Olarak Hz. Muhammed", "7. Sınıf - Yaşayan Dünya Dinleri",
      "8. Sınıf - Kader İnancı", "8. Sınıf - Zekat ve Sadaka", "8. Sınıf - Din ve Sosyal Hayat", "8. Sınıf - Kur'an ve İnsan", "8. Sınıf - Müslümanların Bilim ve Kültüre Katkısı"
    ]],
    ["İngilizce", [
      "5. Sınıf - Classroom Life", "5. Sınıf - Family Life", "5. Sınıf - Life in Nature", "5. Sınıf - Life in the Neighbourhood & City", "5. Sınıf - Life in the Universe & Future", "5. Sınıf - Life in the World", "5. Sınıf - Personal Life", "5. Sınıf - School Life",
      "6. Sınıf - Classroom Life", "6. Sınıf - Family Life", "6. Sınıf - Life in Nature & Global Problems", "6. Sınıf - Life in the Neighbourhood & City", "6. Sınıf - Life in the Universe & Future", "6. Sınıf - Life in the World & Culture", "6. Sınıf - Personal Life", "6. Sınıf - School Life",
      "7. Sınıf - School Life & Education", "7. Sınıf - Classroom Life & Learning", "7. Sınıf - Personal Life & Well-Being", "7. Sınıf - Family Life & Home", "7. Sınıf - Life in the Neighbourhood & City and Social Life", "7. Sınıf - Life in the World & Culture", "7. Sınıf - Life in Nature", "7. Sınıf - Life in the Universe & Future",
      "8. Sınıf - School Life & Education", "8. Sınıf - Classroom Life & Learning", "8. Sınıf - Personal Life & Well-Being", "8. Sınıf - Family Life & Home", "8. Sınıf - Life in the Neighbourhood & City & Social Life", "8. Sınıf - Life in the World and Culture", "8. Sınıf - Life in Nature & Global Problems", "8. Sınıf - Life in the Universe & Future"
    ]]
  ];
}

async function normalizeMiddleSchoolSubjects() {
  const subjects = middleSchoolCurriculumSubjects();
  const allowed = subjects.map(([name]) => name);
  await query("update entries set subject='Sosyal Bilimler' where subject='Sosyal Bilgiler'");
  await query("update mistakes set subject='Sosyal Bilimler' where subject='Sosyal Bilgiler'");
  await query("update exam_details set subject='Sosyal Bilimler' where subject='Sosyal Bilgiler'");
  await query("update upcoming_exams set type='LGS' where type in ('TYT','TYT/AYT','AYT','YKS')");
  await query("update students set target_exam='LGS' where target_exam in ('TYT','TYT/AYT','AYT','YKS')");
  await query("update students set class_name='8/A' where class_name !~ '^[5-8]/'");
  await query("delete from subjects where name <> all($1::text[])", [allowed]);
  for (const [name, topics] of subjects) {
    await query(
      "insert into subjects(name, topics) values($1,$2) on conflict(name) do update set topics=excluded.topics",
      [name, topics]
    );
  }
}

async function seedDb() {
  const subjects = middleSchoolCurriculumSubjects();

  for (const [name, topics] of subjects) {
    await query("insert into subjects(name, topics) values($1,$2) on conflict(name) do nothing", [name, topics]);
  }

  const students = [
    ["Arda Yılmaz", "8/A", "LGS", 75, 430, 700],
    ["Zeynep Kaya", "7/B", "Okul Başarısı", 72, 420, 650],
    ["Can Demir", "6/C", "Okul Başarısı", 68, 400, 600],
    ["Elif Şahin", "5/A", "Okul Başarısı", 70, 410, 580],
    ["Mert Demir", "8/B", "LGS", 78, 450, 720]
  ];

  for (const studentData of students) {
    const [student] = await query(
      `insert into students(name,class_name,target_exam,target_net,target_score,weekly_goal)
       values($1,$2,$3,$4,$5,$6) returning *`,
      studentData
    );
    await seedStudent(student);
  }

  await query(
    "insert into upcoming_exams(name,date,type) values($1,current_date + interval '5 days',$2)",
    ["Haftalık Kazanım Denemesi", "LGS"]
  );
}

async function seedStudent(student) {
  const subjectNames = ["Türkçe", "Matematik", "Fen Bilimleri", "İngilizce", "Sosyal Bilimler", "Din Kültürü"];
  const topics = ["Paragraf", "Problemler", "Canlılar", "Grammar", "Harita okuma", "Ahlak"];

  for (let week = 5; week >= 0; week--) {
    for (let i = 0; i < subjectNames.length; i++) {
      const total = 55 + i * 11 + (5 - week) * 7;
      const wrong = Math.max(2, Math.round(total * (0.2 - (5 - week) * 0.01)));
      const blank = Math.max(1, Math.round(total * 0.05));
      await query(
        `insert into entries(student_id,date,subject,topic,total,correct,wrong,blank,study_minutes)
         values($1,current_date - ($2::int * interval '1 day'),$3,$4,$5,$6,$7,$8,$9)`,
        [student.id, week * 7 + i, subjectNames[i], topics[i], total, total - wrong - blank, wrong, blank, 45 + i * 5]
      );
    }
  }

  for (let i = 0; i < 4; i++) {
    const [exam] = await query(
      `insert into exams(student_id,name,date,type,score)
       values($1,$2,current_date - ($3::int * interval '1 day'),$4,$5) returning id`,
      [student.id, `${i + 1}. Genel Deneme`, 35 - i * 10, student.target_exam, 320 + i * 24]
    );

    for (const subject of ["Türkçe", "Matematik", "Fen Bilimleri", "İngilizce", "Sosyal Bilimler", "Din Kültürü"]) {
      const total = subject === "Matematik" || subject === "Türkçe" ? 20 : 10;
      const wrong = Math.max(1, 7 - i);
      const blank = Math.max(0, 3 - i);
      await query(
        "insert into exam_details(exam_id,subject,total,correct,wrong,blank) values($1,$2,$3,$4,$5,$6)",
        [exam.id, subject, total, total - wrong - blank, wrong, blank]
      );
    }
  }

  for (const [subject, topic, type] of [
    ["Matematik", "Problemler", "İşlem hatası"],
    ["Türkçe", "Paragraf", "Yorum hatası"],
    ["Fen Bilimleri", "Elektrik", "Bilgi eksikliği"],
    ["Sosyal Bilimler", "Harita okuma", "Konuyu karıştırma"]
  ]) {
    await query(
      "insert into mistakes(student_id,date,subject,topic,type,count,note) values($1,current_date,$2,$3,$4,$5,$6)",
      [student.id, subject, topic, type, 2, "Tekrar listesine eklendi."]
    );
  }

  await query("insert into notes(student_id,text) values($1,$2)", [
    student.id,
    "Problem ve paragraf çalışmalarında düzenli takip önerilir."
  ]);

  for (let i = 0; i < 5; i++) {
    await query(
      `insert into reading_entries(student_id,date,book_title,pages,note)
       values($1,current_date - ($2::int * interval '1 day'),$3,$4,$5)`,
      [student.id, i * 2, "Haftalık okuma kitabı", 12 + i * 3, "Günlük okuma takibi"]
    );
  }
}

app.get("/api/state", async (req, res) => {
  const students = await query(`
    select id,name,class_name as "className",target_exam as "targetExam",
           target_net as "targetNet",target_score as "targetScore",
           weekly_goal as "weeklyGoal",archived,created_at as "createdAt"
    from students
    order by created_at
  `);
  const ids = students.map(s => s.id);
  const subjects = await query("select id,name,topics from subjects order by name");
  const upcomingExams = await query("select id,name,to_char(date,'YYYY-MM-DD') as date,type from upcoming_exams order by date");

  if (ids.length === 0) {
    return res.json({ students, subjects, entries: [], exams: [], mistakes: [], notes: [], readings: [], upcomingExams });
  }

  const entries = await query(
    `select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,subject,topic,total,correct,wrong,blank,study_minutes as "studyMinutes"
     from entries where student_id = any($1::uuid[]) order by date desc, created_at desc`,
    [ids]
  );
  const exams = await query(
    `select id,student_id as "studentId",name,to_char(date,'YYYY-MM-DD') as date,type,score
     from exams where student_id = any($1::uuid[]) order by date`,
    [ids]
  );
  const details = exams.length
    ? await query(
        `select exam_id as "examId",subject,total,correct,wrong,blank
         from exam_details where exam_id = any($1::uuid[])`,
        [exams.map(e => e.id)]
      )
    : [];
  const mistakes = await query(
    `select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,subject,topic,type,count,note
     from mistakes where student_id = any($1::uuid[]) order by date desc, created_at desc`,
    [ids]
  );
  const notes = await query(
    `select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,text
     from notes where student_id = any($1::uuid[]) order by date desc, created_at desc`,
    [ids]
  );
  const readings = await query(
    `select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,
            book_title as "bookTitle",pages,note
     from reading_entries where student_id = any($1::uuid[]) order by date desc, created_at desc`,
    [ids]
  );

  res.json({
    students,
    subjects,
    entries,
    exams: exams.map(exam => ({ ...exam, details: details.filter(d => d.examId === exam.id) })),
    mistakes,
    notes,
    readings,
    upcomingExams
  });
});

app.post("/api/students", async (req, res) => {
  const s = req.body;
  const [student] = await query(
    `insert into students(name,class_name,target_exam,target_net,target_score,weekly_goal,access_code)
     values($1,$2,$3,$4,$5,$6,encode(gen_random_bytes(4), 'hex')) returning id`,
    [s.name, s.className, s.targetExam, s.targetNet, s.targetScore, s.weeklyGoal]
  );
  res.status(201).json(student);
});

app.put("/api/students/:id", async (req, res) => {
  const s = req.body;
  await query(
    `update students
     set name=$1,class_name=$2,target_exam=$3,target_net=$4,target_score=$5,weekly_goal=$6
     where id=$7`,
    [s.name, s.className, s.targetExam, s.targetNet, s.targetScore, s.weeklyGoal, req.params.id]
  );
  res.json({ ok: true });
});

app.patch("/api/students/:id/archive", async (req, res) => {
  await query("update students set archived=$1 where id=$2", [Boolean(req.body.archived), req.params.id]);
  res.json({ ok: true });
});

app.delete("/api/students/:id", async (req, res) => {
  await query("delete from students where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/subjects", async (req, res) => {
  await query(
    "insert into subjects(name,topics) values($1,$2) on conflict(name) do update set topics=excluded.topics",
    [req.body.name, req.body.topics || []]
  );
  res.status(201).json({ ok: true });
});

app.post("/api/subjects/:id/topics", async (req, res) => {
  await query("update subjects set topics = array_append(topics,$1) where id=$2", [req.body.topic, req.params.id]);
  res.json({ ok: true });
});

app.post("/api/entries", async (req, res) => {
  const e = req.body;
  await query(
    "insert into entries(student_id,date,subject,topic,total,correct,wrong,blank,study_minutes) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [e.studentId, e.date, e.subject, e.topic, e.total, e.correct, e.wrong, e.blank, e.studyMinutes || 0]
  );
  res.status(201).json({ ok: true });
});

app.put("/api/entries/:id", async (req, res) => {
  const e = req.body;
  await query(
    `update entries
     set student_id=$1,date=$2,subject=$3,topic=$4,total=$5,correct=$6,wrong=$7,blank=$8,study_minutes=$9
     where id=$10`,
    [e.studentId, e.date, e.subject, e.topic, e.total, e.correct, e.wrong, e.blank, e.studyMinutes || 0, req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/entries/:id", async (req, res) => {
  await query("delete from entries where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/exams", async (req, res) => {
  const e = req.body;
  const [exam] = await query(
    "insert into exams(student_id,name,date,type,score) values($1,$2,$3,$4,$5) returning id",
    [e.studentId, e.name, e.date, e.type, e.score]
  );
  for (const d of e.details || []) {
    await query(
      "insert into exam_details(exam_id,subject,total,correct,wrong,blank) values($1,$2,$3,$4,$5,$6)",
      [exam.id, d.subject, d.total, d.correct, d.wrong, d.blank]
    );
  }
  res.status(201).json({ ok: true });
});

app.put("/api/exams/:id", async (req, res) => {
  const e = req.body;
  await query("update exams set student_id=$1,name=$2,date=$3,type=$4,score=$5 where id=$6", [
    e.studentId,
    e.name,
    e.date,
    e.type,
    e.score,
    req.params.id
  ]);
  await query("delete from exam_details where exam_id=$1", [req.params.id]);
  for (const d of e.details || []) {
    await query(
      "insert into exam_details(exam_id,subject,total,correct,wrong,blank) values($1,$2,$3,$4,$5,$6)",
      [req.params.id, d.subject, d.total, d.correct, d.wrong, d.blank]
    );
  }
  res.json({ ok: true });
});

app.delete("/api/exams/:id", async (req, res) => {
  await query("delete from exams where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/mistakes", async (req, res) => {
  const m = req.body;
  await query(
    "insert into mistakes(student_id,date,subject,topic,type,count,note) values($1,$2,$3,$4,$5,$6,$7)",
    [m.studentId, m.date, m.subject, m.topic, m.type, m.count, m.note || ""]
  );
  res.status(201).json({ ok: true });
});

app.put("/api/mistakes/:id", async (req, res) => {
  const m = req.body;
  await query(
    `update mistakes
     set student_id=$1,date=$2,subject=$3,topic=$4,type=$5,count=$6,note=$7
     where id=$8`,
    [m.studentId, m.date, m.subject, m.topic, m.type, m.count, m.note || "", req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/mistakes/:id", async (req, res) => {
  await query("delete from mistakes where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/readings", async (req, res) => {
  const r = req.body;
  await query(
    "insert into reading_entries(student_id,date,book_title,pages,note) values($1,$2,$3,$4,$5)",
    [r.studentId, r.date, r.bookTitle || "", r.pages || 0, r.note || ""]
  );
  res.status(201).json({ ok: true });
});

app.put("/api/readings/:id", async (req, res) => {
  const r = req.body;
  await query(
    `update reading_entries
     set student_id=$1,date=$2,book_title=$3,pages=$4,note=$5
     where id=$6`,
    [r.studentId, r.date, r.bookTitle || "", r.pages || 0, r.note || "", req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/readings/:id", async (req, res) => {
  await query("delete from reading_entries where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/notes", async (req, res) => {
  await query("insert into notes(student_id,text) values($1,$2)", [req.body.studentId, req.body.text]);
  res.status(201).json({ ok: true });
});

app.post("/api/upcoming-exams", async (req, res) => {
  await query("insert into upcoming_exams(name,date,type) values($1,$2,$3)", [req.body.name, req.body.date, req.body.type]);
  res.status(201).json({ ok: true });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası." });
});

initDb()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`Server running on ${port}`)))
  .catch(err => {
    console.error("Database init failed", err);
    process.exit(1);
  });
