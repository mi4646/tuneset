export interface Credential {
  [key: string]: unknown;
}

export interface ProposalItem {
  song_id: number;
  song_type: number;
  category: string;
  reason: string;
}

export interface DragFeedback {
  song_id: number;
  from_category: string;
  to_category: string;
}

export interface SongItem {
  song_id: number;
  song_type: number;
  name: string;
  singer: string;
  labels?: string[];
  lyric?: string;
}
