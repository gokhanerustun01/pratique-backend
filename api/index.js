import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(bodyParser.json());

// ✅ MANUAL TRC20 START
app.post("/manual-trc20/start", async (req, res) => {
  try {
    const { userId, level } = req.body;
    if (!userId || !level) return res.status(400).json({ error: "Eksik bilgi" });

    const amountUSD = [0, 50, 100, 150, 200, 250][level];
    if (!amountUSD) return res.status(400).json({ error: "Geçersiz seviye" });

    const user = await prisma.user.findUnique({
      where: { telegramId: String(userId) },
    });
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

export default app;
