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
  desk: { id: 'desk', label: '书桌阅读区', detail: '打开本地阅读界面' },
  shelf: { id: 'shelf', label: '发光书架', detail: '打开书房书架' },
  lamp: { id: 'lamp', label: '桌灯', detail: '开启或关闭主灯光' },
  knowledge: { id: 'knowledge', label: '知识库与创作台', detail: '笔记、检索、项目与导出' },
  music: { id: 'music', label: '唱片机', detail: '歌单管理与后台播放' },
  movie: { id: 'movie', label: '影碟机与屏幕', detail: '电影收藏与观影记录' },
  diary: { id: 'diary', label: '日记本', detail: '自由日记与照片' },
  memo: { id: 'memo', label: 'Memo 板', detail: '便签、To-do 与图片固定' },
  globe: { id: 'globe', label: '地球仪', detail: '照片按地点与日期归档' },
  typewriter: { id: 'typewriter', label: '打字机', detail: '经典片段逐字抄写' },
  pet: { id: 'pet', label: '书房猫', detail: '抚摸与亲密度成长' },
  crystal: { id: 'crystal', label: '水晶对话' },
  plant: { id: 'plant', label: '书房植物', detail: '专注时长影响生长' }
};
