(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var episodeList = document.getElementById("episode-list");
  var statusEl = document.getElementById("episodes-status");
  var archiveLink = document.getElementById("archive-link");

  function isConfiguredUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url.trim());
  }

  function safeHttpUrl(url) {
    if (typeof url !== "string" || !url.trim()) {
      return "";
    }

    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (error) {
      return "";
    }

    return "";
  }

  function platformItems() {
    return [
      { label: "Spotify", href: config.spotifyUrl, icon: "spotify" },
      { label: "Apple Podcasts", href: config.applePodcastsUrl, icon: "apple" },
      { label: "Amazon Music", href: config.amazonMusicUrl, icon: "amazon" },
      { label: "YouTube", href: config.youtubeUrl, icon: "youtube" },
      { label: "RSS", href: config.rssFeedUrl, icon: "rss" },
    ];
  }

  function platformIcon(name) {
    var icon = document.createElement("span");
    icon.className = "platform-icon platform-icon-" + name;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function labeledNode(tagName, item) {
    var node = document.createElement(tagName);
    if (item.icon) {
      node.appendChild(platformIcon(item.icon));
    }
    node.appendChild(document.createTextNode(item.label));
    return node;
  }

  function renderLinks(listId) {
    var list = document.getElementById(listId);
    if (!list) {
      return;
    }

    list.replaceChildren();

    platformItems().forEach(function (item) {
      var li = document.createElement("li");

      if (isConfiguredUrl(item.href)) {
        var link = labeledNode("a", item);
        link.href = item.href.trim();
        link.rel = "noopener noreferrer";
        if (!/rss/i.test(item.label)) {
          link.target = "_blank";
        }
        li.appendChild(link);
      } else {
        var pending = labeledNode("span", item);
        pending.title = "Add this URL in config.js";
        li.appendChild(pending);
      }

      list.appendChild(li);
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el && value) {
      el.textContent = value;
    }
  }

  function setStatus(message) {
    if (!statusEl) {
      return;
    }

    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }

    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function episodePageUrl(episode) {
    if (!episode || !episode.slug) {
      return "";
    }
    return "episodes/" + encodeURIComponent(episode.slug) + ".html";
  }

  function createEpisode(episode, fallbackArtwork) {
    var pageUrl = episodePageUrl(episode);
    var listenUrl = safeHttpUrl(episode.url);
    var titleUrl = pageUrl || listenUrl;
    var artworkUrl = safeHttpUrl(episode.artwork) || fallbackArtwork;

    var item = document.createElement("li");
    item.className = "episode";

    var figure = document.createElement("div");
    figure.className = "episode-art";

    var img = document.createElement("img");
    img.src = artworkUrl;
    img.alt = "";
    img.loading = "lazy";
    img.width = 88;
    img.height = 88;
    img.addEventListener("error", function () {
      if (img.src !== new URL(fallbackArtwork, window.location.href).href) {
        img.src = fallbackArtwork;
      }
    });
    figure.appendChild(img);

    var body = document.createElement("div");
    body.className = "episode-body";

    var title = document.createElement("h3");
    title.className = "episode-title";

    if (titleUrl) {
      var titleLink = document.createElement("a");
      titleLink.href = titleUrl;
      titleLink.textContent = episode.title || "Untitled episode";
      title.appendChild(titleLink);
    } else {
      title.textContent = episode.title || "Untitled episode";
    }

    var date = document.createElement("p");
    date.className = "episode-date";
    date.textContent = episode.pubDateLabel || "";

    var description = document.createElement("p");
    description.className = "episode-description";
    description.textContent = episode.description || "";

    body.appendChild(title);
    if (episode.pubDateLabel) {
      body.appendChild(date);
    }
    if (episode.description) {
      body.appendChild(description);
    }

    if (pageUrl) {
      var read = document.createElement("a");
      read.className = "episode-listen";
      read.href = pageUrl;
      read.textContent = "Read episode →";
      body.appendChild(read);
    } else if (listenUrl) {
      var listen = document.createElement("a");
      listen.className = "episode-listen";
      listen.href = listenUrl;
      listen.textContent = "Listen to Episode →";
      listen.rel = "noopener noreferrer";
      listen.target = "_blank";
      body.appendChild(listen);
    }

    item.appendChild(figure);
    item.appendChild(body);
    return item;
  }

  function visibleEpisodes(episodes) {
    var mode = episodeList && episodeList.getAttribute("data-limit");
    if (mode === "all") {
      return episodes;
    }
    return episodes.slice(0, config.homepageEpisodeCount || 5);
  }

  function renderEpisodes(data) {
    var fallbackArtwork = config.fallbackArtwork || "assets/podcast-artwork.jpg";
    var episodes = Array.isArray(data && data.episodes) ? data.episodes : [];
    var shown = visibleEpisodes(episodes);

    episodeList.replaceChildren();

    if (!episodes.length) {
      setStatus(
        "Episodes will appear here once the podcast RSS feed is connected. Add your feed URL in config.js and run the update workflow."
      );
      if (archiveLink) {
        archiveLink.hidden = true;
      }
      return;
    }

    setStatus("");
    shown.forEach(function (episode) {
      episodeList.appendChild(createEpisode(episode, fallbackArtwork));
    });

    if (archiveLink) {
      archiveLink.hidden = false;
    }
  }

  function loadEpisodes() {
    if (!episodeList) {
      return;
    }

    return fetch("episodes.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Could not load episodes.json");
        }
        return response.json();
      })
      .then(renderEpisodes)
      .catch(function () {
        episodeList.replaceChildren();
        setStatus(
          "Episodes are unavailable right now. Please refresh the page, or check back after the feed updates."
        );
        if (archiveLink) {
          archiveLink.hidden = true;
        }
      });
  }

  setText("site-tagline", config.tagline);
  setText("about-copy", config.about);
  setText(
    "copyright",
    "© " + new Date().getFullYear() + " " + (config.siteName || "Taylor Made Thoughts")
  );

  renderLinks("platform-links");
  renderLinks("footer-links");
  loadEpisodes();
})();
