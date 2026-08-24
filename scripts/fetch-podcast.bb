#!/usr/bin/env bb
;; Fetch the podcast RSS feed and write episodes.json plus episode pages.
;;
;; Reads URLs and copy from ../config.js
;;
;;   bb scripts/fetch-podcast.bb

(require '[babashka.fs :as fs]
         '[babashka.http-client :as http]
         '[cheshire.core :as json]
         '[clojure.string :as str])

(def root (-> *file* fs/parent fs/parent str))
(def config-path (str root "/config.js"))
(def output-path (str root "/episodes.json"))
(def episode-dir (str root "/episodes"))
(def sitemap-path (str root "/sitemap.xml"))
(def user-agent "TaylorMadeThoughts/1.0 (podcast site feed updater)")

(defn config-string [src key]
  (some-> (re-find (re-pattern (str key ":\\s*\"([^\"]*)\"")) src)
          second))

(defn config-int [src key default]
  (if-let [m (re-find (re-pattern (str key ":\\s*(\\d+)")) src)]
    (parse-long (second m))
    default))

(def config
  (let [src (slurp config-path)]
    {:site-name (config-string src "siteName")
     :site-url (config-string src "siteUrl")
     :tagline (config-string src "tagline")
     :rss-feed-url (config-string src "rssFeedUrl")
     :spotify-url (config-string src "spotifyUrl")
     :apple-url (config-string src "applePodcastsUrl")
     :amazon-url (config-string src "amazonMusicUrl")
     :youtube-url (config-string src "youtubeUrl")
     :fallback-artwork (config-string src "fallbackArtwork")
     :max-episodes (config-int src "maxEpisodes" 100)
     :description-max-length (config-int src "descriptionMaxLength" 220)}))

(defn usable-url? [url]
  (boolean
   (and (string? url)
        (re-find #"^https?://" (str/trim url))
        (not (re-find #"(?i)PASTE_YOUR" url)))))

(defn decode-xml-entities [value]
  (if (str/blank? value)
    ""
    (-> value
        (str/replace #"(?i)<!\[CDATA\[([\s\S]*?)\]\]>" "$1")
        (str/replace #"(?i)&nbsp;" " ")
        (str/replace #"&amp;" "&")
        (str/replace #"&quot;" "\"")
        (str/replace #"&#39;|&apos;" "'")
        (str/replace #"&lt;" "<")
        (str/replace #"&gt;" ">")
        (str/replace #"&#(\d+);" #(str (char (parse-long (second %)))))
        (str/replace #"(?i)&#x([0-9a-f]+);"
                     #(str (char (Integer/parseInt (second %) 16)))))))

(defn first-match [source pattern]
  (some-> (re-find pattern source) second str/trim))

(defn tag-content [block tag-name]
  (decode-xml-entities
   (first-match block (re-pattern (str "(?is)<" tag-name "(?:\\s[^>]*)?>([\\s\\S]*?)</" tag-name ">")))))

(defn tag-attr [block tag-name attr-name]
  (decode-xml-entities
   (first-match block (re-pattern (str "(?i)<" tag-name "\\b[^>]*\\b" attr-name "\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>")))))

(defn strip-html [value]
  (-> (decode-xml-entities value)
      (str/replace #"(?i)</?(em|i|strong|b|span|a)(?:\s[^>]*)?>" "")
      (str/replace #"(?i)<br\s*/?>" " ")
      (str/replace #"(?i)</p>" " ")
      (str/replace #"<[^>]+>" " ")
      (str/replace #"\s+" " ")
      str/trim))

(defn description-paragraphs [value]
  (->> (-> (decode-xml-entities (or value ""))
           (str/replace #"(?i)</p>" "\n\n")
           (str/replace #"(?i)<br\s*/?>" "\n")
           (str/replace #"(?i)<li[^>]*>" "\n")
           (str/replace #"(?i)</?(em|i|strong|b|span|a)(?:\s[^>]*)?>" "")
           (str/replace #"<[^>]+>" " ")
           (str/split #"\n+"))
       (map #(str/trim (str/replace % #"\s+" " ")))
       (remove str/blank?)))

(defn escape-html [value]
  (-> (str (or value ""))
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")
      (str/replace "\"" "&quot;")))

(defn sanitize-description-html [value]
  (let [allowed #{"p" "br" "ol" "ul" "li" "strong" "b" "em" "i" "a"}
        html (-> (decode-xml-entities (or value ""))
                 (str/replace #"(?is)<script[\s\S]*?</script>" "")
                 (str/replace #"(?is)<style[\s\S]*?</style>" ""))]
    (-> html
        (str/replace #"</?([a-zA-Z0-9]+)(\s[^>]*)?>"
                     (fn [[full tag attrs]]
                       (let [name (str/lower-case tag)]
                         (cond
                           (not (allowed name)) " "
                           (= name "br") "<br>"
                           (str/starts-with? full "</") (str "</" name ">")
                           (= name "a")
                           (let [href (first-match (or attrs "") #"(?i)href\s*=\s*[\"']([^\"']+)[\"']")]
                             (if (usable-url? href)
                               (str "<a href=\"" (escape-html (str/trim href)) "\" rel=\"noopener noreferrer\" target=\"_blank\">")
                               ""))
                           :else (str "<" name ">")))))
        (str/replace #"\s+\n" "\n")
        str/trim)))

(defn linkify [value]
  (let [source (str (or value ""))
        matcher (re-matcher #"https?://[^\s<>\"']+" source)]
    (loop [html "" last-idx 0]
      (if (.find matcher)
        (let [start (.start matcher)
              raw (.group matcher)
              trimmed (str/replace raw #"[),.;:!?]+$" "")
              trailing (subs raw (count trimmed))]
          (recur (str html
                      (escape-html (subs source last-idx start))
                      (if (re-find #"^https?://" trimmed)
                        (str "<a href=\"" (escape-html trimmed)
                             "\" rel=\"noopener noreferrer\" target=\"_blank\">"
                             (escape-html trimmed) "</a>")
                        (escape-html trimmed))
                      (escape-html trailing))
                 (.end matcher)))
        (str html (escape-html (subs source last-idx)))))))

(defn linkify-html [html]
  (->> (str/split (str (or html "")) #"(<[^>]+>)")
       (map (fn [part]
              (if (str/starts-with? (or part "") "<")
                part
                (linkify part))))
       (apply str)))

(defn fold-key [value]
  ;; Babashka does not ship java.text.Normalizer; ASCII folding is enough here.
  (-> (str (or value ""))
      str/lower-case
      (str/replace #"[àáâãäåāăą]" "a")
      (str/replace #"[èéêëēĕėęě]" "e")
      (str/replace #"[ìíîïĩīĭįı]" "i")
      (str/replace #"[òóôõöōŏő]" "o")
      (str/replace #"[ùúûüũūŭůűų]" "u")
      (str/replace #"[ýÿŷ]" "y")
      (str/replace #"[çćĉċč]" "c")
      (str/replace #"[ñńņň]" "n")
      (str/replace #"[ß]" "ss")
      (str/replace #"[æ]" "ae")
      (str/replace #"[œ]" "oe")))

(defn slugify [value]
  (or (not-empty
       (-> (fold-key value)
           (str/replace #"[\"'“”‘’]" "")
           (str/replace #"[^a-z0-9]+" "-")
           (str/replace #"^-+|-+$" "")
           (as-> s (subs s 0 (min 72 (count s))))))
      "episode"))

(defn unique-slug [base used]
  (loop [slug base n 2]
    (if (@used slug)
      (recur (str (subs base 0 (min 68 (count base))) "-" n) (inc n))
      (do (swap! used conj slug) slug))))

(defn truncate [text max-length]
  (let [text (or text "")]
    (if (<= (count text) max-length)
      text
      (let [trimmed (subs text 0 max-length)
            last-space (str/last-index-of trimmed " ")
            cut (if (and last-space (> last-space (Math/floor (* max-length 0.6))))
                  (subs trimmed 0 last-space)
                  trimmed)]
        (str (str/replace cut #"[.,;:!?-]+$" "") "…")))))

(defn channel-block [xml]
  (or (first-match xml #"(?is)<channel\b[^>]*>([\s\S]*?)<item\b")
      (first-match xml #"(?is)<channel\b[^>]*>([\s\S]*?)</channel>")))

(defn collect-items [xml]
  (re-seq #"(?is)<item\b[\s\S]*?</item>" xml))

(defn parse-pubdate [value]
  (when (not-empty value)
    (try
      (.toInstant (java.time.ZonedDateTime/parse
                   value
                   java.time.format.DateTimeFormatter/RFC_1123_DATE_TIME))
      (catch Exception _
        (try
          (java.time.Instant/parse value)
          (catch Exception _ nil))))))

(def date-label-fmt
  (-> (java.time.format.DateTimeFormatter/ofPattern "MMMM d, yyyy")
      (.withLocale java.util.Locale/US)))

(defn format-date [value]
  (if-let [inst (parse-pubdate value)]
    {:iso (str inst)
     :label (.format date-label-fmt (.atZone inst java.time.ZoneOffset/UTC))}
    {:iso "" :label ""}))

(defn normalize-title [value]
  (-> (fold-key value)
      (str/replace #"&" " and ")
      (str/replace #"[^a-z0-9]+" " ")
      str/trim))

(defn titles-match? [left right]
  (cond
    (or (str/blank? left) (str/blank? right)) false
    (= left right) true
    (let [shorter (if (< (count left) (count right)) left right)
          longer (if (< (count left) (count right)) right left)]
      (and (>= (count shorter) 24) (str/includes? longer shorter))) true
    :else
    (let [lead #(str/join " " (take 7 (str/split % #" ")))
          a (lead left)
          b (lead right)]
      (and (>= (count a) 18) (= a b)))))

(defn parse-episode [item-xml fallback-artwork]
  (let [title (or (not-empty (strip-html (tag-content item-xml "title"))) "Untitled episode")
        raw (or (not-empty (tag-content item-xml "description"))
                (not-empty (tag-content item-xml "itunes:summary"))
                (tag-content item-xml "content:encoded"))
        paragraphs (description-paragraphs raw)
        full (str/join "\n\n" paragraphs)
        date (format-date (or (not-empty (tag-content item-xml "pubDate"))
                              (tag-content item-xml "dc:date")))
        url (or (not-empty (tag-content item-xml "link"))
                (not-empty (tag-attr item-xml "enclosure" "url"))
                (tag-content item-xml "guid"))
        media-type (tag-attr item-xml "media:content" "type")
        artwork (or (not-empty (tag-attr item-xml "itunes:image" "href"))
                    (not-empty (tag-attr item-xml "media:thumbnail" "url"))
                    (when (str/starts-with? (or media-type "") "image/")
                      (tag-attr item-xml "media:content" "url"))
                    fallback-artwork)
        episode-number (strip-html (tag-content item-xml "itunes:episode"))]
    {"title" title
     "episodeNumber" episode-number
     "pubDate" (:iso date)
     "pubDateLabel" (:label date)
     "description" (truncate (str/replace full #"\n+" " ") (:description-max-length config))
     "fullDescription" full
     "paragraphs" (vec paragraphs)
     "bodyHtml" (linkify-html (sanitize-description-html raw))
     "url" (if (usable-url? url) (str/trim url) "")
     "artwork" (if (usable-url? artwork) (str/trim artwork) "")
     "links" {"spotify" (if (usable-url? url) (str/trim url) "")
              "apple" ""
              "amazon" (if (usable-url? (:amazon-url config)) (str/trim (:amazon-url config)) "")
              "youtube" ""}}))

(defn parse-feed [xml]
  (let [channel (channel-block xml)
        fallback (or (not-empty (tag-attr channel "itunes:image" "href"))
                     (not-empty (tag-content channel "url"))
                     (tag-attr xml "itunes:image" "href"))
        used (atom #{})
        episodes (->> (collect-items xml)
                      (map #(parse-episode % fallback))
                      (filter #(not-empty (get % "title")))
                      (sort-by #(or (get % "pubDate") "") #(compare %2 %1))
                      (take (:max-episodes config))
                      (mapv (fn [episode]
                              (let [base (cond-> (slugify (get episode "title"))
                                           (not-empty (get episode "episodeNumber"))
                                           (->> (str (get episode "episodeNumber") "-")))]
                                (assoc episode "slug" (unique-slug base used))))))]
    {"generatedAt" (str (java.time.Instant/now))
     "sourceFeed" (:rss-feed-url config)
     "podcastTitle" (or (not-empty (strip-html (tag-content channel "title")))
                        (:site-name config))
     "podcastArtwork" (if (usable-url? fallback) (str/trim fallback) "")
     "episodes" episodes}))

(defn http-get [url accept]
  (http/get url {:headers {"User-Agent" user-agent
                           "Accept" accept}
                 :throw false}))

(defn apple-collection-id []
  (second (re-find #"id(\d+)" (str (:apple-url config)))))

(defn youtube-playlist-id []
  (try
    (some-> (.getQuery (java.net.URI. (:youtube-url config)))
            (->> (re-find #"list=([^&]+)"))
            second)
    (catch Exception _ nil)))

(defn fetch-apple-links []
  (if-let [id (apple-collection-id)]
    (let [res (http-get (str "https://itunes.apple.com/lookup?id=" id "&entity=podcastEpisode&limit=200")
                        "application/json")]
      (when-not (<= 200 (:status res) 299)
        (throw (ex-info (str "Apple lookup failed with status " (:status res)) {})))
      (->> (get (json/parse-string (:body res) true) :results)
           (filter #(or (= (:wrapperType %) "podcastEpisode")
                        (= (:kind %) "podcast-episode")))
           (map (fn [item]
                  {:title (normalize-title (:trackName item))
                   :url (or (:trackViewUrl item) "")}))))
    []))

(defn fetch-youtube-links []
  (if-let [playlist-id (not-empty (youtube-playlist-id))]
    (let [res (http-get (str "https://www.youtube.com/feeds/videos.xml?playlist_id=" playlist-id)
                        "application/atom+xml, application/xml, text/xml, */*")]
      (when-not (<= 200 (:status res) 299)
        (throw (ex-info (str "YouTube playlist feed failed with status " (:status res)) {})))
      (->> (re-seq #"(?is)<entry\b[\s\S]*?</entry>" (:body res))
           (map (fn [entry]
                  {:title (normalize-title (tag-content entry "title"))
                   :url (or (not-empty (tag-content entry "link"))
                            (tag-attr entry "link" "href"))}))
           (filter #(and (not-empty (:title %)) (usable-url? (:url %))))))
    []))

(defn matching-link [title catalog]
  (let [normalized (normalize-title title)
        match (some #(when (titles-match? normalized (:title %)) %) catalog)]
    (if (usable-url? (:url match))
      (str/trim (:url match))
      "")))

(defn attach-platform-links [episodes]
  (let [apple (try
                (let [links (vec (fetch-apple-links))]
                  (println (str "Matched Apple catalog: " (count links) " episode(s)"))
                  links)
                (catch Exception e
                  (println (str "Could not load Apple episode links: " (ex-message e)))
                  []))
        youtube (try
                  (let [links (vec (fetch-youtube-links))]
                    (println (str "Matched YouTube catalog: " (count links) " episode(s)"))
                    links)
                  (catch Exception e
                    (println (str "Could not load YouTube episode links: " (ex-message e)))
                    []))]
    (mapv (fn [episode]
            (assoc episode "links"
                   {"spotify" (or (get episode "url") "")
                    "apple" (matching-link (get episode "title") apple)
                    "amazon" (if (usable-url? (:amazon-url config)) (str/trim (:amazon-url config)) "")
                    "youtube" (matching-link (get episode "title") youtube)}))
          episodes)))

(defn write-episodes [payload]
  (spit output-path (str (json/generate-string payload {:pretty true}) "\n")))

(defn write-sitemap [episodes]
  (let [site-url (str/replace (or (:site-url config) "https://TaylorMadeThoughts.com") #"/$" "")
        urls (concat [{:loc (str site-url "/") :changefreq "daily" :priority "1.0"}
                      {:loc (str site-url "/episodes.html") :changefreq "daily" :priority "0.8"}]
                     (map (fn [episode]
                            {:loc (str site-url "/episodes/" (get episode "slug") ".html")
                             :changefreq "monthly"
                             :priority "0.7"})
                          episodes))
        body (->> urls
                  (map (fn [{:keys [loc changefreq priority]}]
                         (str "  <url>\n    <loc>" (escape-html loc) "</loc>\n"
                              "    <changefreq>" changefreq "</changefreq>\n"
                              "    <priority>" priority "</priority>\n  </url>")))
                  (str/join "\n"))]
    (spit sitemap-path
          (str "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
               "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
               body
               "\n</urlset>\n"))))

(defn listen-items [episode]
  (let [links (get episode "links" {})]
    (filter #(usable-url? (:href %))
            [{:label "Spotify" :href (or (get links "spotify") (get episode "url")) :icon "spotify"}
             {:label "Apple Podcasts" :href (or (get links "apple") (:apple-url config)) :icon "apple"}
             {:label "Amazon Music" :href (or (get links "amazon") (:amazon-url config)) :icon "amazon"}
             {:label "YouTube" :href (or (get links "youtube") (:youtube-url config)) :icon "youtube"}])))

(defn episode-page-html [episode payload]
  (let [site-url (str/replace (or (:site-url config) "https://TaylorMadeThoughts.com") #"/$" "")
        page-url (str site-url "/episodes/" (get episode "slug") ".html")
        title (or (get episode "title") "Untitled episode")
        description (or (get episode "description") (:tagline config) "")
        artwork (or (get episode "artwork")
                    (get payload "podcastArtwork")
                    (str site-url "/assets/podcast-artwork.jpg"))
        copy-html (or (not-empty (get episode "bodyHtml"))
                      (->> (or (seq (get episode "paragraphs"))
                               [(or (get episode "fullDescription") (get episode "description") "")])
                           (remove str/blank?)
                           (map #(str "<p>" (linkify %) "</p>"))
                           (str/join "\n")))
        items (listen-items episode)
        listen-html (when (seq items)
                      (str "          <p class=\"listen-label\">Listen to this episode</p>\n          <ul>\n"
                           (->> items
                                (map (fn [{:keys [href label icon]}]
                                       (str "            <li><a href=\"" (escape-html href)
                                            "\" rel=\"noopener noreferrer\" target=\"_blank\"><span class=\"platform-icon platform-icon-"
                                            icon "\" aria-hidden=\"true\"></span>"
                                            (escape-html label) "</a></li>")))
                                (str/join "\n"))
                           "\n          </ul>"))]
    (str "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n"
         "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n"
         "    <title>" (escape-html title) " — Taylor Made Thoughts</title>\n"
         "    <meta name=\"description\" content=\"" (escape-html description) "\" />\n"
         "    <link rel=\"canonical\" href=\"" (escape-html page-url) "\" />\n\n"
         "    <meta property=\"og:type\" content=\"article\" />\n"
         "    <meta property=\"og:site_name\" content=\"Taylor Made Thoughts\" />\n"
         "    <meta property=\"og:title\" content=\"" (escape-html title) "\" />\n"
         "    <meta property=\"og:description\" content=\"" (escape-html description) "\" />\n"
         "    <meta property=\"og:url\" content=\"" (escape-html page-url) "\" />\n"
         "    <meta property=\"og:image\" content=\"" (escape-html artwork) "\" />\n"
         "    <meta property=\"og:locale\" content=\"en_US\" />\n\n"
         "    <meta name=\"twitter:card\" content=\"summary_large_image\" />\n"
         "    <meta name=\"twitter:title\" content=\"" (escape-html title) "\" />\n"
         "    <meta name=\"twitter:description\" content=\"" (escape-html description) "\" />\n"
         "    <meta name=\"twitter:image\" content=\"" (escape-html artwork) "\" />\n\n"
         "    <meta name=\"theme-color\" content=\"#f4f0e8\" />\n"
         "    <link rel=\"icon\" href=\"../assets/favicon.ico\" sizes=\"any\" />\n"
         "    <link rel=\"icon\" href=\"../assets/favicon.svg\" type=\"image/svg+xml\" />\n"
         "    <link rel=\"icon\" href=\"../assets/favicon-32.png\" type=\"image/png\" sizes=\"32x32\" />\n"
         "    <link rel=\"apple-touch-icon\" href=\"../assets/apple-touch-icon.png\" />\n\n"
         "    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />\n"
         "    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />\n"
         "    <link href=\"https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap\" rel=\"stylesheet\" />\n"
         "    <link rel=\"stylesheet\" href=\"../styles.css\" />\n  </head>\n"
         "  <body class=\"page-inner\">\n    <a class=\"skip-link\" href=\"#main\">Skip to content</a>\n\n"
         "    <header class=\"site-header compact\">\n      <p class=\"eyebrow\"><a href=\"../\">Podcast</a></p>\n"
         "      <p class=\"site-wordmark\"><a href=\"../\">Taylor Made Thoughts</a></p>\n"
         "      <nav class=\"platform-nav\" aria-label=\"Listen and follow\">\n        <ul id=\"platform-links\">\n"
         "          <li><span>Spotify</span></li>\n          <li><span>Apple Podcasts</span></li>\n"
         "          <li><span>Amazon Music</span></li>\n          <li><span>YouTube</span></li>\n"
         "          <li><span>RSS</span></li>\n        </ul>\n      </nav>\n    </header>\n\n"
         "    <main id=\"main\">\n      <article class=\"episode-page\">\n"
         "        <p class=\"eyebrow\">Episode"
         (when (not-empty (get episode "episodeNumber"))
           (str " " (escape-html (get episode "episodeNumber"))))
         "</p>\n        <h1>" (escape-html title) "</h1>\n"
         (when (not-empty (get episode "pubDateLabel"))
           (str "        <p class=\"episode-date\">" (escape-html (get episode "pubDateLabel")) "</p>\n"))
         "        <div class=\"episode-hero-art\">\n          <img src=\"" (escape-html artwork)
         "\" alt=\"\" width=\"176\" height=\"176\" />\n        </div>\n        <div class=\"episode-copy\">\n"
         copy-html "\n        </div>\n"
         "        <nav class=\"platform-nav episode-listen-nav\" aria-label=\"Listen to this episode\">\n"
         listen-html "\n        </nav>\n"
         "        <nav class=\"episode-nav\" aria-label=\"Episode\">\n          <a href=\"../\">Latest episodes</a>\n"
         "          <span>·</span>\n          <a href=\"../episodes.html\">All episodes</a>\n        </nav>\n"
         "      </article>\n    </main>\n\n    <footer class=\"site-footer\">\n      <p>\n"
         "        <span id=\"copyright\">© 2026 Taylor Made Thoughts</span>\n      </p>\n"
         "      <nav aria-label=\"Footer\">\n        <ul id=\"footer-links\">\n"
         "          <li><span>Spotify</span></li>\n          <li><span>Apple Podcasts</span></li>\n"
         "          <li><span>Amazon Music</span></li>\n          <li><span>YouTube</span></li>\n"
         "          <li><span>RSS</span></li>\n        </ul>\n      </nav>\n    </footer>\n\n"
         "    <script src=\"../config.js\"></script>\n    <script src=\"../script.js\"></script>\n"
         "  </body>\n</html>\n")))

(defn generate-episode-pages [payload]
  (fs/create-dirs episode-dir)
  (doseq [file (fs/glob episode-dir "*.html")]
    (fs/delete file))
  (doseq [episode (get payload "episodes")]
    (spit (str episode-dir "/" (get episode "slug") ".html")
          (episode-page-html episode payload))))

(defn existing-episodes []
  (try
    (json/parse-string (slurp output-path))
    (catch Exception _
      {"generatedAt" nil "sourceFeed" nil "episodes" []})))

(defn -main []
  (let [existing (existing-episodes)]
    (if-not (usable-url? (:rss-feed-url config))
      (do
        (println "RSS feed URL is not configured yet. Paste it into config.js (rssFeedUrl) and run this script again.")
        (when-not (vector? (get existing "episodes"))
          (write-episodes {"generatedAt" nil
                           "sourceFeed" nil
                           "podcastTitle" (:site-name config)
                           "podcastArtwork" ""
                           "episodes" []})))
      (let [res (try
                  (http-get (:rss-feed-url config) "application/rss+xml, application/xml, text/xml, */*")
                  (catch Exception e
                    (println (str "Could not reach the RSS feed: " (ex-message e)))
                    (System/exit 1)))]
        (when-not (<= 200 (:status res) 299)
          (println (str "RSS feed request failed with status " (:status res)))
          (System/exit 1))
        (when-not (re-find #"(?i)<rss\b|<item\b" (:body res))
          (println "The response did not look like an RSS feed. Leaving episodes.json unchanged.")
          (System/exit 1))
        (let [payload (update (parse-feed (:body res)) "episodes" attach-platform-links)]
          (write-episodes payload)
          (generate-episode-pages payload)
          (write-sitemap (get payload "episodes"))
          (println (str "Wrote " (count (get payload "episodes"))
                        " episode(s) to episodes.json and episode pages")))))))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
