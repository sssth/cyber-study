export default {
  id: 'globe', label: 'i18n.globe', description: 'i18n.openPhotosByLocation',
  entities: {
    journey: {
      label: 'i18n.trip', create: true, read: ({ globe }) => globe.journeys ?? [],
      search: ['description', 'note'], target: { scope: 'journey' },
      children: { type: 'memory_point', kind: 'contains', ids: record => record.pointIds ?? [] },
      snapshot: 'description:旅途描述 startDate:开始日期 endDate:结束日期'
    },
    memory_point: {
      label: 'i18n.memoryPin', create: true, read: ({ globe }) => globe.photos ?? [],
      title: record => record.title || record.location || record.filename || record.caption?.slice(0, 40),
      search: ['location', 'country', 'region', 'city', 'caption', 'filename'],
      snapshot: 'location:地点 country:国家 region:地区 city:城市 latitude:纬度 longitude:经度 date:日期 time:时间 timezone:时区 caption:用户说明'
    }
  }
};
