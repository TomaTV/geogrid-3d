export interface ScanNode {
  lat: number;
  lng: number;
  rank: number | null;
  self?: { lat: number; lng: number; rating?: number; reviews?: number };
  competitors?: { cid: string; name: string; rank: number; rating?: number; reviews?: number }[];
}

export interface Scan {
  id: string;
  keyword: string;
  target_name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  grid_size: number;
  status: string;
  visibility_score: number | null;
  grid_data: ScanNode[];
  completed_at?: string;
  note: string;
  tag: string;
  saved_at: string;
}

export type GridSize = 5 | 7 | 13 | 21;

export interface ScanRequest {
  address: string;
  keyword: string;
  business: string;
  grid: GridSize;
  radius: number;
  note: string;
}

export const SCAN_MODE: 'mock' | 'live' = 'mock';
