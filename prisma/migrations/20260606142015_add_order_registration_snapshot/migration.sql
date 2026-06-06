-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "registrationSnapshotJson" JSONB;
