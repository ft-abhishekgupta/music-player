// Microsoft Authentication Configuration
// To set up your own Azure AD app:
// 1. Go to https://portal.azure.com → Azure Active Directory → App registrations → New registration
// 2. Name: "Music Player" (or any name you prefer)
// 3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
// 4. Redirect URI: Select "Single-page application (SPA)" and enter your GitHub Pages URL
//    e.g., https://<your-username>.github.io/music-player/
// 5. After registration, copy the "Application (client) ID" and paste it below
// 6. Under API permissions, add: Microsoft Graph → Delegated → Files.Read.All
//    (No admin consent needed for personal accounts)

const MSAL_CONFIG = {
    auth: {
        // Replace with your Azure AD Application (client) ID
        clientId: "YOUR_CLIENT_ID_HERE",
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + window.location.pathname,
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
};

// OneDrive shared folder configuration
const ONEDRIVE_CONFIG = {
    // The shared folder URL (used to generate the sharing token)
    sharedFolderUrl: "https://1drv.ms/f/c/968aae9395918ed8/IgB9mJz7oGujQKYYjJKUNLdrASqRthfOsVY09SCyolLABD8",
    // Supported audio file extensions
    supportedFormats: ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.opus'],
};

// Graph API scopes needed
const LOGIN_SCOPES = {
    scopes: ["Files.Read.All", "Files.Read"],
};
