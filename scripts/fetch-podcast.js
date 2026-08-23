#!/usr/bin/env node

/**
 * Fetch the podcast RSS feed and write episodes.json.
 *
 * Paste the RSS URL in ../config.js (rssFeedUrl), then run:
 *   node scripts/fetch-podcast.js
 */

const fs = require("fs");
const path = require("path");
const config = require(path.join(__dirname, "..", "config.js"));

const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "episodes.json");
const EPISODE_DIR = path.join(ROOT, "episodes");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const PLACEHOLDER_PATTERN = /PASTE_YOUR/i;

function readExistingEpisodes() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  } catch (error) {
    return { generatedAt: null, sourceFeed: null, episodes: [] };
  }
}

function writeEpisodes(payload) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function isUsableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim()) && !PLACEHOLDER_PATTERN.test(url);
}

function decodeXmlEntities(value) {
  if (!value) {
    return "";
  }

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCharCode(Number(code));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
      return String.fromCharCode(parseInt(code, 16));
    });
}

function stripHtml(value) {
  return decodeXmlEntities(value)
    .replace(/<\/?(em|i|strong|b|span|a)(?:\s[^>]*)?>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionParagraphs(value) {
  return decodeXmlEntities(value || "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/?(em|i|strong|b|span|a)(?:\s[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(function (part) {
      return part.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

function sanitizeDescriptionHtml(value) {
  var html = decodeXmlEntities(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, function (full, tag, attrs) {
    var name = tag.toLowerCase();
    var allowed = { p: true, br: true, ol: true, ul: true, li: true, strong: true, b: true, em: true, i: true, a: true };
    if (!allowed[name]) {
      return " ";
    }
    if (name === "br") {
      return "<br>";
    }
    if (full.charAt(1) === "/") {
      return "</" + name + ">";
    }
    if (name === "a") {
      var href = firstMatch(attrs || "", /href\s*=\s*["']([^"']+)["']/i);
      if (isUsableUrl(href)) {
        return '<a href="' + escapeHtml(href.trim()) + '" rel="noopener noreferrer" target="_blank">';
      }
      return "";
    }
    return "<" + name + ">";
  });

  return html.replace(/\s+\n/g, "\n").trim();
}

function linkifyHtml(html) {
  return String(html || "")
    .split(/(<[^>]+>)/)
    .map(function (part) {
      if (!part || part.charAt(0) === "<") {
        return part;
      }
      return linkify(part);
    })
    .join("");
}

function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’“”"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "episode"
  );
}

function uniqueSlug(base, used) {
  var slug = base;
  var index = 2;
  while (used[slug]) {
    slug = base.slice(0, 68) + "-" + index;
    index += 1;
  }
  used[slug] = true;
  return slug;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify(value) {
  var source = String(value || "");
  var urlPattern = /https?:\/\/[^\s<>"']+/gi;
  var html = "";
  var lastIndex = 0;
  var match;

  while ((match = urlPattern.exec(source))) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    var rawUrl = match[0].replace(/[),.;:!?]+$/, "");
    var trailing = match[0].slice(rawUrl.length);
    if (/^https?:\/\//i.test(rawUrl)) {
      html +=
        '<a href="' +
        escapeHtml(rawUrl) +
        '" rel="noopener noreferrer" target="_blank">' +
        escapeHtml(rawUrl) +
        "</a>";
    } else {
      html += escapeHtml(rawUrl);
    }
    html += escapeHtml(trailing);
    lastIndex = match.index + match[0].length;
  }

  return html + escapeHtml(source.slice(lastIndex));
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) {
    return text || "";
  }

  var trimmed = text.slice(0, maxLength);
  var lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLength * 0.6)) {
    trimmed = trimmed.slice(0, lastSpace);
  }

  return trimmed.replace(/[.,;:!?-]+$/, "") + "…";
}

function firstMatch(source, pattern) {
  var match = source.match(pattern);
  return match ? match[1].trim() : "";
}

function tagContent(block, tagName) {
  var pattern = new RegExp(
    "<" + tagName + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tagName + ">",
    "i"
  );
  return decodeXmlEntities(firstMatch(block, pattern));
}

function tagAttribute(block, tagName, attributeName) {
  var pattern = new RegExp(
    "<" + tagName + "\\b[^>]*\\b" + attributeName + "\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>",
    "i"
  );
  return decodeXmlEntities(firstMatch(block, pattern));
}

function channelBlock(xml) {
  var channel = firstMatch(xml, /<channel\b[^>]*>([\s\S]*?)<item\b/i);
  if (channel) {
    return channel;
  }
  return firstMatch(xml, /<channel\b[^>]*>([\s\S]*?)<\/channel>/i);
}

function collectItems(xml) {
  return xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
}

function formatDate(value) {
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { iso: "", label: "" };
  }

  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}

function parseEpisode(itemXml, fallbackArtwork, maxLength) {
  var title = stripHtml(tagContent(itemXml, "title")) || "Untitled episode";
  var rawDescription =
    tagContent(itemXml, "description") ||
    tagContent(itemXml, "itunes:summary") ||
    tagContent(itemXml, "content:encoded");
  var paragraphs = descriptionParagraphs(rawDescription);
  var fullDescription = paragraphs.join("\n\n");
  var bodyHtml = linkifyHtml(sanitizeDescriptionHtml(rawDescription));
  var date = formatDate(tagContent(itemXml, "pubDate") || tagContent(itemXml, "dc:date"));
  var url =
    tagContent(itemXml, "link") ||
    tagAttribute(itemXml, "enclosure", "url") ||
    tagContent(itemXml, "guid");
  var mediaContentType = tagAttribute(itemXml, "media:content", "type");
  var mediaContentUrl = tagAttribute(itemXml, "media:content", "url");
  var artwork =
    tagAttribute(itemXml, "itunes:image", "href") ||
    tagAttribute(itemXml, "media:thumbnail", "url") ||
    (mediaContentType.indexOf("image/") === 0 ? mediaContentUrl : "") ||
    fallbackArtwork;
  var episodeNumber = stripHtml(tagContent(itemXml, "itunes:episode"));

  return {
    title: title,
    episodeNumber: episodeNumber,
    pubDate: date.iso,
    pubDateLabel: date.label,
    description: truncate(fullDescription.replace(/\n+/g, " "), maxLength),
    fullDescription: fullDescription,
    paragraphs: paragraphs,
    bodyHtml: bodyHtml,
    url: isUsableUrl(url) ? url.trim() : "",
    artwork: isUsableUrl(artwork) ? artwork.trim() : "",
    links: {
      spotify: isUsableUrl(url) ? url.trim() : "",
      apple: "",
      amazon: isUsableUrl(config.amazonMusicUrl) ? config.amazonMusicUrl.trim() : "",
      youtube: "",
    },
  };
}

function parseFeed(xml) {
  var channel = channelBlock(xml);
  var fallbackArtwork =
    tagAttribute(channel, "itunes:image", "href") ||
    tagContent(channel, "url") ||
    tagAttribute(xml, "itunes:image", "href");

  var usedSlugs = {};
  var episodes = collectItems(xml)
    .map(function (itemXml) {
      return parseEpisode(itemXml, fallbackArtwork, config.descriptionMaxLength || 220);
    })
    .filter(function (episode) {
      return Boolean(episode.title);
    })
    .sort(function (a, b) {
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    })
    .slice(0, config.maxEpisodes || 100)
    .map(function (episode) {
      var base = slugify(episode.title);
      if (episode.episodeNumber) {
        base = episode.episodeNumber + "-" + base;
      }
      episode.slug = uniqueSlug(base, usedSlugs);
      return episode;
    });

  return {
    generatedAt: new Date().toISOString(),
    sourceFeed: config.rssFeedUrl,
    podcastTitle: stripHtml(tagContent(channel, "title")) || config.siteName,
    podcastArtwork: isUsableUrl(fallbackArtwork) ? fallbackArtwork.trim() : "",
    episodes: episodes,
  };
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titlesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }

  var shorter = left.length < right.length ? left : right;
  var longer = left.length < right.length ? right : left;
  if (shorter.length >= 24 && longer.indexOf(shorter) !== -1) {
    return true;
  }

  var leftLead = left.split(" ").slice(0, 7).join(" ");
  var rightLead = right.split(" ").slice(0, 7).join(" ");
  return leftLead.length >= 18 && leftLead === rightLead;
}

function appleCollectionId() {
  var match = String(config.applePodcastsUrl || "").match(/id(\d+)/);
  return match ? match[1] : "";
}

function youtubePlaylistId() {
  try {
    return new URL(config.youtubeUrl).searchParams.get("list") || "";
  } catch (error) {
    return "";
  }
}

async function fetchAppleEpisodeLinks() {
  var id = appleCollectionId();
  if (!id) {
    return [];
  }

  var response = await fetch(
    "https://itunes.apple.com/lookup?id=" + encodeURIComponent(id) + "&entity=podcastEpisode&limit=200",
    {
      headers: {
        "User-Agent": "TaylorMadeThoughts/1.0 (podcast site feed updater)",
        Accept: "application/json",
      },
    }
  );
  if (!response.ok) {
    throw new Error("Apple lookup failed with status " + response.status);
  }

  var data = await response.json();
  return (data.results || [])
    .filter(function (item) {
      return item.wrapperType === "podcastEpisode" || item.kind === "podcast-episode";
    })
    .map(function (item) {
      return {
        title: normalizeTitle(item.trackName),
        url: item.trackViewUrl || "",
      };
    });
}

async function fetchYouTubeEpisodeLinks() {
  var playlistId = youtubePlaylistId();
  if (!playlistId) {
    return [];
  }

  var response = await fetch(
    "https://www.youtube.com/feeds/videos.xml?playlist_id=" + encodeURIComponent(playlistId),
    {
      headers: {
        "User-Agent": "TaylorMadeThoughts/1.0 (podcast site feed updater)",
        Accept: "application/atom+xml, application/xml, text/xml, */*",
      },
    }
  );
  if (!response.ok) {
    throw new Error("YouTube playlist feed failed with status " + response.status);
  }

  var xml = await response.text();
  var entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return entries
    .map(function (entry) {
      return {
        title: normalizeTitle(tagContent(entry, "title")),
        url: tagContent(entry, "link") || tagAttribute(entry, "link", "href"),
      };
    })
    .filter(function (item) {
      return item.title && isUsableUrl(item.url);
    });
}

function findMatchingLink(title, catalog) {
  var normalized = normalizeTitle(title);
  var match = (catalog || []).find(function (item) {
    return titlesMatch(normalized, item.title);
  });
  return match && isUsableUrl(match.url) ? match.url.trim() : "";
}

async function attachPlatformLinks(episodes) {
  var appleLinks = [];
  var youtubeLinks = [];

  try {
    appleLinks = await fetchAppleEpisodeLinks();
    console.log("Matched Apple catalog: " + appleLinks.length + " episode(s)");
  } catch (error) {
    console.warn("Could not load Apple episode links:", error.message);
  }

  try {
    youtubeLinks = await fetchYouTubeEpisodeLinks();
    console.log("Matched YouTube catalog: " + youtubeLinks.length + " episode(s)");
  } catch (error) {
    console.warn("Could not load YouTube episode links:", error.message);
  }

  episodes.forEach(function (episode) {
    episode.links = {
      spotify: episode.url || "",
      apple: findMatchingLink(episode.title, appleLinks),
      amazon: isUsableUrl(config.amazonMusicUrl) ? config.amazonMusicUrl.trim() : "",
      youtube: findMatchingLink(episode.title, youtubeLinks),
    };
  });

  return episodes;
}

function writeSitemap(episodes) {
  var siteUrl = (config.siteUrl || "https://TaylorMadeThoughts.com").replace(/\/$/, "");
  var urls = [
    { loc: siteUrl + "/", changefreq: "daily", priority: "1.0" },
    { loc: siteUrl + "/episodes.html", changefreq: "daily", priority: "0.8" },
  ].concat(
    (episodes || []).map(function (episode) {
      return {
        loc: siteUrl + "/episodes/" + episode.slug + ".html",
        changefreq: "monthly",
        priority: "0.7",
      };
    })
  );

  var body = urls
    .map(function (entry) {
      return [
        "  <url>",
        "    <loc>" + escapeHtml(entry.loc) + "</loc>",
        "    <changefreq>" + entry.changefreq + "</changefreq>",
        "    <priority>" + entry.priority + "</priority>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  fs.writeFileSync(
    SITEMAP_PATH,
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      body +
      "\n</urlset>\n",
    "utf8"
  );
}

function episodePageHtml(episode, payload) {
  var siteUrl = (config.siteUrl || "https://TaylorMadeThoughts.com").replace(/\/$/, "");
  var pageUrl = siteUrl + "/episodes/" + episode.slug + ".html";
  var title = episode.title || "Untitled episode";
  var description = episode.description || config.tagline || "";
  var artwork = episode.artwork || payload.podcastArtwork || siteUrl + "/assets/podcast-artwork.jpg";
  var links = episode.links || {};
  var listenItems = [
    { label: "Spotify", href: links.spotify || episode.url, icon: "spotify" },
    { label: "Apple Podcasts", href: links.apple || config.applePodcastsUrl, icon: "apple" },
    { label: "Amazon Music", href: links.amazon || config.amazonMusicUrl, icon: "amazon" },
    { label: "YouTube", href: links.youtube || config.youtubeUrl, icon: "youtube" },
  ].filter(function (item) {
    return isUsableUrl(item.href);
  });

  var copyHtml = episode.bodyHtml
    ? episode.bodyHtml
    : (episode.paragraphs && episode.paragraphs.length
        ? episode.paragraphs
        : [episode.fullDescription || episode.description || ""]
      )
        .filter(Boolean)
        .map(function (paragraph) {
          return "<p>" + linkify(paragraph) + "</p>";
        })
        .join("\n");

  var listenHtml = listenItems.length
    ? [
        '          <p class="listen-label">Listen to this episode</p>',
        '          <ul>',
        listenItems
          .map(function (item) {
            return (
              "            <li><a href=\"" +
              escapeHtml(item.href) +
              '" rel="noopener noreferrer" target="_blank"><span class="platform-icon platform-icon-' +
              item.icon +
              '" aria-hidden="true"></span>' +
              escapeHtml(item.label) +
              "</a></li>"
            );
          })
          .join("\n"),
        "          </ul>",
      ].join("\n")
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — Taylor Made Thoughts</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Taylor Made Thoughts" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(artwork)}" />
    <meta property="og:locale" content="en_US" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(artwork)}" />

    <meta name="theme-color" content="#f4f0e8" />
    <link rel="icon" href="../assets/favicon.ico" sizes="any" />
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="../assets/favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="../assets/apple-touch-icon.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body class="page-inner">
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="site-header compact">
      <p class="eyebrow"><a href="../">Podcast</a></p>
      <p class="site-wordmark"><a href="../">Taylor Made Thoughts</a></p>
      <nav class="platform-nav" aria-label="Listen and follow">
        <ul id="platform-links">
          <li><span>Spotify</span></li>
          <li><span>Apple Podcasts</span></li>
          <li><span>Amazon Music</span></li>
          <li><span>YouTube</span></li>
          <li><span>RSS</span></li>
        </ul>
      </nav>
    </header>

    <main id="main">
      <article class="episode-page">
        <p class="eyebrow">Episode${episode.episodeNumber ? " " + escapeHtml(episode.episodeNumber) : ""}</p>
        <h1>${escapeHtml(title)}</h1>
        ${episode.pubDateLabel ? '<p class="episode-date">' + escapeHtml(episode.pubDateLabel) + "</p>" : ""}
        <div class="episode-hero-art">
          <img src="${escapeHtml(artwork)}" alt="" width="176" height="176" />
        </div>
        <div class="episode-copy">
${copyHtml}
        </div>
        <nav class="platform-nav episode-listen-nav" aria-label="Listen to this episode">
${listenHtml}
        </nav>
        <nav class="episode-nav" aria-label="Episode">
          <a href="../">Latest episodes</a>
          <span>·</span>
          <a href="../episodes.html">All episodes</a>
        </nav>
      </article>
    </main>

    <footer class="site-footer">
      <p>
        <span id="copyright">© 2026 Taylor Made Thoughts</span>
      </p>
      <nav aria-label="Footer">
        <ul id="footer-links">
          <li><span>Spotify</span></li>
          <li><span>Apple Podcasts</span></li>
          <li><span>Amazon Music</span></li>
          <li><span>YouTube</span></li>
          <li><span>RSS</span></li>
        </ul>
      </nav>
    </footer>

    <script src="../config.js"></script>
    <script src="../script.js"></script>
  </body>
</html>
`;
}

function generateEpisodePages(payload) {
  fs.mkdirSync(EPISODE_DIR, { recursive: true });

  fs.readdirSync(EPISODE_DIR)
    .filter(function (name) {
      return name.endsWith(".html");
    })
    .forEach(function (name) {
      fs.unlinkSync(path.join(EPISODE_DIR, name));
    });

  (payload.episodes || []).forEach(function (episode) {
    fs.writeFileSync(path.join(EPISODE_DIR, episode.slug + ".html"), episodePageHtml(episode, payload), "utf8");
  });
}

async function main() {
  var existing = readExistingEpisodes();

  if (!isUsableUrl(config.rssFeedUrl)) {
    console.log(
      "RSS feed URL is not configured yet. Paste it into config.js (rssFeedUrl) and run this script again."
    );
    if (!Array.isArray(existing.episodes)) {
      writeEpisodes({
        generatedAt: null,
        sourceFeed: null,
        podcastTitle: config.siteName,
        podcastArtwork: "",
        episodes: [],
      });
    }
    return;
  }

  var response;
  try {
    response = await fetch(config.rssFeedUrl.trim(), {
      headers: {
        "User-Agent": "TaylorMadeThoughts/1.0 (podcast site feed updater)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
  } catch (error) {
    console.error("Could not reach the RSS feed:", error.message);
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    console.error("RSS feed request failed with status", response.status);
    process.exitCode = 1;
    return;
  }

  var xml = await response.text();
  if (!/<rss\b|<item\b/i.test(xml)) {
    console.error("The response did not look like an RSS feed. Leaving episodes.json unchanged.");
    process.exitCode = 1;
    return;
  }

  var payload = parseFeed(xml);
  await attachPlatformLinks(payload.episodes);
  writeEpisodes(payload);
  generateEpisodePages(payload);
  writeSitemap(payload.episodes);
  console.log("Wrote " + payload.episodes.length + " episode(s) to episodes.json and episode pages");
}

if (require.main === module && /fetch-podcast\.js$/.test(process.argv[1] || "")) {
  main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseFeed,
  stripHtml,
  truncate,
  linkify,
  generateEpisodePages,
};
