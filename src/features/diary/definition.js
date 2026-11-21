export default {
  id: 'diary', label: 'i18n.journal', description: 'i18n.openDiary',
  entities: {
    diary: {
      label: 'i18n.diary', create: true, read: ({ list }) => list('diary'),
      title: record => `${new Date(record.date).toLocaleDateString('zh-CN')} 日记`,
      search: ['text', 'mood'], snapshot: 'date:日期 mood:心情 text:日记正文'
    }
  }
};
