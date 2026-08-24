/**
 * =============================================================================
 * Taylor Made Thoughts — site configuration
 * =============================================================================
 *
 * Replace the PASTE_YOUR_... values in this file before deploying.
 * This is the only place you need to edit URLs and podcast copy.
 *
 * Used by:
 *   - the website (script.js)
 *   - the RSS importer (scripts/fetch-podcast.bb)
 * =============================================================================
 */

const SITE_CONFIG = {
  siteName: "Taylor Made Thoughts",
  siteUrl: "https://TaylorMadeThoughts.com",
  tagline: "Ideas, mental models, experiments, and lessons worth thinking about.",

  /**
   * PASTE YOUR SPOTIFY PODCAST RSS FEED URL HERE
   * Example: https://anchor.fm/s/xxxxxxxx/podcast/rss
   */
  rssFeedUrl: "https://anchor.fm/s/112faa100/podcast/rss",

  /**
   * Platform listen / follow URLs
   */
  spotifyUrl: "https://open.spotify.com/show/033mDoNOh60l2wnQjd0O3w",
  applePodcastsUrl: "https://podcasts.apple.com/us/podcast/taylor-made-thoughts/id1896855385",
  amazonMusicUrl: "https://music.amazon.com/podcasts/d62afe46-805b-41b3-bdb9-56caa3b68896/taylor-made-thoughts",
  youtubeUrl: "https://www.youtube.com/playlist?list=PLJkOuZmOTnCnYR5jdiWPiS0tI2nrX4y4J",

  /**
   * About section copy. Replace this with your own description.
   */
  about:
    "Taylor-Made Thoughts is where I share my personal reflections on books, mental models, and frameworks that shape how I think and live. Whether you’re here for practical insights or to spark your own thinking, these episodes are crafted with care—just for you.",

  /**
   * How many recent episodes to show on the homepage.
   * The archive page lists every imported episode.
   */
  homepageEpisodeCount: 5,

  /**
   * Maximum number of episodes to import from the RSS feed.
   */
  maxEpisodes: 100,

  /**
   * Max characters for episode descriptions on the homepage.
   */
  descriptionMaxLength: 220,

  /**
   * Local artwork used when an episode has no image of its own.
   */
  fallbackArtwork: "assets/podcast-artwork.jpg",
};

if (typeof window !== "undefined") {
  window.SITE_CONFIG = SITE_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SITE_CONFIG;
}
