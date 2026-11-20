export const cityBuildings = [
  { x: 850, y: 330, width: 70, height: 260, opacity: 0.42 },
  { x: 925, y: 270, width: 52, height: 320, opacity: 0.55 },
  { x: 982, y: 360, width: 82, height: 230, opacity: 0.38 },
  { x: 1070, y: 230, width: 64, height: 360, opacity: 0.62 },
  { x: 1140, y: 320, width: 94, height: 270, opacity: 0.46 },
  { x: 1240, y: 260, width: 58, height: 330, opacity: 0.68 },
  { x: 1304, y: 350, width: 78, height: 240, opacity: 0.5 },
  { x: 1388, y: 300, width: 66, height: 290, opacity: 0.58 },
  { x: 1460, y: 390, width: 70, height: 200, opacity: 0.42 }
];

export const shelfRows = [
  { y: 172, height: 44 },
  { y: 258, height: 48 },
  { y: 350, height: 44 },
  { y: 440, height: 52 },
  { y: 536, height: 44 },
  { y: 622, height: 48 }
];

const bookPalette = ['#00f0ff', '#ff4fd8', '#7a5cff', '#25f4ee', '#ffb84d', '#68f7a1'];

export const shelfBooks = shelfRows.flatMap((row, rowIndex) =>
  Array.from({ length: 14 }).map((_, bookIndex) => {
    const width = 14 + ((bookIndex * 5 + rowIndex * 3) % 4) * 4;
    const lean = rowIndex === 2 && bookIndex === 9;
    return {
      id: `${rowIndex}-${bookIndex}`,
      rowIndex,
      bookIndex,
      x: 108 + bookIndex * 22,
      y: row.y + row.height - (lean ? row.height + 8 : 36 + (bookIndex % 3) * 3),
      width,
      height: lean ? row.height + 8 : 36 + (bookIndex % 3) * 3,
      fill: bookPalette[(bookIndex + rowIndex * 2) % bookPalette.length],
      opacity: 0.24 + ((bookIndex + rowIndex) % 5) * 0.1,
      lean
    };
  })
);

export const hotspots = {
  desk: { id: 'desk', label: "i18n.readingDesk", detail: "i18n.openLocalReader" },
  shelf: { id: 'shelf', label: "i18n.litBookshelf", detail: "i18n.openTheStudyBookshelf" },
  lamp: { id: 'lamp', label: "i18n.deskLamp", detail: "i18n.toggleTheMainLight" },
  knowledge: { id: 'knowledge', label: "i18n.knowledgeBaseAndWorkspace", detail: "i18n.notesSearchProjectsAndExports" },
  music: { id: 'music', label: "i18n.recordPlayer", detail: "i18n.playlistsAndBackgroundPlayback" },
  movie: { id: 'movie', label: "i18n.discPlayerAndScreen", detail: "i18n.filmCollectionAndViewingHistory" },
  diary: { id: 'diary', label: "i18n.journal", detail: "i18n.journalEntriesAndPhotos" },
  memo: { id: 'memo', label: "i18n.memoBoard", detail: "i18n.pinNotesToDosAndImages" },
  globe: { id: 'globe', label: "i18n.globe", detail: "i18n.browsePhotosByPlaceAndDate" },
  typewriter: { id: 'typewriter', label: "i18n.typewriter", detail: "i18n.typeOutPassagesFromYourBooks" },
  pet: { id: 'pet', label: "i18n.studyCat", detail: "i18n.petTheCatAndBuildABond" },
  crystal: { id: 'crystal', label: "i18n.crystalChat" },
  plant: { id: 'plant', label: "i18n.studyPlant", detail: "i18n.focusTimeHelpsThePlantGrow" }
};
