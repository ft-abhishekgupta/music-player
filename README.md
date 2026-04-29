# 🎵 Cloud Music Player

A sleek, browser-based music player that streams audio files from a OneDrive shared folder. Designed for deployment on GitHub Pages.

## Features

- 🔐 Microsoft account authentication (MSAL.js)
- 📂 Automatic file listing from OneDrive shared folder
- 🎵 Supports MP3, M4A, FLAC, WAV, OGG, AAC, WMA, OPUS
- ▶️ Full playback controls (play/pause, next/prev, shuffle, repeat)
- 📊 Progress bar with seek
- 🔊 Volume control
- ⌨️ Keyboard shortcuts (Space, arrows, Ctrl+arrows)
- 📱 Responsive design (mobile-friendly)
- 🌙 Dark theme

## Setup Instructions

### 1. Register an Azure AD Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Fill in:
   - **Name**: `Music Player` (or any name)
   - **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*
   - **Redirect URI**: Select **Single-page application (SPA)** and enter:
     ```
     https://<your-username>.github.io/music-player/
     ```
4. Click **Register**
5. Copy the **Application (client) ID**

### 2. Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add: `Files.Read.All`
4. Click **Add permissions**

*(No admin consent is needed for personal Microsoft accounts)*

### 3. Update Configuration

Edit `config.js` and replace `YOUR_CLIENT_ID_HERE` with your Application (client) ID:

```javascript
clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
```

### 4. Deploy to GitHub Pages

```bash
# Initialize and push to GitHub
git init
git add .
git commit -m "Initial commit - Cloud Music Player"
git remote add origin https://github.com/<your-username>/music-player.git
git branch -M main
git push -u origin main
```

Then in your GitHub repository:
1. Go to **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select **main** branch and **/ (root)** folder
4. Click **Save**

Your site will be live at: `https://<your-username>.github.io/music-player/`

### 5. Update Redirect URI

Make sure the redirect URI in your Azure AD app matches your GitHub Pages URL exactly (including trailing slash).

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

Simply open `index.html` in a browser, or use a local server:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .
```

For local development, add `http://localhost:8000/` as an additional redirect URI in your Azure AD app.

## License

MIT
