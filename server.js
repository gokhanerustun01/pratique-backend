// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Telegram bot başlat
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// 🔹 /start komutu - Telegram'dan gelen kullanıcıyı kaydeder
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const refCode = match[1]?.trim().replace(" ", "") || null;
  const user = msg.from;

  try {
    let existing = await prisma.user.findUnique({
      where: { telegramId: String(user.id) },
    });

    if (!existing) {
      // Yeni kullanıcı oluştur
      const inviteCode = `INV-${user.id}`;
      await prisma.user.create({
        data: {
          telegramId: String(user.id),
          username: user.username || null,
          firstName: user.first_name || null,
          photoUrl: user.photo_url || null,
          inviteCode,
          invitedBy: refCode || null,
        },
      });

      // Davet eden varsa davet sayısını arttır
      if (refCode) {
        const inviter = await prisma.user.findUnique({
          where: { inviteCode: refCode },
        });
        if (inviter) {
          await prisma.user.update({
            where: { id: inviter.id },
            data: { inviteCount: inviter.inviteCount + 1 },
          });
        }
      }

      bot.sendMessage(
        chatId,
        `👋 Hoş geldin ${user.first_name || "kullanıcı"}!\n\nHesabın oluşturuldu ✅`
      );
    } else {
      bot.sendMessage(chatId, "✅ Zaten kayıtlısın!");
    }
  } catch (err) {
    console.error("Kullanıcı kaydında hata:", err);
    bot.sendMessage(chatId, "⚠️ Bir hata oluştu, sonra tekrar dene.");
  }
});

// 🔹 Kullanıcı kayıt / güncelleme endpoint (Frontend Profile.jsx çağırıyor)
app.post("/user/register", async (req, res) => {
  try {
    const { telegramId, username, firstName, photoUrl, invitedBy } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId eksik" });

    let user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!user) {
      const inviteCode = `INV-${telegramId}`;
      user = await prisma.user.create({
        data: {
          telegramId: String(telegramId),
          username,
          firstName,
          photoUrl,
          inviteCode,
          invitedBy,
        },
      });

      // Davet eden varsa davet sayısını arttır
      if (invitedBy) {
        const inviter = await prisma.user.findUnique({
          where: { inviteCode: invitedBy },
        });
        if (inviter) {
          await prisma.user.update({
            where: { id: inviter.id },
            data: { inviteCount: inviter.inviteCount + 1 },
          });
        }
      }
    } else {
      // Mevcut kullanıcıyı güncelle
      user = await prisma.user.update({
        where: { telegramId: String(telegramId) },
        data: { username, firstName, photoUrl },
      });
    }

    res.json(user);
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// 🔹 Kullanıcı bilgilerini almak için endpoint (isteğe bağlı)
app.get("/user/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;
    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json(user);
  } catch (err) {
    console.error("user fetch error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// 🔹 Davet sayısını dönen endpoint
app.get("/user/invites/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      select: { inviteCount: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ inviteCount: user.inviteCount });
  } catch (err) {
    console.error("Invite count error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// 🔹 Test: Veritabanındaki tüm kullanıcıları döner (db bağlantısını test için)
app.get("/debug/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json({ total: users.length, users });
  } catch (err) {
    console.error("debug error:", err);
    res.status(500).json({ error: "db erişim hatası" });
  }
});

// Basit test endpoint’i
app.get("/", (req, res) => {
  res.send("✅ Pratique Backend Çalışıyor!");
});

// Sunucu başlat
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
