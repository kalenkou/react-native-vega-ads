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
}

export const MOVIE: Movie = {
  title: 'Tears of Steel',
  meta: '2012 · 12 min · Sci-fi',
  description:
    'A group of warriors and scientists gathers at the Oude Kerk in Amsterdam to stage a crucial event from the past, in a desperate attempt to rescue the world from destructive robots.',
  credit: '(CC) Blender Foundation | mango.blender.org · CC BY 3.0',
  uri: `${MEDIA_BASE}tears_of_steel_720p.mp4`,
  poster: `${MEDIA_BASE}poster.jpg`,
  vmapUrl: `${MEDIA_BASE}vmap/movie.xml`,
  pauseAdUrl: `${MEDIA_BASE}vast/pause.xml`,
};
