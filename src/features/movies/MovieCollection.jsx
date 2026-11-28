import ImageFileField from '../ImageFileField.jsx';
import PhotoCrop, { cropStyle } from '../PhotoCrop.jsx';
import { useEffect, useRef, useState } from 'react';
import { translate, translateError } from '../../i18n/index.js';
import useContentOrder from '../../ui/useContentOrder.js';
import { orderType } from '../../data/contentOrder.js';
import useResultSource, { resultEntities } from '../../results/useResultSource.js';
import { useSearchCount, useSearchScope } from '../../search/useSearchScope.jsx';
import { matchesMovie, movieFilters } from './movieSearch.js';
import { createId, loadSpaceData, saveContentData } from '../../data/spaceStorage.js';
import { ActionWorkspace, FeaturePanel, WorkspaceActions, WorkspaceFields } from '../ui.jsx';
import { ContentCommand, ContentEditButton } from '../ContentCommands.jsx';
import ContentActions from '../ContentActions.jsx';
import { doubanSubjectId, readDoubanMovie, splitMovieRegions } from './doubanMovie.js';
import { httpUrl } from '../mediaUrl.js';

function MovieField({ label, hint, ...input }) {
  return <label className="movie-field">
    {label}<input {...input} placeholder={translate(hint)} />
  </label>;
}

const movieDraft = { title: '', url: '', status: '想看', poster: '', douban: '', score: '', region: '', genres: '', tags: '', personalScore: '', text: '', watchedOn: '' };

function movieStatus(status) {
  return translate({ '想看': "i18n.wantToWatch", '在看': "i18n.watching", '看过': "i18n.watched" }[status] ?? (status || "i18n.wantToWatch"));
}



function splitMovieLabels(value) {
  return [...new Set(value.split(/[,，、]+/).map((label) => label.trim()).filter(Boolean))];
}

function movieFields(movie) { return { ...movieDraft, ...movie, region: splitMovieRegions(movie.region).join(' / '), genres: (movie.genres ?? []).join('，'), tags: (movie.tags ?? []).join('，') }; }

export default function MovieCollection({ onClose, editItem }) {
  const [movies, setMovies] = useState(() => loadSpaceData('movies', []));
  useEffect(() => {
    const refresh = event => { if (event.detail === 'movies') setMovies(loadSpaceData('movies', [])); };
    window.addEventListener('cyber-bulk-updated', refresh);
    return () => window.removeEventListener('cyber-bulk-updated', refresh);
  }, []);

  const filmStrip = useRef(null);
  useEffect(() => {
    const strip = filmStrip.current;
    if (!strip) return;
    function scrollFilm(event) {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
          || event.target.closest('select') || !event.cancelable) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
      const previous = strip.scrollLeft;
      strip.scrollLeft += event.deltaY * unit;
      if (strip.scrollLeft !== previous) event.preventDefault();
    }
    strip.addEventListener('wheel', scrollFilm, { passive: false });
    return () => strip.removeEventListener('wheel', scrollFilm);
  }, [editItem]);
  const [draft, setDraft] = useState(() => editItem ? movieFields(movies.find(movie => movie.id === editItem.id) ?? editItem) : movieDraft);
  const [editing, setEditing] = useState(editItem?.id ?? null);
  const [editorOpen, setOpen] = useState(Boolean(editItem));
  const setEditorOpen = open => { setOpen(open); if (!open && editItem) onClose(); };
  const search=useSearchScope({id:'movie',label:translate("i18n.film"),priority:10,filters:movieFilters});
  const [error, setError] = useState('');
  const [fetchingDouban, setFetchingDouban] = useState(false);
  const [choosingPoster, setChoosingPoster] = useState(false);
  const formBusy = fetchingDouban || choosingPoster;
  const [localPosters, setLocalPosters] = useState({});
  const titleInput = useRef(null);
  const posterRequests = useRef(new Set());
  useEffect(() => {
    if (!window.cyberStudy?.cacheMoviePoster) return;
    const posters = new Set([draft.poster, ...movies.map((movie) => movie.poster)]);
    for (const poster of posters) {
      const url = poster && httpUrl(poster);
      if (!url || !/(^|\.)(doubanio\.com|douban\.com)$/.test(url.hostname) || posterRequests.current.has(poster)) continue;
      posterRequests.current.add(poster);
      window.cyberStudy.cacheMoviePoster(poster).then((local) => {
        if (local) setLocalPosters((current) => ({ ...current, [poster]: local }));
        else posterRequests.current.delete(poster);
      }).catch(() => posterRequests.current.delete(poster));
    }
  }, [draft.poster, movies]);
  const [doubanMessage, setDoubanMessage] = useState('');
  const field = (key) => ({
    value: draft[key],
    onChange: (event) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [key]: value }));
      if (key === 'douban') setDoubanMessage('');
    }
  });

  const selectPoster = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || formBusy) return;
    if (!window.cyberStudy?.uploadMoviePoster) {
      setError(translate("i18n.quitAndReopenTheCyberStudyDesktop"));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(translate("i18n.posterImagesMustBe8MbOr"));
      return;
    }
    setError('');
    setChoosingPoster(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { poster, error: uploadError } = await window.cyberStudy.uploadMoviePoster(bytes);
      if (uploadError) setError(uploadError);
      if (poster) setDraft((current) => ({ ...current, poster, photoCrop:null }));
    } catch {
      setError(translate("i18n.couldNotReadOrSaveThePoster"));
    } finally {
      setChoosingPoster(false);
    }
  };

  const fillFromDouban = async () => {
    if (formBusy) return;
    setError('');
    setDoubanMessage('');
    const subjectId = doubanSubjectId(httpUrl(draft.douban));
    if (!subjectId) { setError(translate("i18n.pasteADoubanFilmLinkForExample")); return; }
    if (!window.cyberStudy?.doubanMovie) { setError(translate("i18n.openTheCyberStudyDesktopAppTo2")); return; }

    setFetchingDouban(true);
    try {
      let result = await window.cyberStudy.doubanMovie(subjectId);
      let details = result.html && readDoubanMovie(result.html);
      if (!details && !result.error && window.cyberStudy.doubanMovieInBrowser) {
        setDoubanMessage(translate("i18n.loadingDoubanDetails"));
        result = await window.cyberStudy.doubanMovieInBrowser(subjectId);
        details = result.html && readDoubanMovie(result.html);
      }
      if (!details) {
        setDoubanMessage('');
        setError(result.error || translate("i18n.couldNotReadFilmDetailsFromDouban"));
        return;
      }
      setDraft((current) => ({
        ...current,
        ...details,
        photoCrop: details.poster && details.poster !== current.poster ? null : current.photoCrop,
        personalScore: current.personalScore,
        text: current.text,
        watchedOn: current.watchedOn,
        douban: `https://movie.douban.com/subject/${subjectId}/`
      }));
      setDoubanMessage(translate("i18n.availableDoubanDetailsWereFilledInYou"));
    } catch {
      setDoubanMessage('');
      setError(translate("i18n.couldNotGetDoubanDetailsTryAgain"));
    } finally {
      setFetchingDouban(false);
    }
  };

  const persist = (next) => {
    if (!saveContentData('movies', next)) { setError(translate("i18n.couldNotSaveLocalStorageMayBe")); return false; }
    setMovies(next);
    setError('');
    return true;
  };

  const addMovie = () => {
    if (formBusy) return;
    const url = httpUrl(draft.url);
    const poster = /^study-poster:\/\/movie\/[a-f0-9]{64}\.(?:webp|jpg|png|gif)$/.test(draft.poster)
      ? new URL(draft.poster) : httpUrl(draft.poster);
    const douban = httpUrl(draft.douban);
    if (draft.url.trim() && !url) { setError(translate("i18n.enterAValidBilibiliOrOtherWeb")); return; }
    if (draft.poster.trim() && !poster) { setError(translate("i18n.enterAValidPosterLink")); return; }
    if ((draft.douban.trim() || draft.score.trim()) && !doubanSubjectId(douban)) {
      setError(translate("i18n.enterTheDoubanPageForThisFilm"));
      return;
    }
    if (!draft.title.trim()) { setError(translate("i18n.enterTheFilmTitle")); return; }
    const score = draft.score.trim();
    if (score && (!/^\d{1,2}(?:\.\d)?$/.test(score) || Number(score) > 10)) {
      setError(translate("i18n.enterADoubanRatingFrom0To"));
      return;
    }
    const personalScore = String(draft.personalScore ?? '').trim();
    if (personalScore && (!/^\d{1,2}(?:\.\d)?$/.test(personalScore) || Number(personalScore) > 10)) {
      setError(translate("i18n.enterAPersonalRatingFrom0To"));
      return;
    }
    const watchedOn = draft.watchedOn || '';
    if (watchedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(watchedOn)
        || !Number.isFinite(Date.parse(watchedOn))
        || new Date(watchedOn).toISOString().slice(0, 10) !== watchedOn)) {
      setError(translate("i18n.chooseAValidWatchDate"));
      return;
    }
    const record = {
      ...draft, title: draft.title.trim(), url: url?.href ?? '', poster: localPosters[draft.poster] || poster?.href || '', douban: douban?.href ?? '',
      score, personalScore, text: draft.text ?? '', watchedOn,
      region: splitMovieRegions(draft.region), genres: splitMovieLabels(draft.genres), tags: splitMovieLabels(draft.tags).slice(0, 5)
    };
    const next = editing ? movies.map((movie) => movie.id === editing ? { ...movie, ...record } : movie)
      : [{ ...record, id: createId('movie'), createdAt: new Date().toISOString() }, ...movies];
    if (persist(next)) { setDraft(movieDraft); setEditorOpen(false); setEditing(null); setDoubanMessage(''); }
  };

  const editMovie = (movie) => {
    if (formBusy || (editorOpen && editing === movie.id)) return;
    setEditorOpen(true); setEditing(movie.id);
    setDraft(movieFields(movie));
    setError('');
    setDoubanMessage('');
    titleInput.current?.focus({ preventScroll: true });
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft(movieDraft);
    setError('');
    setDoubanMessage('');
  };
  const deleteMovie = () => {
    if (window.confirm(translate("i18n.deleteThisFilmEntry")) && persist(movies.filter((movie) => movie.id !== editing))) { cancelEdit(); setEditorOpen(false); }
  };
  const order = useContentOrder();
  const visibleMovies = orderType(movies,'movie',order).filter(movie => matchesMovie(movie,search));
  useResultSource({ scopeId: 'movie', priority:10,matches:resultEntities('movie',visibleMovies)});
  useSearchCount('movie',visibleMovies.length);
  const editor = (<ActionWorkspace kind={editing ? "edit" : "create"} disabled={formBusy} onCreate={() => { if (editing) cancelEdit(); }} label={translate("i18n.newFilm")} title={editing ? translate("i18n.editFilm") : translate("i18n.newFilm")} open={editorOpen} onOpenChange={setEditorOpen}><form className="stack-form" onSubmit={(event) => { event.preventDefault(); addMovie(); }}>
      <WorkspaceFields>
        <MovieField label={translate("i18n.tags")} {...field('tags')} hint="i18n.entityTagSeparator" />
        <label>{translate("i18n.name")}<input ref={titleInput} {...field('title')} placeholder={translate("i18n.filmTitleOptional")} /></label>
        <label>{translate("i18n.link2")}<input {...field('url')} placeholder={translate("i18n.bilibiliOrOtherSourceLinkOptional")} /></label>
        <div className="panel-toolbar">
          <label>{translate("i18n.douban")}<input {...field('douban')} placeholder={translate("i18n.doubanFilmLink")} aria-label={translate("i18n.doubanFilmLink")} disabled={formBusy} /></label>
          <button type="button" onClick={fillFromDouban} disabled={formBusy || !draft.douban.trim()}>{fetchingDouban ? translate("i18n.fetching") : translate("i18n.getDoubanDetails")}</button>
        </div>
        <div className="panel-toolbar">
          <MovieField label={translate("i18n.region")} {...field('region')} aria-label={translate("i18n.filmCountryOrRegion")} hint="i18n.countriesOrRegionsSeparatedBySlashes" />
          <label>{translate("i18n.rating")}<input {...field('score')} inputMode="decimal" placeholder={translate("i18n.doubanRating")} /></label>
        </div>
        <MovieField label={translate("i18n.type")} {...field('genres')} aria-label={translate("i18n.genres")} hint="i18n.genresSeparatedByCommas" />
        <label>{translate("i18n.review")}<textarea {...field('text')} rows={6} placeholder={translate("i18n.optionalViewingNotes")} /></label>
        <label>{translate("i18n.watchStatus")}<select {...field('status')} aria-label={translate("i18n.watchStatus")}><option value="想看">{translate("i18n.wantToWatch")}</option><option value="在看">{translate("i18n.watching")}</option><option value="看过">{translate("i18n.watched")}</option></select></label>
        <label>{translate("i18n.personalRating")}<input {...field('personalScore')} type="number" min="0" max="10" step="0.1" placeholder={translate("i18n.optional010")} /></label>
        <label>{translate("i18n.watchDate")}<input {...field('watchedOn')} type="date" /></label>
        <ImageFileField label={translate("i18n.moviePoster")} disabled={formBusy}
          accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPoster}>
          {draft.poster && <PhotoCrop src={localPosters[draft.poster] || draft.poster} ratio={2/3} value={draft.photoCrop} onChange={photoCrop=>setDraft(d=>({...d,photoCrop}))}/>}
        </ImageFileField>
      </WorkspaceFields>
      {error && <p className="workspace-feedback" role="alert">{translateError(error)}</p>}
      {doubanMessage && <p className="workspace-feedback" role="status">{doubanMessage}</p>}
      <WorkspaceActions>
        <button type="submit" disabled={formBusy}>{editing ? translate("i18n.save") : translate("i18n.addToFilmShelf")}</button>
        {editing && <ContentEditButton label={translate("i18n.delete")} disabled={formBusy} run={deleteMovie} />}
      </WorkspaceActions>
    </form></ActionWorkspace>);
  if (editItem) return editor;
  return <FeaturePanel scopeId="movie" wide title="i18n.discPlayer" kicker="Movie Shelf" onClose={onClose}>
    {editor}
    <div className="movie-collection">

      <div className="movie-posters" data-scroll-memory="film-strip" ref={filmStrip}>
        {visibleMovies.map((movie) => {
          const title = movie.title || translate("i18n.untitledFilm");
          const destination = httpUrl(movie.url || '')?.href;
          const selected = editorOpen && editing === movie.id;
          const posterContent = <>
            <span className="movie-poster-placeholder">{title}</span>
            {movie.poster && <img style={cropStyle(movie.photoCrop)} key={localPosters[movie.poster] || movie.poster} src={localPosters[movie.poster] || movie.poster} referrerPolicy="no-referrer" alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}
          </>;
          return <article className="movie-tile" key={movie.id}>
            <div className="movie-poster">
              {editorOpen
                ? <button type="button" data-instant-selection className="movie-poster-link movie-poster-select"
                    aria-label={translate("i18n.edit0", title)} aria-pressed={selected} disabled={formBusy} onClick={() => editMovie(movie)}>{posterContent}</button>
                : destination
                  ? <a data-item-open className="movie-poster-link" href={destination} target="_blank" rel="noreferrer" aria-label={translate("i18n.open0", title)}>{posterContent}</a>
                  : posterContent}
              <ContentCommand label={translate("i18n.editFilm0", movie.title || translate("i18n.untitled"))} disabled={formBusy} run={() => editMovie(movie)} />
              <ContentCommand label={translate("i18n.deleteFilm0", movie.title || translate("i18n.untitled"))} disabled={formBusy} confirm run={() => persist(movies.filter(item => item.id !== movie.id))} />
              {selected
                ? <select className="movie-status" aria-label={translate("i18n.watchStatusFor0", title)} {...field('status')} disabled={formBusy}>
                    <option value="想看">{translate("i18n.wantToWatch")}</option><option value="在看">{translate("i18n.watching")}</option><option value="看过">{translate("i18n.watched")}</option>
                  </select>
                : <span className="movie-status">{movieStatus(movie.status)}</span>}
              <div className="movie-caption">
                <h3>{!editorOpen && destination ? <a data-item-open href={destination} target="_blank" rel="noreferrer">{title}</a> : title}</h3>
                {movie.score && (movie.douban
                  ? <a className="movie-score" href={movie.douban} target="_blank" rel="noreferrer" aria-label={translate("i18n.doubanRating0", movie.score)}>{movie.score}</a>
                  : <span className="movie-score">{movie.score}</span>)}
                {(splitMovieRegions(movie.region).length > 0 || movie.genres?.length > 0) &&
                  <p>{[splitMovieRegions(movie.region).join(' / '), (movie.genres ?? []).join(' / ')].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
            <ContentActions orderItem={movie} type="movie" id={movie.id} title={title}/>
          </article>;
        })}
      </div>
    </div>
  </FeaturePanel>;
}

