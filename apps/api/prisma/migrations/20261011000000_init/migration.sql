-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ReminderPreset" AS ENUM ('DEFAULT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'APPROVED', 'ACTIVE', 'COMPLETED', 'IGNORED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "Importance" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "notificationTime" TEXT NOT NULL DEFAULT '07:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "pushSubscription" JSONB,
    "reminderPreset" "ReminderPreset" NOT NULL DEFAULT 'DEFAULT',
    "customReminders" INTEGER[] DEFAULT ARRAY[4320, 1440, 60, 30, 5]::INTEGER[],
    "gmailConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastBackfillAt" TIMESTAMP(3),
    "lastScannedAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3),
    "nextNotifyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "ScanStatus" NOT NULL DEFAULT 'RUNNING',
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "eventsDetected" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailSender" TEXT NOT NULL,
    "gmailLink" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "importance" "Importance" NOT NULL DEFAULT 'MEDIUM',
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "googleCalendarEventId" TEXT,
    "calendarError" TEXT,
    "calendarRetryCount" INTEGER NOT NULL DEFAULT 0,
    "autoDeleteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_nextScanAt_idx" ON "User"("nextScanAt");

-- CreateIndex
CREATE INDEX "User_nextNotifyAt_idx" ON "User"("nextNotifyAt");

-- CreateIndex
CREATE INDEX "ScanLog_userId_startedAt_idx" ON "ScanLog"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "DetectedEvent_userId_status_idx" ON "DetectedEvent"("userId", "status");

-- CreateIndex
CREATE INDEX "DetectedEvent_autoDeleteAt_idx" ON "DetectedEvent"("autoDeleteAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedEvent_userId_gmailMessageId_key" ON "DetectedEvent"("userId", "gmailMessageId");

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedEvent" ADD CONSTRAINT "DetectedEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
