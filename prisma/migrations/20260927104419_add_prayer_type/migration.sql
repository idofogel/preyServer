-- CreateEnum
CREATE TYPE "PrayerType" AS ENUM ('SHACHARIT', 'MINCHA', 'ARVIT');

-- AlterTable
ALTER TABLE "Prayer" ADD COLUMN     "prayerType" "PrayerType" NOT NULL DEFAULT 'SHACHARIT';
