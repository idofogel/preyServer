-- CreateTable
CREATE TABLE "Prayer" (
    "id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "presentCount" INTEGER NOT NULL DEFAULT 0,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "seekerToken" TEXT NOT NULL,

    CONSTRAINT "Prayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interest" (
    "id" TEXT NOT NULL,
    "prayerId" TEXT NOT NULL,
    "participantToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prayer_seekerToken_idx" ON "Prayer"("seekerToken");

-- CreateIndex
CREATE UNIQUE INDEX "Interest_prayerId_participantToken_key" ON "Interest"("prayerId", "participantToken");

-- AddForeignKey
ALTER TABLE "Interest" ADD CONSTRAINT "Interest_prayerId_fkey" FOREIGN KEY ("prayerId") REFERENCES "Prayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
