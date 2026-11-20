export const sampleBooks = [{
  id: 'local:test-navigation-book',
  title: '测试书籍',
  author: '测试作者',
  format: 'md',
  content: ['# 测试书籍', ...Array.from({ length: 36 }, (_, index) =>
    `第 ${index + 1} 段。 ${'这一段用于验证读者在长篇正文中的阅读位置。'.repeat(12)}`
  )].join('\n\n')
}];
