import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ✅ MANUEL TRC20 ÖDEME BAŞLATMA ENDPOINT
app.post("/manual-trc20/start", async (req, res) => {
  try {
    const { userId, level } = req.body;
    if (!userId || !level) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    const amountUSD = [0, 50, 100, 150, 200, 250][level];
    if (!amountUSD) {
      return res.status(400).json({ error: "Geçersiz seviye" });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: String(userId) },
    });

    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    const payment = await prisma.manualPayment.create({
      data: {
        userId: user.id,
        level,
        amountUSD,
        status: "PENDING",
      },
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

// ✅ HASH ONAYI (kullanıcı ödemeyi yaptıktan sonra)
app.post("/manual-trc20/confirm", async (req, res) => {
  try {
    const { paymentId, txHash } = req.body;
    if (!paymentId || !txHash) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    const payment = await prisma.manualPayment.update({
      where: { id: paymentId },
      data: { txHash, status: "PENDING" },
    });

    res.json({
      message: "✅ İşlem hash'i kaydedildi, onay bekliyor.",
      payment,
    });
  } catch (err) {
    console.error("manual-trc20/confirm error:", err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// ✅ ADMIN ONAYI (manuel kontrol sonrası)
app.post("/admin/manual-trc20/approve", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

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

// Basit test endpoint
app.get("/", (req, res) => {
  res.send("✅ TRC20 Manual Payment API Çalışıyor!");
});

// ✅ Vercel export
export default app;
