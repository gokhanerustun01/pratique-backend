import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Geçici veritabanı (RAM üzerinde)
let users = [];

// 🔹 Kullanıcı kaydetme/güncelleme endpoint
app.post("/update", (req, res) => {
  const { telegram_id, username, name, prtq } = req.body;
  if (!telegram_id || prtq == null) {
    return res.status(400).json({ error: "Eksik veri" });
  }

  const existing = users.find((u) => u.telegram_id === telegram_id);

  if (existing) {
    existing.prtq = prtq;
    existing.username = username;
    existing.name = name;
  } else {
    users.push({ telegram_id, username, name, prtq });
  }

  return res.json({ success: true });
});

// 🔹 Leaderboard endpoint
app.get("/leaderboard", (req, res) => {
  const sorted = users.sort((a, b) => b.prtq - a.prtq).slice(0, 20);
  res.json(sorted);
});

// 🔹 Test endpoint
app.get("/", (req, res) => {
  res.send("✅ Pratique Backend Çalışıyor!");
});

export default app;
