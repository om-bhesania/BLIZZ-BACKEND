/*
  Warnings:

  - You are about to drop the column `categoryId` on the `RawMaterial` table. All the data in the column will be lost.
  - You are about to drop the column `isPerishable` on the `RawMaterial` table. All the data in the column will be lost.
  - You are about to drop the column `shelfLife` on the `RawMaterial` table. All the data in the column will be lost.
  - You are about to drop the column `supplierId` on the `RawMaterial` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `RawMaterial` table. All the data in the column will be lost.
  - You are about to drop the column `batchNumber` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `currentStock` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `expiryDate` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `materialId` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `maxStockLevel` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `RawMaterialInventory` table. All the data in the column will be lost.
  - You are about to drop the column `batchNumber` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `expiryDate` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `materialId` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `referenceId` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `shopId` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `transactionType` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `RawMaterialTransaction` table. All the data in the column will be lost.
  - You are about to drop the `ProductRecipe` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RawMaterialCategory` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `RawMaterial` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[rawMaterialId,location]` on the table `RawMaterialInventory` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `quantity` to the `RawMaterialInventory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawMaterialId` to the `RawMaterialInventory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `newStock` to the `RawMaterialTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `previousStock` to the `RawMaterialTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawMaterialId` to the `RawMaterialTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `RawMaterialTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."ProductRecipe" DROP CONSTRAINT "ProductRecipe_materialId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductRecipe" DROP CONSTRAINT "ProductRecipe_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterial" DROP CONSTRAINT "RawMaterial_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterial" DROP CONSTRAINT "RawMaterial_supplierId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterialInventory" DROP CONSTRAINT "RawMaterialInventory_materialId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterialInventory" DROP CONSTRAINT "RawMaterialInventory_shopId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterialTransaction" DROP CONSTRAINT "RawMaterialTransaction_materialId_fkey";

-- DropForeignKey
ALTER TABLE "public"."RawMaterialTransaction" DROP CONSTRAINT "RawMaterialTransaction_shopId_fkey";

-- DropIndex
DROP INDEX "public"."RawMaterial_categoryId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterial_isPerishable_idx";

-- DropIndex
DROP INDEX "public"."RawMaterial_supplierId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialInventory_currentStock_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialInventory_expiryDate_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialInventory_materialId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialInventory_shopId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialInventory_shopId_materialId_key";

-- DropIndex
DROP INDEX "public"."RawMaterialTransaction_materialId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialTransaction_referenceId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialTransaction_shopId_idx";

-- DropIndex
DROP INDEX "public"."RawMaterialTransaction_transactionType_idx";

-- AlterTable
ALTER TABLE "public"."RawMaterial" DROP COLUMN "categoryId",
DROP COLUMN "isPerishable",
DROP COLUMN "shelfLife",
DROP COLUMN "supplierId",
DROP COLUMN "unitPrice",
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "public"."RawMaterialInventory" DROP COLUMN "batchNumber",
DROP COLUMN "currentStock",
DROP COLUMN "expiryDate",
DROP COLUMN "materialId",
DROP COLUMN "maxStockLevel",
DROP COLUMN "shopId",
ADD COLUMN     "location" TEXT NOT NULL DEFAULT 'Factory',
ADD COLUMN     "quantity" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "rawMaterialId" TEXT NOT NULL,
ALTER COLUMN "minStockLevel" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."RawMaterialTransaction" DROP COLUMN "batchNumber",
DROP COLUMN "expiryDate",
DROP COLUMN "materialId",
DROP COLUMN "reason",
DROP COLUMN "referenceId",
DROP COLUMN "shopId",
DROP COLUMN "totalAmount",
DROP COLUMN "transactionType",
DROP COLUMN "unit",
DROP COLUMN "unitPrice",
ADD COLUMN     "newStock" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "previousStock" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "productionBatchId" TEXT,
ADD COLUMN     "rawMaterialId" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;

-- DropTable
DROP TABLE "public"."ProductRecipe";

-- DropTable
DROP TABLE "public"."RawMaterialCategory";

-- CreateTable
CREATE TABLE "public"."Recipe" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "duration" INTEGER,
    "yield" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductionBatch" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recipe_productId_idx" ON "public"."Recipe"("productId");

-- CreateIndex
CREATE INDEX "Recipe_isActive_idx" ON "public"."Recipe"("isActive");

-- CreateIndex
CREATE INDEX "Recipe_isDefault_idx" ON "public"."Recipe"("isDefault");

-- CreateIndex
CREATE INDEX "RecipeItem_recipeId_idx" ON "public"."RecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeItem_rawMaterialId_idx" ON "public"."RecipeItem"("rawMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeItem_recipeId_rawMaterialId_key" ON "public"."RecipeItem"("recipeId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "ProductionBatch_recipeId_idx" ON "public"."ProductionBatch"("recipeId");

-- CreateIndex
CREATE INDEX "ProductionBatch_productId_idx" ON "public"."ProductionBatch"("productId");

-- CreateIndex
CREATE INDEX "ProductionBatch_producedAt_idx" ON "public"."ProductionBatch"("producedAt");

-- CreateIndex
CREATE INDEX "ProductionBatch_createdBy_idx" ON "public"."ProductionBatch"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterial_name_key" ON "public"."RawMaterial"("name");

-- CreateIndex
CREATE INDEX "RawMaterial_unit_idx" ON "public"."RawMaterial"("unit");

-- CreateIndex
CREATE INDEX "RawMaterialInventory_rawMaterialId_idx" ON "public"."RawMaterialInventory"("rawMaterialId");

-- CreateIndex
CREATE INDEX "RawMaterialInventory_location_idx" ON "public"."RawMaterialInventory"("location");

-- CreateIndex
CREATE INDEX "RawMaterialInventory_quantity_idx" ON "public"."RawMaterialInventory"("quantity");

-- CreateIndex
CREATE INDEX "RawMaterialInventory_minStockLevel_idx" ON "public"."RawMaterialInventory"("minStockLevel");

-- CreateIndex
CREATE UNIQUE INDEX "RawMaterialInventory_rawMaterialId_location_key" ON "public"."RawMaterialInventory"("rawMaterialId", "location");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_rawMaterialId_idx" ON "public"."RawMaterialTransaction"("rawMaterialId");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_productionBatchId_idx" ON "public"."RawMaterialTransaction"("productionBatchId");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_type_idx" ON "public"."RawMaterialTransaction"("type");

-- CreateIndex
CREATE INDEX "RawMaterialTransaction_createdBy_idx" ON "public"."RawMaterialTransaction"("createdBy");

-- AddForeignKey
ALTER TABLE "public"."RawMaterialInventory" ADD CONSTRAINT "RawMaterialInventory_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipeItem" ADD CONSTRAINT "RecipeItem_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionBatch" ADD CONSTRAINT "ProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "public"."Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductionBatch" ADD CONSTRAINT "ProductionBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "public"."RawMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RawMaterialTransaction" ADD CONSTRAINT "RawMaterialTransaction_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "public"."ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
