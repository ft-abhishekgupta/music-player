# generate-manifest.ps1
# Generates songs.json from your OneDrive shared folder
# 
# HOW TO USE:
# 1. Open the OneDrive shared folder in your browser
# 2. For each music file, right-click → "Embed" or get the direct download link
#    OR use this script with your OneDrive credentials to auto-generate
#
# OPTION A: Manual (simplest, no auth needed)
# - Open https://1drv.ms/f/c/968aae9395918ed8/IgB9mJz7oGujQKYYjJKUNLdrASqRthfOsVY09SCyolLABD8?e=aTeLFI
# - For each file: right-click → Share → Copy link → select "Anyone with the link"
# - Each file's share link can be converted to a direct download link (see below)
#
# OPTION B: Using OneDrive desktop sync (easiest for many files)
# - Sync the shared folder to your PC via OneDrive app
# - Run this script pointing to the local synced folder
# - It generates embed URLs from the local file paths

param(
    [string]$LocalMusicFolder = "",
    [string]$OutputFile = "songs.json"
)

function Convert-ShareLinkToEmbed {
    param([string]$ShareUrl)
    # Convert a OneDrive share link to an embed/download URL
    $base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ShareUrl))
    $encoded = $base64.TrimEnd('=').Replace('/', '_').Replace('+', '-')
    return "https://api.onedrive.com/v1.0/shares/u!$encoded/root/content"
}

$supportedFormats = @('.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma', '.opus')

if ($LocalMusicFolder -and (Test-Path $LocalMusicFolder)) {
    Write-Host "Scanning local folder: $LocalMusicFolder" -ForegroundColor Cyan
    
    $files = Get-ChildItem -Path $LocalMusicFolder -File | Where-Object {
        $supportedFormats -contains $_.Extension.ToLower()
    }

    if ($files.Count -eq 0) {
        Write-Host "No audio files found!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Found $($files.Count) audio files" -ForegroundColor Green
    Write-Host ""
    Write-Host "NOTE: For local files, you need to provide share links." -ForegroundColor Yellow
    Write-Host "Please create individual share links for each file in OneDrive." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Creating template songs.json with file names (you'll need to add URLs)..." -ForegroundColor Yellow

    $songs = @()
    foreach ($file in $files) {
        $songs += @{
            fileName = $file.Name
            name = $file.BaseName
            size = $file.Length
            url = "PASTE_SHARE_LINK_HERE_FOR_$($file.BaseName)"
        }
    }

    $output = @{ songs = $songs } | ConvertTo-Json -Depth 3
    $output | Out-File -FilePath $OutputFile -Encoding UTF8
    Write-Host "`nTemplate saved to $OutputFile" -ForegroundColor Green
    Write-Host "Edit the file and replace each URL with the direct download link." -ForegroundColor Yellow
} else {
    Write-Host "=== OneDrive Music Manifest Generator ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To generate songs.json, choose one of these methods:" -ForegroundColor White
    Write-Host ""
    Write-Host "METHOD 1: From share links (per file)" -ForegroundColor Yellow
    Write-Host "  1. Open your OneDrive folder in browser"
    Write-Host "  2. For each music file, click '...' > Share > Copy link"
    Write-Host "  3. Make sure sharing is set to 'Anyone with the link can view'"
    Write-Host "  4. Create songs.json manually (see songs.example.json)"
    Write-Host ""
    Write-Host "METHOD 2: From local synced folder" -ForegroundColor Yellow
    Write-Host "  .\generate-manifest.ps1 -LocalMusicFolder 'C:\Users\you\OneDrive\Music'"
    Write-Host ""
    Write-Host "METHOD 3: Direct download URLs" -ForegroundColor Yellow  
    Write-Host "  If you have individual file share links like:"
    Write-Host "    https://1drv.ms/u/c/xxxx/yyyy"
    Write-Host "  Convert them with this pattern:"
    Write-Host "    Base64 encode the URL, replace /=_+-=, prepend u!"
    Write-Host "    Use: https://api.onedrive.com/v1.0/shares/{token}/root/content"
    Write-Host ""
    
    # Generate example file
    $example = @{
        songs = @(
            @{
                fileName = "Song Name.mp3"
                name = "Song Name"
                size = 5242880
                url = "https://api.onedrive.com/v1.0/shares/u!YOUR_ENCODED_SHARE_LINK/root/content"
            }
        )
    } | ConvertTo-Json -Depth 3
    
    $example | Out-File -FilePath "songs.example.json" -Encoding UTF8
    Write-Host "Created songs.example.json as a template." -ForegroundColor Green
}
