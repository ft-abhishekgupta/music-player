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

    // ==================== INITIALIZATION ====================

    function init() {
        audio.volume = 0.8;
        bindEvents();

        if (APP_CONFIG.mode === 'manifest') {
            loginBtn.classList.add('hidden');
            loadFromManifest();
        } else if (APP_CONFIG.mode === 'msal') {
            initMSAL();
        }
    }

    // ==================== MANIFEST MODE (No Auth) ====================

    async function loadFromManifest() {
        welcomeScreen.classList.add('hidden');
        loadingScreen.classList.remove('hidden');

        try {
            const response = await fetch(APP_CONFIG.manifestUrl);
            if (!response.ok) {
                throw new Error(`Failed to load ${APP_CONFIG.manifestUrl} (${response.status}). Run generate-manifest.ps1 to create it.`);
            }

            const data = await response.json();
            const songs = data.songs || data;

            playlist = songs.map(song => ({
                name: song.name || song.title || song.fileName.replace(/\.[^/.]+$/, ''),
                fullName: song.fileName || song.name,
                size: song.size || 0,
                downloadUrl: song.url || song.downloadUrl,
            }));

            playlist.sort((a, b) => a.name.localeCompare(b.name));

            loadingScreen.classList.add('hidden');

            if (playlist.length === 0) {
                showError('No songs found in songs.json');
                return;
            }

            renderPlaylist();
            playerContainer.classList.remove('hidden');
            trackCount.textContent = `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`;
        } catch (err) {
            loadingScreen.classList.add('hidden');
            welcomeScreen.classList.remove('hidden');
            document.querySelector('.welcome-screen p').textContent = err.message;
            showError(err.message);
        }
    }

    // ==================== MSAL MODE (Microsoft Sign-in) ====================

    function initMSAL() {
        try {
            msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
            msalInstance.handleRedirectPromise().then(handleResponse).catch(err => {
                console.error('Redirect error:', err);
            });
        } catch (err) {
            console.error('MSAL init error:', err);
            showError('Failed to initialize authentication. Check config.js.');
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

    async function signIn() {
        try {
            const response = await msalInstance.loginPopup(LOGIN_SCOPES);
            currentAccount = response.account;
            onSignedIn();
        } catch (err) {
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
        loadMusicFromOneDrive();
    }

    async function getAccessToken() {
        const request = { ...LOGIN_SCOPES, account: currentAccount };
        try {
            return (await msalInstance.acquireTokenSilent(request)).accessToken;
        } catch {
            return (await msalInstance.acquireTokenPopup(request)).accessToken;
        }
    }

    function encodeSharingUrl(url) {
        return 'u!' + btoa(url).replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/, '');
    }

    async function loadMusicFromOneDrive() {
        loadingScreen.classList.remove('hidden');
        try {
            const token = await getAccessToken();
            const shareToken = encodeSharingUrl(ONEDRIVE_CONFIG.sharedFolderUrl);
            const apiUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children?$select=name,size,file,@microsoft.graph.downloadUrl&$top=200`;

            const response = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'redeemSharingLink' }
            });

            if (!response.ok) {
                // Fallback: try with expand
                const altUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem?$expand=children($select=name,size,file)`;
                const altResp = await fetch(altUrl, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'redeemSharingLink' }
                });
                if (!altResp.ok) throw new Error(`API error: ${altResp.status}`);
                const altData = await altResp.json();
                processOneDriveFiles(altData.children || []);
                return;
            }

            const data = await response.json();
            processOneDriveFiles(data.value || []);
        } catch (err) {
            loadingScreen.classList.add('hidden');
            showError(`Failed to load music: ${err.message}`);
        }
    }

    function processOneDriveFiles(files) {
        playlist = [];
        for (const file of files) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (APP_CONFIG.supportedFormats.includes(ext)) {
                playlist.push({
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    fullName: file.name,
                    size: file.size || 0,
                    downloadUrl: file['@microsoft.graph.downloadUrl'] || file['@content.downloadUrl'] || null,
                });
            }
        }
        playlist.sort((a, b) => a.name.localeCompare(b.name));
        loadingScreen.classList.add('hidden');

        if (playlist.length === 0) {
            showError('No audio files found in the shared folder.');
            return;
        }

        renderPlaylist();
        playerContainer.classList.remove('hidden');
        trackCount.textContent = `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`;
    }

    // ==================== PLAYLIST & PLAYBACK ====================

    function renderPlaylist() {
        playlistEl.innerHTML = playlist.map((track, index) => `
            <div class="playlist-item ${index === currentTrackIndex ? 'active' : ''}" data-index="${index}">
                <span class="track-number">${index === currentTrackIndex && isPlaying ? '▶' : index + 1}</span>
                <span class="track-name" title="${escapeHtml(track.fullName)}">${escapeHtml(track.name)}</span>
                <span class="track-size">${formatSize(track.size)}</span>
            </div>
        `).join('');

        playlistEl.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
        });
    }

    function playTrack(index) {
        if (index < 0 || index >= playlist.length) return;

        currentTrackIndex = index;
        const track = playlist[index];

        trackTitle.textContent = track.name;
        trackArtist.textContent = track.fullName;

        if (!track.downloadUrl) {
            showError('No download URL for this track.');
            return;
        }

        audio.src = track.downloadUrl;
        audio.play();
        isPlaying = true;
        updatePlayButton();
        albumArt.classList.add('playing');
        renderPlaylist();

        // Update media session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.name,
                artist: 'OneDrive Music',
            });
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
        albumArt.classList.toggle('playing', isPlaying);
    }

    function playNext() {
        if (playlist.length === 0) return;
        let next = isShuffle
            ? Math.floor(Math.random() * playlist.length)
            : (currentTrackIndex + 1) % playlist.length;
        playTrack(next);
    }

    function playPrev() {
        if (playlist.length === 0) return;
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        let prev = isShuffle
            ? Math.floor(Math.random() * playlist.length)
            : (currentTrackIndex - 1 + playlist.length) % playlist.length;
        playTrack(prev);
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

    // ==================== AUDIO EVENTS ====================

    function onTimeUpdate() {
        if (audio.duration) {
            progressBar.value = (audio.currentTime / audio.duration) * 100;
            currentTimeEl.textContent = formatTime(audio.currentTime);
            durationEl.textContent = formatTime(audio.duration);
        }
    }

    function onTrackEnd() {
        if (repeatMode === 2) {
            audio.currentTime = 0;
            audio.play();
        } else if (repeatMode === 1 || currentTrackIndex < playlist.length - 1) {
            playNext();
        } else {
            isPlaying = false;
            updatePlayButton();
            albumArt.classList.remove('playing');
        }
    }

    // ==================== UTILITIES ====================

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function formatSize(bytes) {
        if (!bytes) return '';
        const mb = bytes / (1024 * 1024);
        return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function showError(message) {
        const existing = document.querySelector('.error-message');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.className = 'error-message';
        el.style.cssText = 'background:#da3633;color:white;padding:1rem 1.5rem;border-radius:8px;margin:1rem auto;max-width:600px;text-align:center;';
        el.textContent = message;
        document.querySelector('.main-content').prepend(el);
        setTimeout(() => el.remove(), 10000);
    }

    // ==================== EVENT BINDINGS ====================

    function bindEvents() {
        loginBtn.addEventListener('click', signIn);
        logoutBtn.addEventListener('click', signOut);
        playBtn.addEventListener('click', togglePlay);
        nextBtn.addEventListener('click', playNext);
        prevBtn.addEventListener('click', playPrev);
        shuffleBtn.addEventListener('click', toggleShuffle);
        repeatBtn.addEventListener('click', toggleRepeat);
        progressBar.addEventListener('input', e => { if (audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration; });
        volumeBar.addEventListener('input', e => { audio.volume = e.target.value / 100; });
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onTrackEnd);

        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.code) {
                case 'Space': e.preventDefault(); togglePlay(); break;
                case 'ArrowRight': e.ctrlKey ? playNext() : (audio.duration && (audio.currentTime = Math.min(audio.currentTime + 10, audio.duration))); break;
                case 'ArrowLeft': e.ctrlKey ? playPrev() : (audio.currentTime = Math.max(audio.currentTime - 10, 0)); break;
                case 'ArrowUp': e.preventDefault(); audio.volume = Math.min(audio.volume + 0.1, 1); volumeBar.value = audio.volume * 100; break;
                case 'ArrowDown': e.preventDefault(); audio.volume = Math.max(audio.volume - 0.1, 0); volumeBar.value = audio.volume * 100; break;
            }
        });

        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        }
    }

    init();
})();
