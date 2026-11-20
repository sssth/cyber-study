import { useEffect, useState } from 'react';
import { loadSpaceData, saveContentData, saveSpaceData } from '../../data/spaceStorage.js';

export function useMusicResume() {
  const [resume] = useState(() => loadSpaceData('musicResume', {}));
  const [elapsed, setElapsed] = useState(resume.position ?? 0);
  return { resume, elapsed, setElapsed };
}

export function useMusicStorage({ tracks, playlists, playlistModes, current, storedTrack, elapsed, songPlaylist, queueMode }) {
  const [tracksSaved, setTracksSaved] = useState(true);
  const [playlistsSaved, setPlaylistsSaved] = useState(true);
  const [modesSaved, setModesSaved] = useState(true);
  const [resumeSaved, setResumeSaved] = useState(true);

  useEffect(() => {
    setTracksSaved(saveContentData('music', tracks.filter(track => !track.local)));
  }, [tracks]);

  useEffect(() => {
    setPlaylistsSaved(saveContentData('playlists', playlists));
  }, [playlists]);

  useEffect(() => {
    setModesSaved(saveSpaceData('musicPlaylistModes', playlistModes));
  }, [playlistModes]);

  useEffect(() => {
    if (storedTrack && !storedTrack.local && !storedTrack.kind) {
      setResumeSaved(saveSpaceData('musicResume', {
        trackId: storedTrack.id, position: elapsed, playlistId: songPlaylist, queueMode
      }));
    } else if (!current) {
      setResumeSaved(saveSpaceData('musicResume', {}));
    }
  }, [current, storedTrack, elapsed, songPlaylist, queueMode]);

  return tracksSaved && playlistsSaved && modesSaved && resumeSaved;
}
