// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

dotenv.config();
const app = express();

// ✅ Prisma tekil instance (Vercel deploy’da hot reload hatasız)
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

/*───────────────────────────────────────────────
 🔹 Telegram bot (sadece local ortamda aktif)
───────────────────────────────────────────────*/
if (!process.env.VERCEL && process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const refCode = match[1]?.trim() || null;
    const user = msg.from;

    try {
      let existing = await prisma.user.findUnique({
        where: { telegramId: String(user.id) },
      });

      if (!existing) {
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

        if (refCode) {
          const inviter = await prisma.user.findUnique({
            where: { inviteCode: refCode.trim().toUpperCase() },
          });
          if (inviter) {
            await prisma.user.update({
              where: { id: inviter.id },
              data: { inviteCount: { increment: 1 } },
            });
          }
        }

        bot.sendMessage(chatId, `👋 Hoş geldin ${user.first_name || "kullanıcı"}! Hesabın oluşturuldu ✅`);
      } else {
        bot.sendMessage(chatId, "✅ Zaten kayıtlısın!");
      }
    } catch (err) {
      console.error("Kullanıcı kaydında hata:", err);
      bot.sendMessage(chatId, "⚠️ Bir hata oluştu, sonra tekrar dene.");
    }
  });
}

/*───────────────────────────────────────────────
 🔹 Kullanıcı işlemleri
───────────────────────────────────────────────*/
app.post("/user/register", async (req, res) => {
  try {
    const { telegramId, username, firstName, photoUrl, invitedBy } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId eksik" });

    let user = await prisma.user.findUnique({ where: { telegramId: String(telegramId) } });

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

      if (invitedBy) {
        const inviter = await prisma.user.findUnique({
          where: { inviteCode: invitedBy.trim().toUpperCase() },
        });
        if (inviter) {
          await prisma.user.update({
            where: { id: inviter.id },
            data: { inviteCount: { increment: 1 } },
          });
        }
      }
    } else {
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

app.get("/user/:telegramId", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: String(req.params.telegramId) },
    });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json(user);
  } catch (err) {
    console.error("user fetch error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

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

/*───────────────────────────────────────────────
 💸 MANUEL TRC20 ÖDEMELER
───────────────────────────────────────────────*/
app.post("/manual-trc20/start", async (req, res) => {
  try {
    const { userId, level } = req.body;
    if (!userId || !level) return res.status(400).json({ error: "Eksik bilgi" });

    const amountUSD = [0, 50, 100, 150, 200, 250][level];
    if (!amountUSD) return res.status(400).json({ error: "Geçersiz seviye" });

    const user = await prisma.user.findUnique({ where: { telegramId: String(userId) } });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const payment = await prisma.manualPayment.create({
      data: { userId: user.id, level, amountUSD, status: "PENDING" },
    });

    res.json({
      message: "💸 TRC20 ödeme kaydı oluşturuldu.",
      wallet: process.env.TRC20_WALLET_ADDRESS || "TRC20_CUZDAN_ADRESİN",
      amountUSD,
      paymentId: payment.id,
    });
  } catch (err) {
    console.error("manual-trc20/start error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post("/manual-trc20/confirm", async (req, res) => {
  try {
    const { paymentId, txHash } = req.body;
    if (!paymentId || !txHash) return res.status(400).json({ error: "Eksik bilgi" });

    const payment = await prisma.manualPayment.update({
      where: { id: paymentId },
      data: { txHash, status: "PENDING" },
    });

    res.json({ message: "✅ İşlem hash'i kaydedildi, onay bekliyor.", payment });
  } catch (err) {
    console.error("manual-trc20/confirm error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post("/admin/manual-trc20/approve", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "Eksik bilgi" });

    const payment = await prisma.manualPayment.update({
      where: { id: paymentId },
      data: { status: "APPROVED" },
      include: { user: true },
    });

    await prisma.user.update({
      where: { id: payment.userId },
      data: { robotLevel: payment.level },
    });

    res.json({ message: `🤖 Kullanıcı ${payment.userId} için Robot Level ${payment.level} aktif edildi.` });
  } catch (err) {
    console.error("admin/manual-trc20/approve error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/*───────────────────────────────────────────────
 🔹 Debug endpoint
───────────────────────────────────────────────*/
app.get("/debug/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ include: { manualPayments: true } });
    res.json({ total: users.length, users });
  } catch (err) {
    console.error("debug error:", err);
    res.status(500).json({ error: "db erişim hatası" });
  }
});


/*───────────────────────────────────────────────
 🧩 TEST USER BAŞLANGIÇ — telefonsuz davet testi
───────────────────────────────────────────────*/
app.get("/debug/create-test-user", async (req, res) => {
  try {
    const randomId = Math.floor(Math.random() * 9000000) + 1000000;

    if (!process.env.TEST_INVITER_ID) {
      return res.status(400).json({ error: "TEST_INVITER_ID .env içinde tanımlı değil" });
    }

    const inviterCode = `INV-${process.env.TEST_INVITER_ID}`;

    const newUser = await prisma.user.create({
      data: {
        telegramId: String(randomId),
        username: `testuser${randomId}`,
        firstName: "Test",
        photoUrl: null,
        inviteCode: `INV-${randomId}`,
        invitedBy: inviterCode,
      },
    });

    const inviter = await prisma.user.findUnique({
      where: { inviteCode: inviterCode },
    });

    if (inviter) {
      await prisma.user.update({
        where: { id: inviter.id },
        data: { inviteCount: { increment: 1 } },
      });
    }

    res.json({
      success: true,
      newUser,
      message: "🚀 Test kullanıcı oluşturuldu ve davet işlendi.",
    });
  } catch (err) {
    console.error("test user error:", err);
    res.status(500).json({ error: "test user oluşturulamadı" });
  }
});
/*───────────────────────────────────────────────
 🧩 TEST USER BİTİŞ
───────────────────────────────────────────────*/


/*───────────────────────────────────────────────
 🔹 Test
───────────────────────────────────────────────*/
app.get("/", (req, res) => {
  res.send("✅ Pratique Backend Çalışıyor!");
});

/*───────────────────────────────────────────────
 🔹 Vercel uyumluluk
───────────────────────────────────────────────*/
if (process.env.VERCEL) {
  console.log("🚀 Running on Vercel serverless mode");
} else {
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}

export default app;
