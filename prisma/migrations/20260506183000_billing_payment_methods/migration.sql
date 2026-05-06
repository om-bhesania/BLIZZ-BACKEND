-- Billing payment method master + partial payment support
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");

ALTER TABLE "Billing"
    ADD COLUMN "paymentMethod" TEXT,
    ADD COLUMN "paymentMethodId" TEXT,
    ADD COLUMN "paymentBreakdown" JSONB;

CREATE INDEX "Billing_paymentMethodId_idx" ON "Billing"("paymentMethodId");

ALTER TABLE "Billing"
    ADD CONSTRAINT "Billing_paymentMethodId_fkey"
    FOREIGN KEY ("paymentMethodId")
    REFERENCES "PaymentMethod"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

INSERT INTO "PaymentMethod" ("name", "isActive", "createdAt", "updatedAt")
VALUES
    ('Cash', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('UPI', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Card', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Bank Transfer', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('Partial Payment', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
