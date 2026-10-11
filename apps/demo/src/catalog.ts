import {MEDIA_BASE} from './media.local';

export interface Movie {
  title: string;
  /** "2012 · 12 min · Sci-fi" */
  meta: string;
  description: string;
  credit: string;
  uri: string;
  poster: string;
  /** VMAP with the ad breaks: pre-roll, mid-rolls at shot changes and silent black frames, post-roll. */
  vmapUrl: string;
  /** Pause ad (IAB CTV Ad Portfolio): a still image while the viewer has paused the movie. */
  pauseAdUrl: string;
  /** Integrated loudness of the movie, LUFS (EBU R128): louder ads are turned down to it. */
  contentLoudness: number;
}

export const TEARS_OF_STEEL: Movie = {
  title: 'Tears of Steel',
  meta: '2012 · 12 min · Sci-fi',
  description:
    'A group of warriors and scientists gathers at the Oude Kerk in Amsterdam to stage a crucial event from the past, in a desperate attempt to rescue the world from destructive robots.',
  credit: '(CC) Blender Foundation | mango.blender.org · CC BY 3.0',
  uri: `${MEDIA_BASE}tears_of_steel_720p.mp4`,
  poster: `${MEDIA_BASE}poster.jpg`,
  vmapUrl: `${MEDIA_BASE}vmap/movie.xml`,
  pauseAdUrl: `${MEDIA_BASE}vast/pause.xml`,
  // tools/demo-ads/get_media.sh brings the sound to -24 LUFS and measures it (loudness.json).
  contentLoudness: -23.7,
};

export const SINTEL: Movie = {
  title: 'Sintel',
  meta: '2010 · 15 min · Fantasy',
  description:
    'A lonely girl searches the world for the baby dragon she once saved. The journey takes her through snow, a crowded city and a dark cave, where she finds more than she looked for.',
  credit: '© copyright Blender Foundation | durian.blender.org · CC BY 3.0',
  uri: `${MEDIA_BASE}sintel_720p.mp4`,
  poster: `${MEDIA_BASE}poster_sintel.jpg`,
  vmapUrl: `${MEDIA_BASE}vmap/sintel.xml`,
  pauseAdUrl: `${MEDIA_BASE}vast/pause.xml`,
  contentLoudness: -23.0,
};

/** The titles in the order the details screen shows them. */
export const MOVIES: readonly Movie[] = [TEARS_OF_STEEL, SINTEL];
