# 🎵 Cloud Music Player

A sleek, browser-based music player that streams audio files from a OneDrive shared folder. Deployed on GitHub Pages.

## Features

- 🎵 Streams music directly from OneDrive (no local storage needed)
- ▶️ Full playback controls (play/pause, next/prev, shuffle, repeat)
- 📊 Progress bar with seek & volume control
- ⌨️ Keyboard shortcuts (Space, arrows, Ctrl+arrows)
- 📱 Responsive dark theme UI
- 🔊 OS-level media controls integration

## Why is Microsoft Sign-in Required?

Your OneDrive folder **is** publicly shared — the web page loads fine in a browser. However, Microsoft's Graph API **requires an OAuth token for ALL programmatic access**, even to public content. This is a Microsoft platform limitation, not a permissions issue.

The sign-in is:
- ✅ One-click (if already logged into Microsoft)
- ✅ Works with ANY Microsoft account (personal or work)
- ✅ Only requests read-only file access
- ✅ No admin consent needed

## Setup (One-time, ~2 minutes)

### Step 1: Register an Azure AD App

1. Go to [Azure App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Fill in:
   - **Name**: `Music Player`
   - **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*
   - **Redirect URI**: Select **Single-page application (SPA)** → enter your GitHub Pages URL:
     ```
     https://<your-username>.github.io/music-player/
     ```
4. Click **Register**
5. Copy the **Application (client) ID** from the overview page

### Step 2: Add API Permission

1. In your app, go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Search and add: `Files.Read.All`
4. Click **Add permissions** (no admin consent needed)

### Step 3: Configure & Deploy

1. Edit `config.js` — set `mode: "msal"` and paste your Client ID:
   ```javascript
   mode: "msal",
   ...
   clientId: "your-client-id-here",
   ```

2. Push to GitHub:
   ```bash
   git add . && git commit -m "Configure music player"
   git remote add origin https://github.com/<you>/music-player.git
   git push -u origin main
   ```

3. Enable GitHub Pages: **Settings** → **Pages** → **Source: main branch**

Your player will be live at `https://<your-username>.github.io/music-player/`

## Alternative: Static Manifest Mode (No Sign-in)

If you prefer no authentication, you can create a `songs.json` with direct download URLs for each file:

1. In OneDrive, share each music file individually ("Anyone with the link")
2. Convert each share link to an embed URL (see `generate-manifest.ps1`)
3. Set `mode: "manifest"` in `config.js`

**Note**: This requires generating individual share links per file and URLs may expire.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| → | Forward 10s |
| ← | Rewind 10s |
| Ctrl + → | Next track |
| Ctrl + ← | Previous track |
| ↑ | Volume up |
| ↓ | Volume down |

## Local Development

```bash
npx serve .
# Then add http://localhost:3000/ as a redirect URI in your Azure app
```

## License

MIT
