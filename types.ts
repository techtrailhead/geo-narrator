export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GroundingSource {
  uri: string;
  title: string;
  type: 'web' | 'maps';
}

export interface PlaceInfo {
  name: string;
  description: string;
  oneLiner: string;
  category: string;
  imageUrl?: string;
}

export interface Transcript {
  id: number;
  speaker: 'user' | 'model';
  text: string;
}