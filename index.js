import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const DATA_FILE = "./data.json";

// Verileri oku/yaz
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE);
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 🔹 Kullanıcı kaydetme/güncelleme endpoint
app.post("/update", (req, res) => {
  const { telegram_id, username, name, prtq } = req.body;
  if (!telegram_id || prtq == null) {
    return res.status(400).json({ error: "Eksik veri" });
  }

  const users = readData();
  const existing = users.find((u) => u.telegram_id === telegram_id);

  if (existing) {
    existing.prtq = prtq;
    existing.username = username;
    existing.name = name;
  } else {
    users.push({ telegram_id, username, name, prtq });
  }

  saveData(users);
  return res.json({ success: true });
});

// 🔹 Leaderboard endpoint
app.get("/leaderboard", (req, res) => {
  const users = readData();
  const sorted = users.sort((a, b) => b.prtq - a.prtq).slice(0, 20);
  res.json(sorted);
});

app.get("/", (req, res) => {
  res.send("✅ Pratique Backend Çalışıyor!");
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`🚀 Backend running on port ${process.env.PORT}`)
);
