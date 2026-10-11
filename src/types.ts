export type PrayerType = "SHACHARIT" | "MINCHA" | "ARVIT";

export interface PrayerDTO {
  id: string;
  lat: number;
  lng: number;
  details: string;
  prayerType: PrayerType;
  createdAt: string;
  presentCount: number;
  comingCount: number;
  started: boolean;
  distanceKm?: number;
  interested?: boolean;
}

export interface PrayerOwnerDTO extends PrayerDTO {
  seekerToken: string;
}
