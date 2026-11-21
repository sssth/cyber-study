export default {
  id: 'memo', label: 'i18n.memoBoard', description: 'i18n.openNotesAndToDos',
  entities: {
    memo: {
      label: 'i18n.note', create: true,
      read: ({ list }) => list('memo').filter(record => record.type !== 'todo'),
      title: record => record.text?.slice(0, 40) || (record.type === 'image' ? '图片便签' : ''),
      target: { rememberedView: { 'memo.view': 'memo' } }, search: ['text'],
      snapshot: 'text:便签内容'
    },
    todo: {
      label: 'i18n.toDo', create: true,
      read: ({ list }) => list('memo').filter(record => record.type === 'todo'),
      target: { rememberedView: { 'memo.view': 'todo' } }, search: ['text'],
      status: record => record.done ? 'done' : 'open', snapshot: 'text:待办事项 completedAt:完成时间'
    }
  }
};
