// Photo mode module entry (see PhotoMode.js). Loads after the UI and post-processing.
import './photo.css';
import { PhotoMode } from './PhotoMode.js';

export async function init(G) {
  if (!G.renderer || !G.postfx) return;
  G.photoMode = new PhotoMode(G);
}
