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
    const searchInput = document.getElementById('search-input');

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

    let msalReady = false;

    async function initMSAL() {
        try {
            msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);
            // MUST await handleRedirectPromise before any other MSAL calls
            const response = await msalInstance.handleRedirectPromise();
            msalReady = true;
            handleResponse(response);
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
        if (!msalReady) {
            showError('Still initializing, please try again...');
            return;
        }
        await msalInstance.loginRedirect(LOGIN_SCOPES);
    }

    function signOut() {
        msalInstance.logoutRedirect({ account: currentAccount });
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
            // Use redirect instead of popup for token refresh
            await msalInstance.acquireTokenRedirect(request);
            return null;
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

            // Fetch root children
            const rootItems = await fetchFolderChildren(shareToken, null, null, token);
            console.log('Root items:', rootItems.length);

            // Separate folders and files
            playlist = [];
            const folders = [];
            for (const item of rootItems) {
                if (item.folder) {
                    folders.push(item);
                } else {
                    addFileToPlaylist(item, null);
                }
            }

            // Recursively fetch files from subfolders
            for (const folder of folders) {
                const driveId = folder.parentReference?.driveId;
                const folderId = folder.id;
                const folderName = folder.name;
                console.log(`Scanning folder: ${folderName}`);
                await loadFolderRecursive(driveId, folderId, folderName, token, shareToken);
            }

            playlist.sort((a, b) => {
                // Sort by folder first, then by name
                if (a.folder && b.folder && a.folder !== b.folder) return a.folder.localeCompare(b.folder);
                return a.name.localeCompare(b.name);
            });

            // Store shareToken for later use
            playlist._shareToken = shareToken;

            loadingScreen.classList.add('hidden');

            if (playlist.length === 0) {
                showError('No audio files found in the shared folder.');
                return;
            }

            renderPlaylist();
            playerContainer.classList.remove('hidden');
            trackCount.textContent = `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`;
        } catch (err) {
            loadingScreen.classList.add('hidden');
            console.error('loadMusicFromOneDrive error:', err);
            showError(`Failed to load music: ${err.message}`);
        }
    }

    async function fetchFolderChildren(shareToken, driveId, folderId, token) {
        let apiUrl;
        if (driveId && folderId) {
            // Subfolder: use drive/items endpoint
            apiUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children?$select=id,name,size,file,folder,parentReference,@microsoft.graph.downloadUrl&$top=200`;
        } else {
            // Root shared folder
            apiUrl = `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem/children?$select=id,name,size,file,folder,parentReference,@microsoft.graph.downloadUrl&$top=200`;
        }

        const resp = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'redeemSharingLink' }
        });
        if (!resp.ok) {
            console.warn(`Failed to fetch children (${resp.status}):`, apiUrl);
            return [];
        }
        const data = await resp.json();
        return data.value || [];
    }

    async function loadFolderRecursive(driveId, folderId, folderPath, token, shareToken) {
        const items = await fetchFolderChildren(shareToken, driveId, folderId, token);
        for (const item of items) {
            if (item.folder) {
                // Recurse into sub-subfolder
                await loadFolderRecursive(
                    item.parentReference?.driveId || driveId,
                    item.id,
                    `${folderPath}/${item.name}`,
                    token,
                    shareToken
                );
            } else {
                addFileToPlaylist(item, folderPath);
            }
        }
    }

    function addFileToPlaylist(file, folderName) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (APP_CONFIG.supportedFormats.includes(ext)) {
            playlist.push({
                name: file.name.replace(/\.[^/.]+$/, ''),
                fullName: file.name,
                size: file.size || 0,
                folder: folderName || null,
                downloadUrl: file['@microsoft.graph.downloadUrl'] || file['@content.downloadUrl'] || null,
                itemId: file.id || null,
                driveId: (file.parentReference && file.parentReference.driveId) || null,
            });
        }
    }

    // ==================== PLAYLIST & PLAYBACK ====================

    function renderPlaylist(filter = '') {
        const query = filter.toLowerCase().trim();
        const items = playlist.map((track, index) => ({ track, index }))
            .filter(({ track }) => !query ||
                track.name.toLowerCase().includes(query) ||
                track.fullName.toLowerCase().includes(query) ||
                (track.folder && track.folder.toLowerCase().includes(query)));

        playlistEl.innerHTML = items.map(({ track, index }) => `
            <div class="playlist-item ${index === currentTrackIndex ? 'active' : ''}" data-index="${index}">
                <span class="track-number">${index === currentTrackIndex && isPlaying ? '▶' : index + 1}</span>
                <div class="track-info-col">
                    <span class="track-name" title="${escapeHtml(track.fullName)}">${escapeHtml(track.name)}</span>
                    ${track.folder ? `<span class="track-folder">📁 ${escapeHtml(track.folder)}</span>` : ''}
                </div>
                <span class="track-size">${formatSize(track.size)}</span>
            </div>
        `).join('');

        playlistEl.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => playTrack(parseInt(item.dataset.index)));
        });
    }

    async function playTrack(index) {
        if (index < 0 || index >= playlist.length) return;

        currentTrackIndex = index;
        const track = playlist[index];

        trackTitle.textContent = track.name;
        trackArtist.textContent = track.fullName;
        renderPlaylist(searchInput ? searchInput.value : '');

        // If no download URL cached, fetch it with loading indicator
        if (!track.downloadUrl) {
            showLoadingBar(true);
            try {
                const token = await getAccessToken();
                const shareToken = encodeSharingUrl(ONEDRIVE_CONFIG.sharedFolderUrl);
                track.downloadUrl = await fetchDownloadUrl(track, token, shareToken);
            } catch (e) {
                console.error('Failed to get download URL:', e);
            }
            showLoadingBar(false);
        }

        if (!track.downloadUrl) {
            showError('Unable to get download URL for this track. Check browser console for details.');
            return;
        }

        audio.src = track.downloadUrl;
        audio.play();
        isPlaying = true;
        updatePlayButton();
        renderPlaylist(searchInput ? searchInput.value : '');

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.name,
                artist: 'OneDrive Music',
            });
        }

        // Pre-fetch next track's URL in background
        prefetchNext(index);
    }

    // Cache which strategy works to avoid retrying failed ones
    let winningStrategy = null;

    async function fetchDownloadUrl(track, token, shareToken) {
        // If we know which strategy works, try it first
        if (winningStrategy) {
            const url = await tryStrategy(winningStrategy, track, token, shareToken);
            if (url) return url;
        }

        // Try all strategies (1 & 2 in parallel since they're metadata-only)
        const strategies = [1, 2, 3, 4];
        for (const s of strategies) {
            if (s === winningStrategy) continue; // already tried
            const url = await tryStrategy(s, track, token, shareToken);
            if (url) {
                winningStrategy = s;
                console.log(`Strategy ${s} succeeded — will use it first next time`);
                return url;
            }
        }
        return null;
    }

    async function tryStrategy(strategy, track, token, shareToken) {
        try {
            let resp, data, url;
            switch (strategy) {
                case 1:
                    if (!track.driveId || !track.itemId) return null;
                    url = `https://graph.microsoft.com/v1.0/drives/${track.driveId}/items/${track.itemId}?$select=id,@microsoft.graph.downloadUrl`;
                    resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!resp.ok) return null;
                    data = await resp.json();
                    return data['@microsoft.graph.downloadUrl'] || null;

                case 2:
                    if (!track.itemId) return null;
                    url = `https://graph.microsoft.com/v1.0/shares/${shareToken}/items/${track.itemId}?$select=id,@microsoft.graph.downloadUrl`;
                    resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'redeemSharingLink' } });
                    if (!resp.ok) return null;
                    data = await resp.json();
                    return data['@microsoft.graph.downloadUrl'] || null;

                case 3:
                    // Stream: follow redirect to get the CDN URL (don't download the whole file)
                    if (!track.driveId || !track.itemId) return null;
                    url = `https://graph.microsoft.com/v1.0/drives/${track.driveId}/items/${track.itemId}/content`;
                    resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!resp.ok) return null;
                    // resp.url is the final redirected CDN URL (pre-authenticated, streamable)
                    if (resp.url && resp.url !== url) {
                        resp.body?.cancel(); // Don't download the body
                        return resp.url;
                    }
                    // Fallback: if no redirect, use blob
                    return URL.createObjectURL(await resp.blob());

                case 4:
                    url = track.itemId
                        ? `https://graph.microsoft.com/v1.0/shares/${shareToken}/items/${track.itemId}/content`
                        : `https://graph.microsoft.com/v1.0/shares/${shareToken}/driveItem:/${encodeURIComponent(track.fullName)}:/content`;
                    resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Prefer': 'redeemSharingLink' } });
                    if (!resp.ok) return null;
                    // resp.url is the final redirected CDN URL (pre-authenticated, streamable)
                    if (resp.url && resp.url !== url) {
                        resp.body?.cancel(); // Don't download the body
                        return resp.url;
                    }
                    // Fallback: if no redirect, use blob
                    return URL.createObjectURL(await resp.blob());
            }
        } catch (e) {
            console.warn(`Strategy ${strategy} failed:`, e.message);
            return null;
        }
    }

    async function prefetchNext(currentIndex) {
        const nextIndex = (currentIndex + 1) % playlist.length;
        const nextTrack = playlist[nextIndex];
        if (nextTrack && !nextTrack.downloadUrl) {
            try {
                const token = await getAccessToken();
                if (!token) return;
                const shareToken = encodeSharingUrl(ONEDRIVE_CONFIG.sharedFolderUrl);
                nextTrack.downloadUrl = await fetchDownloadUrl(nextTrack, token, shareToken);
            } catch (e) { /* silent */ }
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
        el.style.cssText = 'background:#da3633;color:white;padding:0.75rem 1rem;border-radius:8px;margin:0.5rem 1rem;text-align:center;font-size:0.85rem;';
        el.textContent = message;
        document.querySelector('.playlist-section').prepend(el);
        setTimeout(() => el.remove(), 8000);
    }

    function showLoadingBar(show) {
        let bar = document.getElementById('track-loading-bar');
        if (show) {
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'track-loading-bar';
                bar.className = 'track-loading-bar';
                document.querySelector('.player-bar').prepend(bar);
            }
            bar.classList.add('active');
        } else {
            if (bar) bar.classList.remove('active');
        }
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

        // Search filtering
        searchInput.addEventListener('input', e => {
            renderPlaylist(e.target.value);
        });

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
