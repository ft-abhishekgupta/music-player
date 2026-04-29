// ============================================================
// Music Player Configuration
// ============================================================
// 
// MODE 1 (No Auth Required): Use songs.json manifest
//   - Create a songs.json file with direct download URLs
//   - Run the included generate-manifest.ps1 script to build it
//   - No sign-in needed! Works purely as a static site.
//
// MODE 2 (Optional): Use Microsoft sign-in for dynamic file discovery
//   - Requires an Azure AD app registration (see README)
//   - Any Microsoft account can sign in
//   - Automatically discovers files from the shared OneDrive folder
// ============================================================

const APP_CONFIG = {
    // Set to "manifest" for no-auth mode, or "msal" for Microsoft sign-in mode
    mode: "msal",

    // Path to the songs manifest file (used in "manifest" mode)
    manifestUrl: "songs.json",

    // Supported audio file extensions
    supportedFormats: ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.opus'],
};

// MSAL Configuration (only needed if mode is "msal")
const MSAL_CONFIG = {
    auth: {
        clientId: "bbe586fe-ae92-40ed-83a9-18823eb71e9f",
        authority: "https://login.microsoftonline.com/common",
        redirectUri: "https://ft-abhishekgupta.github.io/music-player/",
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
};

// OneDrive shared folder URL (only needed if mode is "msal")
const ONEDRIVE_CONFIG = {
    sharedFolderUrl: "https://1drv.ms/f/c/968aae9395918ed8/IgB9mJz7oGujQKYYjJKUNLdrASqRthfOsVY09SCyolLABD8",
};

// Graph API scopes
const LOGIN_SCOPES = {
    scopes: ["Files.Read.All"],
};
