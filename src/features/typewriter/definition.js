export default {
  id: 'typewriter', label: 'i18n.typewriter', description: 'i18n.openTypingPractice',
  entities: {
    typing_work: {
      label: 'i18n.typingWork', create: true, read: ({ list }) => list('typewriter'),
      search: ['text', 'chapterTitle', 'bookTitle'],
      status: record => record.complete ? 'completed' : 'in_progress',
      parent: { type: 'book', id: record => record.bookId },
      snapshot: 'bookTitle:来源书名 chapterTitle:章节 text:抄写原文 typedText:用户实际抄写的文字 completedAt:完成时间'
    }
  }
};
