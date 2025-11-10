-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "robotLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ManualPayment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
