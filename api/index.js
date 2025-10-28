import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = "./data.json";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "devsecret";
const MAX_OFFLINE_SECONDS = 7 * 24 * 60 * 60; // 7 gün tavan
const MAX_ROBOT_LEVEL = 5;

// ---- util: dosya okuma/yazma ----
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function findOrCreateUser(telegram_id, username, name) {
  const users = readData();
  let u = users.find((x) => String(x.telegram_id) === String(telegram_id));
  if (!u) {
    u = {
      telegram_id,
      username: username || "",
      name: name || "",
      prtq: 0,
      robot_level: 0,
      last_robot_ts: new Date().toISOString(),
    };
    users.push(u);
    saveData(users);
  }
  return { user: u, users };
}

// ---- robot tahakkuk hesaplama ----
function applyRobotAccrual(user) {
  const lvl = Number(user.robot_level || 0);
  if (lvl <= 0) {
    user.last_robot_ts = new Date().toISOString();
    return;
  }
  const now = Date.now();
  const last = user.last_robot_ts ? new Date(user.last_robot_ts).getTime() : now;
  let deltaSec = Math.floor((now - last) / 1000);
  if (deltaSec <= 0) {
    user.last_robot_ts = new Date(now).toISOString();
    return;
  }
  // güvenlik: çok uzun kapalı kalma tavanı
  if (deltaSec > MAX_OFFLINE_SECONDS) deltaSec = MAX_OFFLINE_SECONDS;

  const gain = deltaSec * lvl; // 1 sn * seviye
  user.prtq = Number(user.prtq || 0) + gain;
  user.last_robot_ts = new Date(now).toISOString();
}

// ---- root ----
app.get("/", (_req, res) => {
  res.send("✅ Pratique Backend Çalışıyor!");
});

// ---- kullanıcıyı getir (tahakkuk uygulanmış) ----
app.get("/me", (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: "telegram_id gerekiyor" });

  const { user, users } = findOrCreateUser(telegram_id);
  applyRobotAccrual(user);
  saveData(users);
  res.json(user);
});

// ---- update: frontend sayacı gönderir (önce robot tahakkuk) ----
app.post("/update", (req, res) => {
  const { telegram_id, username, name, prtq } = req.body;
  if (!telegram_id || prtq == null) {
    return res.status(400).json({ error: "Eksik veri" });
  }
  const { user, users } = findOrCreateUser(telegram_id, username, name);
  // önce robot tahakkuk
  applyRobotAccrual(user);

  // güvenli güncelleme: sunucu değeri ile istemci değeri arasından yükseği al
  user.prtq = Math.max(Number(user.prtq || 0), Number(prtq));
  if (username) user.username = username;
  if (name) user.name = name;

  saveData(users);
  return res.json({ success: true, prtq: user.prtq });
});

// ---- leaderboard: sıralama öncesi herkese tahakkuk uygula ----
app.get("/leaderboard", (_req, res) => {
  const users = readData();
  users.forEach(applyRobotAccrual);
  saveData(users);
  const top = users
    .sort((a, b) => Number(b.prtq || 0) - Number(a.prtq || 0))
    .slice(0, 50);
  res.json(top);
});

// ---- satın alma simülasyonu (test): webhook yokken dev içi aktif et ----
app.post("/robot/activate", (req, res) => {
  const { telegram_id, level, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "Yetkisiz" });
  if (!telegram_id || !level) return res.status(400).json({ error: "Eksik veri" });

  const lvl = Math.max(0, Math.min(MAX_ROBOT_LEVEL, Number(level)));
  const { user, users } = findOrCreateUser(telegram_id);
  applyRobotAccrual(user);

  user.robot_level = lvl;
  user.last_robot_ts = new Date().toISOString();
  saveData(users);
  res.json({ success: true, robot_level: lvl });
});


// ---- 💳 Yeni: Robot ödeme sistemi ----

// Sahte ödeme linki oluştur (frontend çağırır)
app.post("/create-payment", (req, res) => {
  const { telegram_id, currentLevel } = req.body;
  if (!telegram_id) return res.status(400).json({ error: "Eksik kullanıcı" });

  const nextLevel = Number(currentLevel) + 1;
  if (nextLevel > MAX_ROBOT_LEVEL)
    return res.status(400).json({ error: "Maksimum robot seviyesi!" });

  const prices = [50, 100, 150, 200, 250];
  const amount = prices[currentLevel] || 50;
  const fakePaymentLink = `https://pay.pratique.app/?telegram_id=${telegram_id}&level=${nextLevel}&amount=${amount}`;

  res.json({
    success: true,
    nextLevel,
    amount,
    paymentLink: fakePaymentLink,
  });
});

// Ödeme onayı (gerçekte webhook tetikler)
app.post("/verify-payment", (req, res) => {
  const { telegram_id, amount, secret } = req.body;
  if (secret !== ADMIN_SECRET) return res.status(403).json({ error: "Yetkisiz" });
  if (!telegram_id || !amount) return res.status(400).json({ error: "Eksik veri" });

  const { user, users } = findOrCreateUser(telegram_id);
  applyRobotAccrual(user);

  const priceMap = { 50: 1, 100: 2, 150: 3, 200: 4, 250: 5 };
  const newLevel = priceMap[amount] || user.robot_level;

  if (newLevel > user.robot_level) {
    user.robot_level = newLevel;
    user.last_robot_ts = new Date().toISOString();
    saveData(users);
    return res.json({ success: true, robot_level: newLevel });
  }

  res.json({ success: false, message: "Zaten aynı veya daha yüksek seviye." });
});

export default app;
