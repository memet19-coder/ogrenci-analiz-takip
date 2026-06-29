import crypto from "node:crypto";
import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const teacherPassword = process.env.TEACHER_PASSWORD || "demo123";
const tokenSecret = process.env.SESSION_SECRET || "change-this-secret-on-railway";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

function auth(requiredRole) {
  return (req, res, next) => {
    const payload = verify((req.headers.authorization || "").replace("Bearer ", ""));
    if (!payload) return res.status(401).json({ error: "Oturum gerekli." });
    if (requiredRole && payload.role !== requiredRole) return res.status(403).json({ error: "Yetki yok." });
    req.user = payload;
    next();
  };
}

function canReadStudent(req, studentId) {
  return req.user.role === "teacher" || req.user.studentId === studentId;
}

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
      access_code text not null unique,
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
    create table if not exists upcoming_exams (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      date date not null,
      type text not null
    );
  `);

  const [{ count }] = await query("select count(*)::int as count from students");
  if (count === 0) await seedDb();
}

async function seedDb() {
  const subjects = [
    ["Türkçe", ["Paragraf", "Sözcükte anlam", "Cümlede anlam", "Dil bilgisi"]],
    ["Matematik", ["Problemler", "Denklemler", "Geometri", "Oran orantı"]],
    ["Fen Bilimleri", ["Kuvvet ve hareket", "Madde", "Canlılar", "Elektrik"]],
    ["Sosyal Bilgiler", ["İnkılaplar", "Harita bilgisi", "Kültür", "Ekonomi"]],
    ["Tarih", ["Osmanlı", "Kurtuluş Savaşı", "Çağdaş Türk tarihi"]],
    ["Coğrafya", ["İklim", "Nüfus", "Harita", "Bölgeler"]],
    ["Fizik", ["Hareket", "Optik", "Elektrik", "Basınç"]],
    ["Kimya", ["Atom", "Mol", "Asit baz", "Tepkimeler"]],
    ["Biyoloji", ["Hücre", "Genetik", "Ekoloji", "Sistemler"]],
    ["Din Kültürü", ["İbadet", "Ahlak", "Hz. Muhammed", "Kuran"]],
    ["İngilizce", ["Vocabulary", "Reading", "Grammar", "Dialogue"]]
  ];
  for (const [name, topics] of subjects) {
    await query("insert into subjects(name, topics) values($1,$2) on conflict(name) do nothing", [name, topics]);
  }

  const students = [
    ["Arda Yılmaz", "12/A", "TYT/AYT", 85, 440, 900, "arda-2026"],
    ["Zeynep Kaya", "12/B", "TYT/AYT", 82, 430, 850, "zeynep-2026"],
    ["Can Demir", "11/C", "YKS", 76, 405, 780, "can-2026"],
    ["Elif Şahin", "12/D", "TYT/AYT", 80, 420, 820, "elif-2026"],
    ["Mert Demir", "8/A", "LGS", 72, 410, 700, "mert-2026"]
  ];

  for (const s of students) {
    const [student] = await query(
      `insert into students(name,class_name,target_exam,target_net,target_score,weekly_goal,access_code)
       values($1,$2,$3,$4,$5,$6,$7) returning *`,
      s
    );
    await seedStudent(student);
  }
  await query("insert into upcoming_exams(name,date,type) values($1,current_date + interval '5 days',$2)", ["Haftalık Kazanım Denemesi", "TYT"]);
}

async function seedStudent(student) {
  const subjectNames = ["Türkçe", "Matematik", "Fen Bilimleri", "İngilizce", "Sosyal Bilgiler"];
  for (let w = 5; w >= 0; w--) {
    for (let i = 0; i < subjectNames.length; i++) {
      const total = 55 + i * 11 + (5 - w) * 7;
      const wrong = Math.max(2, Math.round(total * (0.2 - (5 - w) * 0.01)));
      const blank = Math.max(1, Math.round(total * 0.05));
      await query(
        `insert into entries(student_id,date,subject,topic,total,correct,wrong,blank)
         values($1,current_date - ($2::int * interval '1 day'),$3,$4,$5,$6,$7,$8)`,
        [student.id, w * 7 + i, subjectNames[i], ["Paragraf", "Problemler", "Canlılar", "Grammar", "Harita bilgisi"][i], total, total - wrong - blank, wrong, blank]
      );
    }
  }

  for (let i = 0; i < 4; i++) {
    const [exam] = await query(
      `insert into exams(student_id,name,date,type,score)
       values($1,$2,current_date - ($3::int * interval '1 day'),$4,$5) returning id`,
      [student.id, `${i + 1}. Genel Deneme`, 35 - i * 10, student.target_exam, 320 + i * 24]
    );
    for (const subject of ["Türkçe", "Matematik", "Fen Bilimleri", "İngilizce"]) {
      const total = subject === "Matematik" ? 20 : 15;
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
    ["Fen Bilimleri", "Elektrik", "Bilgi eksikliği"]
  ]) {
    await query(
      "insert into mistakes(student_id,date,subject,topic,type,count,note) values($1,current_date,$2,$3,$4,$5,$6)",
      [student.id, subject, topic, type, 2, "Tekrar listesine eklendi."]
    );
  }
  await query("insert into notes(student_id,text) values($1,$2)", [student.id, "Problem ve paragraf çalışmalarında düzenli takip önerilir."]);
}

app.post("/api/login/teacher", async (req, res) => {
  if (req.body.password !== teacherPassword) return res.status(401).json({ error: "Öğretmen şifresi hatalı." });
  res.json({ token: sign({ role: "teacher" }), user: { role: "teacher", name: "Öğretmen" } });
});

app.post("/api/login/student", async (req, res) => {
  const [student] = await query("select * from students where access_code=$1", [req.body.accessCode]);
  if (!student) return res.status(401).json({ error: "Öğrenci bağlantı kodu hatalı." });
  res.json({ token: sign({ role: "student", studentId: student.id }), user: { role: "student", studentId: student.id, name: student.name } });
});

app.get("/api/me", auth(), async (req, res) => res.json({ user: req.user }));

app.get("/api/state", auth(), async (req, res) => {
  const studentFilter = req.user.role === "student" ? "where id=$1" : "";
  const studentParams = req.user.role === "student" ? [req.user.studentId] : [];
  const students = await query(`select id,name,class_name as "className",target_exam as "targetExam",target_net as "targetNet",target_score as "targetScore",weekly_goal as "weeklyGoal",access_code as "accessCode" from students ${studentFilter} order by created_at`, studentParams);
  const ids = students.map(s => s.id);
  if (ids.length === 0) return res.json({ students: [], subjects: [], entries: [], exams: [], mistakes: [], notes: [], upcomingExams: [] });
  const subjects = await query("select id,name,topics from subjects order by name");
  const entries = await query(`select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,subject,topic,total,correct,wrong,blank from entries where student_id = any($1::uuid[]) order by date desc`, [ids]);
  const exams = await query(`select id,student_id as "studentId",name,to_char(date,'YYYY-MM-DD') as date,type,score from exams where student_id = any($1::uuid[]) order by date`, [ids]);
  const details = await query(`select exam_id as "examId",subject,total,correct,wrong,blank from exam_details where exam_id = any($1::uuid[])`, [exams.map(e => e.id)]);
  const mistakes = await query(`select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,subject,topic,type,count,note from mistakes where student_id = any($1::uuid[]) order by date desc`, [ids]);
  const notes = await query(`select id,student_id as "studentId",to_char(date,'YYYY-MM-DD') as date,text from notes where student_id = any($1::uuid[]) order by date desc`, [ids]);
  const upcomingExams = await query("select id,name,to_char(date,'YYYY-MM-DD') as date,type from upcoming_exams order by date");
  res.json({ students, subjects, entries, exams: exams.map(e => ({ ...e, details: details.filter(d => d.examId === e.id) })), mistakes, notes, upcomingExams });
});

app.post("/api/students", auth("teacher"), async (req, res) => {
  const s = req.body;
  const [student] = await query(
    `insert into students(name,class_name,target_exam,target_net,target_score,weekly_goal,access_code)
     values($1,$2,$3,$4,$5,$6,$7) returning id`,
    [s.name, s.className, s.targetExam, s.targetNet, s.targetScore, s.weeklyGoal, s.accessCode || `ogrenci-${crypto.randomBytes(3).toString("hex")}`]
  );
  res.status(201).json(student);
});

app.put("/api/students/:id", auth("teacher"), async (req, res) => {
  const s = req.body;
  await query(
    `update students set name=$1,class_name=$2,target_exam=$3,target_net=$4,target_score=$5,weekly_goal=$6,access_code=$7 where id=$8`,
    [s.name, s.className, s.targetExam, s.targetNet, s.targetScore, s.weeklyGoal, s.accessCode, req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/students/:id", auth("teacher"), async (req, res) => {
  await query("delete from students where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/subjects", auth("teacher"), async (req, res) => {
  await query("insert into subjects(name,topics) values($1,$2) on conflict(name) do update set topics=excluded.topics", [req.body.name, req.body.topics || []]);
  res.status(201).json({ ok: true });
});

app.post("/api/subjects/:id/topics", auth("teacher"), async (req, res) => {
  await query("update subjects set topics = array_append(topics,$1) where id=$2", [req.body.topic, req.params.id]);
  res.json({ ok: true });
});

app.post("/api/entries", auth(), async (req, res) => {
  if (!canReadStudent(req, req.body.studentId)) return res.status(403).json({ error: "Yetki yok." });
  const e = req.body;
  await query(
    "insert into entries(student_id,date,subject,topic,total,correct,wrong,blank) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [e.studentId, e.date, e.subject, e.topic, e.total, e.correct, e.wrong, e.blank]
  );
  res.status(201).json({ ok: true });
});

app.delete("/api/entries/:id", auth("teacher"), async (req, res) => {
  await query("delete from entries where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/exams", auth(), async (req, res) => {
  if (!canReadStudent(req, req.body.studentId)) return res.status(403).json({ error: "Yetki yok." });
  const e = req.body;
  const [exam] = await query("insert into exams(student_id,name,date,type,score) values($1,$2,$3,$4,$5) returning id", [e.studentId, e.name, e.date, e.type, e.score]);
  for (const d of e.details || []) {
    await query("insert into exam_details(exam_id,subject,total,correct,wrong,blank) values($1,$2,$3,$4,$5,$6)", [exam.id, d.subject, d.total, d.correct, d.wrong, d.blank]);
  }
  res.status(201).json({ ok: true });
});

app.delete("/api/exams/:id", auth("teacher"), async (req, res) => {
  await query("delete from exams where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/mistakes", auth(), async (req, res) => {
  if (!canReadStudent(req, req.body.studentId)) return res.status(403).json({ error: "Yetki yok." });
  const m = req.body;
  await query("insert into mistakes(student_id,date,subject,topic,type,count,note) values($1,$2,$3,$4,$5,$6,$7)", [m.studentId, m.date, m.subject, m.topic, m.type, m.count, m.note || ""]);
  res.status(201).json({ ok: true });
});

app.delete("/api/mistakes/:id", auth("teacher"), async (req, res) => {
  await query("delete from mistakes where id=$1", [req.params.id]);
  res.json({ ok: true });
});

app.post("/api/notes", auth("teacher"), async (req, res) => {
  await query("insert into notes(student_id,text) values($1,$2)", [req.body.studentId, req.body.text]);
  res.status(201).json({ ok: true });
});

app.post("/api/upcoming-exams", auth("teacher"), async (req, res) => {
  await query("insert into upcoming_exams(name,date,type) values($1,$2,$3)", [req.body.name, req.body.date, req.body.type]);
  res.status(201).json({ ok: true });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Sunucu hatası." });
});

initDb()
  .then(() => app.listen(port, () => console.log(`Server running on ${port}`)))
  .catch(err => {
    console.error("Database init failed", err);
    process.exit(1);
  });
