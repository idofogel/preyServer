import { Router } from "express";
import type { Prayer } from "@prisma/client";
import { prisma } from "../db";
import { haversineKm } from "../geo";
import { emitPrayerNew, emitPrayerUpdate, emitPrayerRemove } from "../socket";
import type { PrayerDTO, PrayerOwnerDTO } from "../types";

const router = Router();

type PrayerWithCount = Prayer & { _count: { interests: number } };

const PRAYER_TYPES = ["SHACHARIT", "MINCHA", "ARVIT"] as const;

function toDTO(prayer: PrayerWithCount): PrayerDTO {
  return {
    id: prayer.id,
    lat: prayer.lat,
    lng: prayer.lng,
    details: prayer.details,
    prayerType: prayer.prayerType,
    createdAt: prayer.createdAt.toISOString(),
    presentCount: prayer.presentCount,
    comingCount: prayer._count.interests,
    started: prayer.started,
  };
}

function toOwnerDTO(prayer: PrayerWithCount): PrayerOwnerDTO {
  return { ...toDTO(prayer), seekerToken: prayer.seekerToken };
}

const WITH_COUNT = { include: { _count: { select: { interests: true } } } } as const;

// GET /api/prayers?lat=&lng=&radiusKm=&participantToken=
router.get("/", async (req, res) => {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : undefined;
  const radiusKm = req.query.radiusKm !== undefined ? Number(req.query.radiusKm) : undefined;
  const participantToken =
    typeof req.query.participantToken === "string" ? req.query.participantToken : undefined;

  const prayers = await prisma.prayer.findMany({
    ...WITH_COUNT,
    orderBy: { createdAt: "desc" },
  });

  let dtos: PrayerDTO[] = prayers.map(toDTO);

  if (lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    dtos = dtos.map((p) => ({ ...p, distanceKm: haversineKm(lat, lng, p.lat, p.lng) }));
    if (radiusKm !== undefined && !Number.isNaN(radiusKm)) {
      dtos = dtos.filter((p) => (p.distanceKm ?? Infinity) <= radiusKm);
    }
  }

  if (participantToken) {
    const myInterests = await prisma.interest.findMany({
      where: { participantToken, prayerId: { in: dtos.map((p) => p.id) } },
      select: { prayerId: true },
    });
    const interestedIds = new Set(myInterests.map((i) => i.prayerId));
    dtos = dtos.map((p) => ({ ...p, interested: interestedIds.has(p.id) }));
  }

  res.json(dtos);
});

// GET /api/prayers/mine?seekerToken=
router.get("/mine", async (req, res) => {
  const seekerToken = typeof req.query.seekerToken === "string" ? req.query.seekerToken : "";
  if (!seekerToken) return res.status(400).json({ error: "seekerToken is required" });

  const prayer = await prisma.prayer.findFirst({
    where: { seekerToken },
    orderBy: { createdAt: "desc" },
    ...WITH_COUNT,
  });

  if (!prayer) return res.status(404).json({ error: "not found" });
  res.json(toOwnerDTO(prayer));
});

// POST /api/prayers  { lat, lng, details?, prayerType?, seekerToken }
router.post("/", async (req, res) => {
  const { lat, lng, details, prayerType, seekerToken } = req.body as {
    lat?: number;
    lng?: number;
    details?: string;
    prayerType?: string;
    seekerToken?: string;
  };

  if (typeof lat !== "number" || typeof lng !== "number" || !seekerToken) {
    return res.status(400).json({ error: "lat, lng and seekerToken are required" });
  }
  if (prayerType !== undefined && !PRAYER_TYPES.includes(prayerType as (typeof PRAYER_TYPES)[number])) {
    return res.status(400).json({ error: "invalid prayerType" });
  }

  const created = await prisma.prayer.create({
    data: {
      lat,
      lng,
      details: details ?? "",
      seekerToken,
      ...(prayerType ? { prayerType: prayerType as (typeof PRAYER_TYPES)[number] } : {}),
    },
    ...WITH_COUNT,
  });

  const dto = toOwnerDTO(created);
  emitPrayerNew(dto);
  res.status(201).json(dto);
});

type OwnedPrayerResult =
  | { ok: false; status: 404 | 403 }
  | { ok: true; prayer: Prayer };

async function requireOwnedPrayer(
  id: string,
  seekerToken: string | undefined
): Promise<OwnedPrayerResult> {
  const prayer = await prisma.prayer.findUnique({ where: { id } });
  if (!prayer) return { ok: false, status: 404 };
  if (!seekerToken || prayer.seekerToken !== seekerToken) return { ok: false, status: 403 };
  return { ok: true, prayer };
}

// PATCH /api/prayers/:id  { seekerToken, details?, prayerType? }
router.patch("/:id", async (req, res) => {
  const { seekerToken, details, prayerType } = req.body as {
    seekerToken?: string;
    details?: string;
    prayerType?: string;
  };
  const check = await requireOwnedPrayer(req.params.id, seekerToken);
  if (!check.ok) return res.status(check.status).json({ error: "not allowed" });
  if (prayerType !== undefined && !PRAYER_TYPES.includes(prayerType as (typeof PRAYER_TYPES)[number])) {
    return res.status(400).json({ error: "invalid prayerType" });
  }

  const updated = await prisma.prayer.update({
    where: { id: req.params.id },
    data: {
      details: details ?? check.prayer.details,
      prayerType: (prayerType as (typeof PRAYER_TYPES)[number] | undefined) ?? check.prayer.prayerType,
    },
    ...WITH_COUNT,
  });

  const dto = toDTO(updated);
  emitPrayerUpdate(dto);
  res.json(toOwnerDTO(updated));
});

// POST /api/prayers/:id/present  { seekerToken, delta }
router.post("/:id/present", async (req, res) => {
  const { seekerToken, delta } = req.body as { seekerToken?: string; delta?: number };
  const check = await requireOwnedPrayer(req.params.id, seekerToken);
  if (!check.ok) return res.status(check.status).json({ error: "not allowed" });

  const nextCount = Math.max(0, check.prayer.presentCount + (delta ?? 0));
  const updated = await prisma.prayer.update({
    where: { id: req.params.id },
    data: { presentCount: nextCount },
    ...WITH_COUNT,
  });

  const dto = toDTO(updated);
  emitPrayerUpdate(dto);
  res.json(toOwnerDTO(updated));
});

// POST /api/prayers/:id/start  { seekerToken }
router.post("/:id/start", async (req, res) => {
  const { seekerToken } = req.body as { seekerToken?: string };
  const check = await requireOwnedPrayer(req.params.id, seekerToken);
  if (!check.ok) return res.status(check.status).json({ error: "not allowed" });

  const updated = await prisma.prayer.update({
    where: { id: req.params.id },
    data: { started: true },
    ...WITH_COUNT,
  });

  const dto = toDTO(updated);
  emitPrayerUpdate(dto);
  res.json(toOwnerDTO(updated));
});

// DELETE /api/prayers/:id  { seekerToken } (in body)
router.delete("/:id", async (req, res) => {
  const { seekerToken } = req.body as { seekerToken?: string };
  const check = await requireOwnedPrayer(req.params.id, seekerToken);
  if (!check.ok) return res.status(check.status).json({ error: "not allowed" });

  await prisma.prayer.delete({ where: { id: req.params.id } });
  emitPrayerRemove(req.params.id);
  res.status(204).send();
});

// POST /api/prayers/:id/toggle-interest  { participantToken }
router.post("/:id/toggle-interest", async (req, res) => {
  const { participantToken } = req.body as { participantToken?: string };
  if (!participantToken) return res.status(400).json({ error: "participantToken is required" });

  const prayer = await prisma.prayer.findUnique({ where: { id: req.params.id } });
  if (!prayer) return res.status(404).json({ error: "not found" });

  const existing = await prisma.interest.findUnique({
    where: { prayerId_participantToken: { prayerId: req.params.id, participantToken } },
  });

  if (existing) {
    await prisma.interest.delete({ where: { id: existing.id } });
  } else {
    await prisma.interest.create({ data: { prayerId: req.params.id, participantToken } });
  }

  const updated = await prisma.prayer.findUniqueOrThrow({
    where: { id: req.params.id },
    ...WITH_COUNT,
  });

  const dto = toDTO(updated);
  emitPrayerUpdate(dto);
  res.json({ ...dto, interested: !existing });
});

export default router;
