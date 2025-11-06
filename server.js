// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { PrismaClient } from "@prisma/client";
import fetch from "node-fetch"; // ✅ NowPayments için eklendi

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
  const refCode = match[1]?.trim() || null;
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

      // 🔁 Davet eden varsa davet sayısını artır
      if (refCode) {
        const cleanCode = refCode.trim().toUpperCase();
        const inviter = await prisma.user.findUnique({
          where: { inviteCode: cleanCode },
        });
        if (inviter) {
          await prisma.user.update({
            where: { id: inviter.id },
            data: { inviteCount: { increment: 1 } },
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

      // 🔁 Davet eden varsa davet sayısını artır
      if (invitedBy) {
        const cleanCode = invitedBy.trim().toUpperCase();
        const inviter = await prisma.user.findUnique({
          where: { inviteCode: cleanCode },
        });
        if (inviter) {
          await prisma.user.update({
            where: { id: inviter.id },
            data: { inviteCount: { increment: 1 } },
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

// 💰 Kullanıcının PRTQ bakiyesini güncelle (App.jsx senkronizasyonu)
app.post("/user/update-balance", async (req, res) => {
  try {
    const { telegramId, balance } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId eksik" });

    const user = await prisma.user.update({
      where: { telegramId: String(telegramId) },
      data: { prtqBalance: balance },
    });

    res.json({ success: true, balance: user.prtqBalance });
  } catch (err) {
    console.error("update-balance error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// 💸 NOWPAYMENTS USDT ÖDEME OLUŞTURMA ENDPOINT
app.post("/create-usdt-payment", async (req, res) => {
  try {
    const { userId, level } = req.body;
    if (!userId || !level)
      return res.status(400).json({ error: "Eksik parametre" });

    const priceUSD = [0, 50, 100, 150, 200, 250][level];
    if (!priceUSD)
      return res.status(400).json({ error: "Geçersiz seviye" });

    const response = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: priceUSD,
        price_currency: "usd",
        pay_currency: "usdttrc20",
        order_id: `user_${userId}_robot_${level}`,
        success_url: `${process.env.DOMAIN}/payment-success`,
        cancel_url: `${process.env.DOMAIN}/payment-cancel`,
        is_fee_paid_by_user: true,
      }),
    });

    const data = await response.json();
    if (!data.invoice_url) {
      console.error("NowPayments response:", data);
      return res.status(500).json({ error: "NowPayments yanıtı hatalı" });
    }

    res.json({ url: data.invoice_url });
  } catch (err) {
    console.error("create-usdt-payment error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// 💬 NOWPAYMENTS WEBHOOK - ödeme tamamlanınca robotu aktif et
app.post("/webhook/nowpayments", async (req, res) => {
  try {
    const { order_id, payment_status } = req.body;

    if (payment_status !== "finished") {
      return res.status(200).json({ message: "Ödeme tamamlanmadı." });
    }

    const match = order_id.match(/user_(\d+)_robot_(\d+)/);
    if (!match) return res.status(400).json({ error: "Geçersiz order_id" });

    const [, userId, level] = match;

    await prisma.user.update({
      where: { id: Number(userId) },
      data: { robotLevel: Number(level) },
    });

    console.log(`✅ Kullanıcı ${userId} için Robot Level ${level} aktif edildi.`);
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook hatası" });
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
