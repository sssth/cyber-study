export default {
  id: 'movie', label: 'i18n.discPlayer', description: 'i18n.openFilmCollection',
  entities: {
    movie: {
      label: 'i18n.film', create: true, read: ({ list }) => list('movies'), search: ['genres', 'region'],
      snapshot: 'releaseYear:年份 region:地区 genres:类型 status:观看状态 score:评分 scoreSource:评分来源 url:外部资料页 douban:豆瓣资料页'
    }
  }
};
