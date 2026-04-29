// Music Player Application
(function () {
    'use strict';

    // State
    let msalInstance = null;
    let currentAccount = null;
    let playlist = [];
    let currentTrackIndex = -1;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 0; // 0: off, 1: all, 2: one

    // DOM Elements
    const audio = document.getElementById('audio-player');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const welcomeScreen = document.getElementById('welcome');
    const loadingScreen = document.getElementById('loading');
    const playerContainer = document.getElementById('player-container');
    const playlistEl = document.getElementById('playlist');
    const trackTitle = document.getElementById('track-title');
    const trackArtist = document.getElementById('track-artist');
    const trackCount = document.getElementById('track-count');
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const progressBar = document.getElementById('progress-bar');
    const volumeBar = document.getElementById('volume-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const albumArt = document.querySelector('.album-art');

    // Initialize MSAL
    function initMSAL() {
        try {
            msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
            // Handle redirect response
            msalInstance.handleRedirectPromise().then(handleResponse).catch(err => {
                console.error('Redirect error:', err);
            });
        } catch (err) {
            console.error('MSAL init error:', err);
            showError('Failed to initialize authentication. Please check your config.js settings.');
        }
    }

    function handleResponse(response) {
        if (response) {
            currentAccount = response.account;
            onSignedIn();
        } else {
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                currentAccount = accounts[0];
                onSignedIn();
            }
        }
    }

    // Auth functions
    async function signIn() {
        try {
            const response = await msalInstance.loginPopup(LOGIN_SCOPES);
            currentAccount = response.account;
            onSignedIn();
        } catch (err) {
            console.error('Login error:', err);
            if (err.errorCode === 'user_cancelled') return;
            showError('Sign in failed. Please try again.');
        }
    }

    function signOut() {
        msalInstance.logoutPopup({ account: currentAccount });
        currentAccount = null;
        audio.pause();
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        playerContainer.classList.add('hidden');
        welcomeScreen.classList.remove('hidden');
    }

    function onSignedIn() {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userName.textContent = currentAccount.name || currentAccount.username;
        welcomeScreen.classList.add('hidden');
        loadMusic();
    }

    async function getAccessToken() {
        const request = { ...LOGIN_SCOPES, account: currentAccount };
        try {
            const response = await msalInstance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (err) {
            // Fallback to popup if silent fails
            const response = await msalInstance.acquireTokenPopup(request);
            return response.accessToken;
        }
    }

    // OneDrive API functions
    function encodeSharingUrl(url) {
        const base64 = btoa(url)
            .replace(/\//g, '_')
            .replace(/\+/g, '-')
            .replace(/=+$/, '');
        return 'u!' + base64;
    }

    async function loadMusic() {
        loadingScreen.classList.remove('hidden');
        try {
            const token = await getAccessToken();
            const shareToken = encodeSharingUrl(ONEDRIVE_CONFIG.sharedFolderUrl);
            const apiUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children?$select=name,size,file,@microsoft.graph.downloadUrl&$top=200`;

            const response = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                // Try alternative: access shared item directly
                const altUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem?$expand=children($select=name,size,file)`;
                const altResponse = await fetch(altUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!altResponse.ok) {
                    throw new Error(`API error: ${altResponse.status} ${altResponse.statusText}`);
                }

                const altData = await altResponse.json();
                if (altData.children) {
                    processFiles(altData.children, token, shareToken);
                } else {
                    throw new Error('No files found in the shared folder.');
                }
                return;
            }

            const data = await response.json();
            processFiles(data.value, token, shareToken);

        } catch (err) {
            console.error('Load music error:', err);
            loadingScreen.classList.add('hidden');
            showError(`Failed to load music: ${err.message}`);
        }
    }

    async function processFiles(files, token, shareToken) {
        playlist = [];

        for (const file of files) {
            const ext = getFileExtension(file.name);
            if (ONEDRIVE_CONFIG.supportedFormats.includes(ext)) {
                playlist.push({
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    fullName: file.name,
                    size: file.size,
                    downloadUrl: file['@microsoft.graph.downloadUrl'] || null,
                    id: file.id || null,
                });
            }
        }

        // Sort playlist alphabetically
        playlist.sort((a, b) => a.name.localeCompare(b.name));

        // If download URLs are missing, fetch them individually
        if (playlist.length > 0 && !playlist[0].downloadUrl) {
            await fetchDownloadUrls(token, shareToken);
        }

        loadingScreen.classList.add('hidden');

        if (playlist.length === 0) {
            showError('No audio files found in the shared folder.');
            return;
        }

        renderPlaylist();
        playerContainer.classList.remove('hidden');
        trackCount.textContent = `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`;
    }

    async function fetchDownloadUrls(token, shareToken) {
        // Fetch each file's download URL
        for (let i = 0; i < playlist.length; i++) {
            try {
                const url = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children/${encodeURIComponent(playlist[i].fullName)}`;
                const resp = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    playlist[i].downloadUrl = data['@microsoft.graph.downloadUrl'];
                }
            } catch (e) {
                console.warn(`Failed to get URL for: ${playlist[i].fullName}`);
            }
        }
    }

    function getFileExtension(filename) {
        return '.' + filename.split('.').pop().toLowerCase();
    }

    // Playlist rendering
    function renderPlaylist() {
        playlistEl.innerHTML = playlist.map((track, index) => `
            <div class="playlist-item ${index === currentTrackIndex ? 'active' : ''}" data-index="${index}">
                <span class="track-number">${index === currentTrackIndex && isPlaying ? '▶' : index + 1}</span>
                <span class="track-name" title="${escapeHtml(track.fullName)}">${escapeHtml(track.name)}</span>
                <span class="track-size">${formatSize(track.size)}</span>
            </div>
        `).join('');

        // Add click handlers
        playlistEl.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                playTrack(index);
            });
        });
    }

    // Playback functions
    async function playTrack(index) {
        if (index < 0 || index >= playlist.length) return;

        currentTrackIndex = index;
        const track = playlist[index];

        trackTitle.textContent = track.name;
        trackArtist.textContent = track.fullName;

        if (!track.downloadUrl) {
            // Try to get a fresh download URL
            try {
                const token = await getAccessToken();
                const shareToken = encodeSharingUrl(ONEDRIVE_CONFIG.sharedFolderUrl);
                const searchUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children?$filter=name eq '${encodeURIComponent(track.fullName)}'&$select=name,@microsoft.graph.downloadUrl`;
                const resp = await fetch(searchUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.value && data.value.length > 0) {
                        track.downloadUrl = data.value[0]['@microsoft.graph.downloadUrl'];
                    }
                }
            } catch (e) {
                console.error('Failed to get download URL:', e);
            }
        }

        if (track.downloadUrl) {
            audio.src = track.downloadUrl;
            audio.play();
            isPlaying = true;
            updatePlayButton();
            albumArt.classList.add('playing');
            renderPlaylist();
        } else {
            showError('Unable to play this track. Download URL not available.');
        }
    }

    function togglePlay() {
        if (currentTrackIndex === -1 && playlist.length > 0) {
            playTrack(0);
            return;
        }

        if (isPlaying) {
            audio.pause();
        } else {
            audio.play();
        }
        isPlaying = !isPlaying;
        updatePlayButton();
        if (isPlaying) {
            albumArt.classList.add('playing');
        } else {
            albumArt.classList.remove('playing');
        }
    }

    function playNext() {
        if (playlist.length === 0) return;

        let nextIndex;
        if (isShuffle) {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } else {
            nextIndex = (currentTrackIndex + 1) % playlist.length;
        }
        playTrack(nextIndex);
    }

    function playPrev() {
        if (playlist.length === 0) return;

        // If more than 3 seconds in, restart current track
        if (audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }

        let prevIndex;
        if (isShuffle) {
            prevIndex = Math.floor(Math.random() * playlist.length);
        } else {
            prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        }
        playTrack(prevIndex);
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        shuffleBtn.classList.toggle('active', isShuffle);
    }

    function toggleRepeat() {
        repeatMode = (repeatMode + 1) % 3;
        repeatBtn.classList.toggle('active', repeatMode > 0);
        repeatBtn.textContent = repeatMode === 2 ? '🔂' : '🔁';
    }

    function updatePlayButton() {
        playBtn.textContent = isPlaying ? '⏸️' : '▶️';
    }

    // Audio event handlers
    function onTimeUpdate() {
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.value = progress;
            currentTimeEl.textContent = formatTime(audio.currentTime);
            durationEl.textContent = formatTime(audio.duration);
        }
    }

    function onTrackEnd() {
        if (repeatMode === 2) {
            // Repeat one
            audio.currentTime = 0;
            audio.play();
        } else if (repeatMode === 1 || currentTrackIndex < playlist.length - 1) {
            // Repeat all or not at end
            playNext();
        } else {
            // End of playlist, no repeat
            isPlaying = false;
            updatePlayButton();
            albumArt.classList.remove('playing');
        }
    }

    function onSeek(e) {
        if (audio.duration) {
            audio.currentTime = (e.target.value / 100) * audio.duration;
        }
    }

    function onVolumeChange(e) {
        audio.volume = e.target.value / 100;
    }

    // Utility functions
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showError(message) {
        // Show error in the welcome area or as alert
        const existing = document.querySelector('.error-message');
        if (existing) existing.remove();

        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.style.cssText = 'background: #da3633; color: white; padding: 1rem 1.5rem; border-radius: 8px; margin: 1rem auto; max-width: 500px; text-align: center;';
        errorEl.textContent = message;
        document.querySelector('.main-content').prepend(errorEl);

        setTimeout(() => errorEl.remove(), 8000);
    }

    // Keyboard shortcuts
    function handleKeyboard(e) {
        if (e.target.tagName === 'INPUT') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowRight':
                if (e.ctrlKey) playNext();
                else if (audio.duration) audio.currentTime = Math.min(audio.currentTime + 10, audio.duration);
                break;
            case 'ArrowLeft':
                if (e.ctrlKey) playPrev();
                else audio.currentTime = Math.max(audio.currentTime - 10, 0);
                break;
            case 'ArrowUp':
                e.preventDefault();
                audio.volume = Math.min(audio.volume + 0.1, 1);
                volumeBar.value = audio.volume * 100;
                break;
            case 'ArrowDown':
                e.preventDefault();
                audio.volume = Math.max(audio.volume - 0.1, 0);
                volumeBar.value = audio.volume * 100;
                break;
        }
    }

    // Event listeners
    function bindEvents() {
        loginBtn.addEventListener('click', signIn);
        logoutBtn.addEventListener('click', signOut);
        playBtn.addEventListener('click', togglePlay);
        nextBtn.addEventListener('click', playNext);
        prevBtn.addEventListener('click', playPrev);
        shuffleBtn.addEventListener('click', toggleShuffle);
        repeatBtn.addEventListener('click', toggleRepeat);
        progressBar.addEventListener('input', onSeek);
        volumeBar.addEventListener('input', onVolumeChange);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onTrackEnd);
        document.addEventListener('keydown', handleKeyboard);

        // Media session API for OS-level media controls
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        }
    }

    // Initialize
    function init() {
        audio.volume = 0.8;
        bindEvents();
        initMSAL();
    }

    init();
})();
