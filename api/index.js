import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const prisma = new PrismaClient();

// ⬇⬇⬇ ADMIN ŞİFRE KONTROLÜ BURADA (YENİ EKLEME) ⬇⬇⬇
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

const requireAdmin = (req, res, next) => {
  const key = req.query.key || req.body?.key;

  if (!key || key !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};
// ⬆⬆⬆ ADMIN KONTROLÜ BURADA (YENİ EKLEME) ⬆⬆⬆


// ✅ TRC20 Manuel ödeme başlangıcı
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
      wallet: process.env.TRC20_WALLET_ADDRESS,
      amountUSD,
      paymentId: payment.id,
    });
  } catch (err) {
    console.error("manual-trc20/start error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// 🔄 Kullanıcı senkronizasyonu (Otomatik robot güncellemesi için)
app.post("/user/sync", async (req, res) => {
  try {
    const { telegramId } = req.body;
    if (!telegramId) {
      return res.status(400).json({ error: "Eksik telegramId" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      select: {
        prtqBalance: true,
        robotLevel: true,
        inviteCount: true,
        username: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error("user/sync error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// ⬇⬇⬇⬇⬇ YENİ EKLENEN  —  ROBOT LEVEL ENDPOINT ⬇⬇⬇⬇⬇
app.get("/user/robot-level/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;

    if (!telegramId) {
      return res.status(400).json({ error: "Eksik telegramId" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      select: { robotLevel: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    res.json({ robotLevel: user.robotLevel });
  } catch (err) {
    console.error("robot-level error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});
// ⬆⬆⬆⬆⬆ YENİ EKLENEN  —  ROBOT LEVEL ENDPOINT ⬆⬆⬆⬆⬆


// ✅ Kullanıcıların PRTQ bakiyesini güncelleme
app.post("/user/update-balance", async (req, res) => {
  try {
    const { telegramId, balance } = req.body;
    if (!telegramId || typeof balance !== "number") {
      return res.status(400).json({ error: "Eksik veya geçersiz veri" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    await prisma.user.update({
      where: { telegramId: String(telegramId) },
      data: { prtqBalance: balance },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("update-balance error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// ✅ Kullanıcının davet sayısını döndürme (Profile.jsx için)
app.get("/user/invites/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;
    if (!telegramId) {
      return res.status(400).json({ error: "Eksik telegramId" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: String(telegramId) },
      select: { inviteCount: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    res.json({ inviteCount: user.inviteCount });
  } catch (err) {
    console.error("inviteCount error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// ✅ Kullanıcıları listeleme (debug)
app.get("/debug/users", async (req, res) => {
  const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
  if (ADMIN_SECRET) {
    if ((req.query.key || "") !== ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        telegramId: true,
        username: true,
        prtqBalance: true,
        invitedBy: true,
        inviteCount: true,
        robotLevel: true,
        createdAt: true,
      },
      orderBy: { id: "desc" },
      take: 200,
    });

    res.json({ users });
  } catch (err) {
    console.error("Kullanıcıları çekerken hata:", err);
    res.status(500).json({ error: "Sunucu hatası", detail: String(err?.message || err) });
  }
});


// 🔐 Admin: TRC20 manuel ödemeleri listele (ADIM 3)
app.get("/admin/manual-trc20/list", requireAdmin, async (req, res) => {
  try {
    const payments = await prisma.manualPayment.findMany({
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            prtqBalance: true,
            robotLevel: true,
            inviteCount: true,
          },
        },
      },
      orderBy: { id: "desc" },
      take: 200,
    });

    res.json({ payments });
  } catch (err) {
    console.error("admin list error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// 🔐 Admin: TRC20 ödemeyi ONAYLA (ADIM 4)
app.post("/admin/manual-trc20/approve", requireAdmin, async (req, res) => {
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

    res.json({
      message: `🤖 Kullanıcı ${payment.userId} için Robot Level ${payment.level} aktif edildi.`,
    });
  } catch (err) {
    console.error("admin/manual-trc20/approve error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// 🔐 Admin: TRC20 ödemeyi REDDET (ADIM 5)
app.post("/admin/manual-trc20/reject", requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "Eksik bilgi" });

    await prisma.manualPayment.update({
      where: { id: paymentId },
      data: { status: "REJECTED" },
    });

    res.json({
      message: `❌ Payment #${paymentId} reddedildi.`,
    });
  } catch (err) {
    console.error("admin/manual-trc20/reject error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// 🔐 Kullanıcı TX HASH gönderme (YENİ EKLENDİ)
app.post("/manual-trc20/submit-hash", async (req, res) => {
  try {
    const { paymentId, txHash } = req.body;

    if (!paymentId || !txHash) {
      return res.status(400).json({ error: "Eksik bilgi (paymentId veya txHash yok)" });
    }

    const payment = await prisma.manualPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment bulunamadı" });
    }

    await prisma.manualPayment.update({
      where: { id: paymentId },
      data: { txHash: txHash, status: "WAITING_ADMIN" },
    });

    res.json({
      success: true,
      message: "TX Hash başarıyla gönderildi. Admin onaylayacak.",
    });

  } catch (err) {
    console.error("submit-hash error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});


// ✅ Ana kontrol
app.get("/", (req, res) => {
  res.send("✅ TRC20 Manual Payment API Çalışıyor!");
});

export default app;
