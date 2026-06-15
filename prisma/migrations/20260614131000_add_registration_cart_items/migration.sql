CREATE TABLE "registration_cart_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conferenceId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "couponCode" TEXT,
  "attendeesJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registration_cart_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registration_cart_items_userId_idx" ON "registration_cart_items"("userId");
CREATE INDEX "registration_cart_items_conferenceId_idx" ON "registration_cart_items"("conferenceId");
CREATE INDEX "registration_cart_items_skuId_idx" ON "registration_cart_items"("skuId");

ALTER TABLE "registration_cart_items"
  ADD CONSTRAINT "registration_cart_items_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registration_cart_items"
  ADD CONSTRAINT "registration_cart_items_conferenceId_fkey"
  FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registration_cart_items"
  ADD CONSTRAINT "registration_cart_items_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "registration_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
