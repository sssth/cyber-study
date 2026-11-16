const rawSampleBooks = import.meta.glob('../../assets/books/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
});

export const sampleBooks = Object.entries(rawSampleBooks)
  .map(([filePath, content]) => {
    const metadata = parseMetadataFromModule();
    return metadata;

    function parseMetadataFromModule() {
      const titleMatch = String(content).match(/^#\s+(.+)$/m);
      const authorMatch = String(content).match(/^作者：(.+)$/m);
      const sourceMatch = String(content).match(/^来源：(.+)$/m);
      const fileName = filePath.split('/').pop() ?? 'sample.md';

      return {
        id: `sample:${fileName.replace(/\.md$/i, '.txt')}`,
        title: titleMatch?.[1]?.trim() ?? fileName.replace(/\.md$/i, ''),
        author: authorMatch?.[1]?.trim() ?? '未知作者',
        source: sourceMatch?.[1]?.trim() ?? '内置示例',
        content: String(content)
      };
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
