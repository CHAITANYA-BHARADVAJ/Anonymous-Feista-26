// SDMCET (Shri Dharmasthala Manjunatheshwara College of Engineering and Technology)
// Dhavalagiri, Dharwad, Karnataka 580002
export const SDMCET_CENTER: [number, number] = [15.4286, 75.0150];

// Campus Strict Bounds (Locks strictly to SDMCET grounds)
export const SDMCET_MAX_BOUNDS: [[number, number], [number, number]] = [
  [15.4230, 75.0080], // Southwest
  [15.4345, 75.0210], // Northeast
];

// Official SDMCET Campus Polygon Perimeter (from OpenStreetMap)
export const SDMCET_CAMPUS_POLYGON: [number, number][] = [
  [15.4311411, 75.0122669],
  [15.4309472, 75.012304],
  [15.430364, 75.0127714],
  [15.4294168, 75.0134151],
  [15.4273797, 75.0141976],
  [15.4268949, 75.0141991],
  [15.4263716, 75.0141587],
  [15.4261208, 75.0143012],
  [15.4259164, 75.0143631],
  [15.4259373, 75.0145117],
  [15.4261461, 75.0151724],
  [15.4261632, 75.0155108],
  [15.4266764, 75.0156597],
  [15.4271422, 75.0159209],
  [15.4278694, 75.0161173],
  [15.429317, 75.0164907],
  [15.4297153, 75.0166547],
  [15.4304989, 75.0169181],
  [15.4309726, 75.0156047],
  [15.4314469, 75.0146484],
  [15.4320167, 75.0136859],
  [15.4320346, 75.0132356],
  [15.431699, 75.0126955],
  [15.4314424, 75.0125563],
  [15.4311411, 75.0122669],
];

export interface TileSource {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const SATELLITE_SOURCES: Record<string, TileSource> = {
  google: {
    id: 'google',
    name: 'Google Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Satellite Imagery',
    maxZoom: 20,
  },
  google_hybrid: {
    id: 'google_hybrid',
    name: 'Satellite + Labels',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Hybrid Imagery',
    maxZoom: 20,
  },
  esri: {
    id: 'esri',
    name: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri World Imagery',
    maxZoom: 19,
  },
  osm: {
    id: 'osm',
    name: 'Street Map',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
};
