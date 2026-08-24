# Taylor Made Thoughts

A lightweight homepage for the [Taylor Made Thoughts](https://TaylorMadeThoughts.com) podcast.

The site is static HTML, CSS, and vanilla JavaScript. It is designed to host for free on GitHub Pages at **https://TaylorMadeThoughts.com**.

Latest episodes are not fetched in the browser. A GitHub Action reads the podcast RSS feed, writes `episodes.json`, and commits that file. The homepage then renders from the JSON file, which avoids RSS CORS issues on GitHub Pages.

## Quick start

1. Paste your podcast URLs into `config.js`.
2. Replace the placeholder artwork if you want.
3. Push the repository to GitHub.
4. Turn on GitHub Pages.
5. Point TaylorMadeThoughts.com at GitHub Pages.
6. Enable HTTPS.

## What you need to replace before deploying

Already filled in:

| Field | Value |
| --- | --- |
| `rssFeedUrl` | `https://anchor.fm/s/112faa100/podcast/rss` |
| `spotifyUrl` | `https://open.spotify.com/show/033mDoNOh60l2wnQjd0O3w` |
| `applePodcastsUrl` | `https://podcasts.apple.com/us/podcast/taylor-made-thoughts/id1896855385` |
| `amazonMusicUrl` | `https://music.amazon.com/podcasts/d62afe46-805b-41b3-bdb9-56caa3b68896/taylor-made-thoughts` |
| `youtubeUrl` | `https://www.youtube.com/playlist?list=PLJkOuZmOTnCnYR5jdiWPiS0tI2nrX4y4J` |
| `about` | Your current Spotify show description |

Optional to change later:

| Field | What to paste |
| --- | --- |
| `tagline` | The line under the site title |

Then replace these assets if you have final artwork:

| File | Purpose |
| --- | --- |
| `assets/podcast-artwork.jpg` | Fallback episode artwork |
| `assets/og-image.jpg` | Social sharing image |
| `assets/favicon.svg` | Browser tab icon |
| `assets/favicon-32.png` | Fallback favicon |
| `assets/apple-touch-icon.png` | iOS home-screen icon |

Until the RSS URL is set, the homepage shows an empty-state message instead of episodes. Platform names appear, but they do not become clickable until the corresponding URL is a real `https://` link.

## 1. Paste in the Spotify podcast RSS feed URL

Open `config.js` and replace:

```js
rssFeedUrl: "https://anchor.fm/s/112faa100/podcast/rss",
```

This is already set. If the feed URL ever changes, replace it here.

Spotify-hosted shows usually use an Anchor RSS URL that looks like:

```text
https://anchor.fm/s/xxxxxxxx/podcast/rss
```

You can find this in Spotify for Creators / Anchor under the podcast’s RSS settings.

This one value is used by:

- the GitHub Action that builds `episodes.json`
- the **RSS** link in the header and footer

## 2. Add the Spotify URL

In `config.js`:

```js
spotifyUrl: "https://open.spotify.com/show/033mDoNOh60l2wnQjd0O3w",
```

This is already set to the clean show URL (the `?si=` share parameter is not needed).

## 3. Add the Apple Podcasts URL

```js
applePodcastsUrl: "https://podcasts.apple.com/us/podcast/taylor-made-thoughts/id1896855385",
```

This is already set. Use the public `podcasts.apple.com` URL, not the Podcasts Connect admin page.

## 4. Add the Amazon Music and YouTube URLs

```js
amazonMusicUrl: "https://music.amazon.com/podcasts/d62afe46-805b-41b3-bdb9-56caa3b68896/taylor-made-thoughts",
youtubeUrl: "https://www.youtube.com/playlist?list=PLJkOuZmOTnCnYR5jdiWPiS0tI2nrX4y4J",
```

These are already set. The YouTube link points at the show playlist.

## 5. Change the podcast description

The About section is controlled by `about` in `config.js`.

The homepage subtitle is controlled by `tagline` in the same file.

The browser title and social-preview description live in `index.html` if you also want those updated.

## 6. Add or change the podcast artwork

Replace:

```text
assets/podcast-artwork.jpg
```

Use a square image. 1400×1400 or larger is a good target. Keep the same filename, or update `fallbackArtwork` in `config.js` and the Open Graph image path in `index.html`.

Episode-specific artwork from the RSS feed is used when available. This file is the fallback.

## 7. Change the favicon

Replace any of these:

```text
assets/favicon.svg
assets/favicon-32.png
assets/apple-touch-icon.png
```

Keep the filenames unless you also update the `<link>` tags in `index.html`.

## 8. Test the site locally

From the project root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Do not open `index.html` directly as a `file://` page. The browser will block `episodes.json`.

To generate episodes on your machine after adding the RSS URL, install [Babashka](https://babashka.org) and run the importer:

```bash
brew install borkdude/brew/babashka
bb scripts/fetch-podcast.bb
```

Then refresh the local site. You should see up to 15 recent episodes, newest first.

## 9. Create the GitHub repository

1. Go to [https://github.com/new](https://github.com/new).
2. Create a **public** repository. A name like `taylor-made-thoughts` is fine.
3. Do not add a README, `.gitignore`, or license on GitHub if this folder already has them.
4. Public repositories can use GitHub Pages for free.

## 10. Push the project to GitHub

If this folder is already a git repository:

```bash
git add .
git commit -m "Add Taylor Made Thoughts podcast site"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

If Git already has a `master` branch, you can keep that name and publish from `master` instead.

Replace `YOUR-GITHUB-USERNAME` and `YOUR-REPO-NAME` with your values.

## 11. Turn on GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set the branch to `main` (or `master`) and the folder to `/ (root)`.
5. Click **Save**.
6. Under **Custom domain**, enter `TaylorMadeThoughts.com` and save.

The repository already includes a `CNAME` file with `TaylorMadeThoughts.com`, so GitHub should keep that domain after the first Pages build.

Wait for the first Pages build to finish. The site may first appear at:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO-NAME/
```

That temporary URL is expected. The custom domain is the production URL.

## 12. Confirm the GitHub Action can update `episodes.json`

The workflow is `.github/workflows/update-podcast.yml`.

It runs:

- automatically every 4 hours
- whenever you click **Run workflow**

GitHub needs permission to commit the generated `episodes.json` file.

1. Go to **Settings → Actions → General**.
2. Scroll to **Workflow permissions**.
3. Select **Read and write permissions**.
4. Save.
5. Confirm the workflow file includes:

   ```yaml
   permissions:
     contents: write
   ```

   That line is already in the file.

Then run it once:

1. Open **Actions**.
2. Select **Update podcast episodes**.
3. Click **Run workflow**.
4. After it finishes, confirm `episodes.json` was updated if your RSS URL is already in `config.js`.

If the RSS URL is still a placeholder, the workflow succeeds and leaves the empty episode list in place. That is expected.

## Connecting TaylorMadeThoughts.com to GitHub Pages

Use GitHub’s current recommended setup: serve the **apex** domain `TaylorMadeThoughts.com`, and point `www` at your GitHub Pages site so GitHub can redirect it.

### 13. Connect the domain in GitHub

1. In the repository, go to **Settings → Pages**.
2. Under **Custom domain**, enter:

   ```text
   TaylorMadeThoughts.com
   ```

3. Click **Save**.
4. Leave **Enforce HTTPS** unchecked until DNS has finished propagating and GitHub has issued a certificate.

The `CNAME` file in this repository already contains:

```text
TaylorMadeThoughts.com
```

Do not put `www.TaylorMadeThoughts.com` in that file. The apex domain is the canonical site. If both DNS records below are set, GitHub Pages will redirect `www` to `https://TaylorMadeThoughts.com`.

Optional but recommended: verify the domain at the GitHub account or organization level under **Settings → Pages → Verified domains**. That helps prevent domain-takeover issues.

### 14. Configure the required DNS records

At your domain registrar (or wherever the domain’s DNS is hosted), add the records below. Remove any old A, AAAA, ALIAS, or CNAME records for `@` and `www` that point somewhere else.

#### Root / apex domain: `TaylorMadeThoughts.com`

Add these **A** records:

| Type | Name / Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Also add these **AAAA** records for IPv6. GitHub recommends them in addition to the A records:

| Type | Name / Host | Value |
| --- | --- | --- |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

If your registrar uses a blank host instead of `@`, that is the apex domain.

Some registrars support `ALIAS` or `ANAME` instead of A/AAAA records. If you prefer that, point `@` to:

```text
YOUR-GITHUB-USERNAME.github.io
```

Do not include the repository name in that value.

#### `www.TaylorMadeThoughts.com`

Add this **CNAME** record:

| Type | Name / Host | Value |
| --- | --- | --- |
| CNAME | `www` | `YOUR-GITHUB-USERNAME.github.io` |

Point `www` at `YOUR-GITHUB-USERNAME.github.io` only. Do **not** append the repository name. Do **not** CNAME `www` to `TaylorMadeThoughts.com`. GitHub’s docs warn that pointing the www subdomain at the apex can break HTTPS.

Replace `YOUR-GITHUB-USERNAME` with your GitHub username, or the organization name if the repository belongs to an organization.

#### Check DNS

Propagation can take from a few minutes up to 24 hours.

```bash
dig TaylorMadeThoughts.com +noall +answer -t A
dig TaylorMadeThoughts.com +noall +answer -t AAAA
dig www.TaylorMadeThoughts.com +nostats +nocomments +nocmd
```

The apex A records should match GitHub’s four IPv4 addresses. The `www` lookup should show a CNAME to `YOUR-GITHUB-USERNAME.github.io`.

### 15. Enable HTTPS in GitHub Pages

1. Wait until **Settings → Pages** shows the custom domain as ready, with no DNS error.
2. Check **Enforce HTTPS**.
3. If the checkbox is disabled, wait for the certificate to finish issuing and try again. This can take up to 24 hours after DNS is correct.

GitHub issues the certificate automatically. You do not need to upload one.

### 16. Verify both hostnames

When everything is ready:

- `https://TaylorMadeThoughts.com` should load the site
- `https://www.TaylorMadeThoughts.com` should load the site or redirect to the apex
- the browser should show a valid certificate
- header links should go to Spotify, Apple Podcasts, Amazon Music, and the RSS feed
- **Latest Episodes** should list recent episodes after the GitHub Action has run

If the custom domain check fails, confirm:

- the `CNAME` file contains only `TaylorMadeThoughts.com`
- GitHub Pages is publishing from the branch that contains that file
- the A/AAAA and www CNAME records match the tables above
- there is no conflicting ALIAS, forwarding, or parking record

## How episode updates work

```text
Spotify RSS feed
        ↓
GitHub Action (every 4 hours, or manual)
        ↓
episodes.json and episode pages committed to the repo
        ↓
GitHub Pages rebuilds the site
        ↓
The homepage shows the latest 5 episodes
```

The importer lives at `scripts/fetch-podcast.bb` and is written in [Babashka](https://babashka.org) (a small Clojure scripting runtime). Install it with `brew install borkdude/brew/babashka`, then run `bb scripts/fetch-podcast.bb`.

It:

- reads `rssFeedUrl` from `config.js`
- keeps the existing `episodes.json` if the feed cannot be reached
- strips HTML from descriptions
- sorts newest first
- writes a unique page for each episode in `episodes/`
- updates `sitemap.xml`
- uses episode artwork when present, otherwise the podcast artwork

The homepage lists the latest 5 episodes and links to `episodes.html` for the full archive. Episode titles open that episode’s own page.

If the feed is empty or not configured yet, the homepage shows a short empty state instead of a broken list.

## Local project structure

```text
/
  index.html
  episodes.html
  styles.css
  script.js
  config.js
  episodes.json
  episodes/
    11-geometry-for-staying-cool.html
  CNAME
  robots.txt
  sitemap.xml
  404.html
  assets/
    podcast-artwork.jpg
    og-image.jpg
    favicon.svg
    favicon-32.png
    apple-touch-icon.png
  scripts/
    fetch-podcast.bb
  .github/
    workflows/
      update-podcast.yml
```

## Notes

- There is no newsletter signup, CMS, database, authentication, or analytics.
- All internal asset paths are relative, so the site works locally and on the custom domain root.
- The canonical production URL is `https://TaylorMadeThoughts.com`.
