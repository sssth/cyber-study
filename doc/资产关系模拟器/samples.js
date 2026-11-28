(function(M){
M.complexSeed=function(){
const s={version:1,types:M.seed().types,items:[],links:[],assets:[]},by={};
function add(key,type,title,data,tags=[],summary=''){const defaults=s.types.find(t=>t.id===type).fields;const i=M.item(type,title,{...structuredClone(defaults),...data});i.tags=['复杂样例',...tags];i.summary=summary;i.occurredAt='2026-11-15T10:00:00+08:00';i.sampleKey='complex-v1:'+key;s.items.push(i);by[key]=i;return i;}
function link(a,b,kind='related',note=''){s.links.push({id:M.uid(),fromId:by[a].id,toId:by[b].id,relationType:kind,position:s.links.filter(l=>l.fromId===by[a].id&&l.relationType===kind).length,note,createdAt:new Date().toISOString()});}
add('trip','journey','江南 · 秋日旅行总集',{description:'跨杭州与苏州的旅行，收录两段子旅途。',location:'江南'},['跨城','多层包含']);
add('hz','journey','杭州 · 湖山两日',{location:'杭州',startDate:'2026-11-14',endDate:'2026-11-15'},['杭州']);
add('sz','journey','苏州 · 园林一日',{location:'苏州',startDate:'2026-11-16',endDate:'2026-11-16'},['苏州']);
add('walk','journey','周末散步 · 年度合集',{description:'跨旅途收录记忆点，不设单一发生地点。'},['多上级']);
add('west','memory_point','断桥 · 日落与晚风',{city:'杭州',latitude:30.2604,longitude:120.1482,caption:'同一个点同时属于杭州旅途与散步合集。'},['杭州','多上级'],'主要关系中心：日记、歌、影片、摘录与待办汇聚于此。');
add('temple','memory_point','灵隐 · 雨后山路',{city:'杭州',latitude:30.2408,longitude:120.1001,caption:'与断桥共同关联同一篇日记。'},['杭州']);
add('garden','memory_point','拙政园 · 借景',{city:'苏州',latitude:31.3256,longitude:120.6293},['苏州']);
add('wish','memory_point','天平山 · 下次再去',{city:'苏州',latitude:31.287,longitude:120.464,visitStatus:'wish'},['计划']);
add('unknown','memory_point','车窗外 · 未定位的片刻',{caption:'有文字，没有地点或坐标，等待整理。',latitude:null,longitude:null},['待整理']);
add('diary','diary','一天里的湖与山',{text:'上午走山路，傍晚到湖边。一篇日记连接两个地点，但自身地点保持空白。',mood:'愉悦'},['多地点'],'观察“关联地点”出现两条来源，data.location 仍为空。');
add('diary2','diary','旅途结束后的整理',{text:'回家后整理照片与清单。关联旅行不意味着写作发生在景点。',location:'上海 · 家中',mood:'平静'},['地点区分']);
add('emptyDiary','diary','还没写完的一页',{text:'',mood:'平静'},['空内容','独立节点']);
add('book','book','《沿途笔记》· 示例书',{author:'模拟作者',source:'原创模拟文本'},['阅读']);
add('quote','excerpt','旅行不只发生在目的地',{quote:'在路上的观察，也值得被认真记录。',bookId:by.book.id,position:{chapter:'第二章',blockId:'paragraph-12',start:0,end:19},starred:true,annotations:[{id:M.uid(),text:'这次旅行在车窗边感受到了这句话。'},{id:M.uid(),text:'也可以关联旅途结束后的日记。'}]},['已加星','多批注']);
add('quote2','excerpt','留一点空白给下一次',{quote:'没有走完的路，留给下一次。',bookId:by.book.id,position:{chapter:'第三章',blockId:'paragraph-20',start:0,end:15},starred:false,annotations:[]},['未加星','无批注']);
add('playlist','playlist','江南列车 · 旅行歌单',{description:'按顺序收录三首示例歌曲。'},['歌单']);
add('playlist2','playlist','夜间写作 · 共用歌曲',{description:'与旅行歌单共用一首歌。'},['多上级']);
add('emptyList','playlist','下一次出发 · 空歌单',{},['空集合']);
add('song','music','湖面回声 · 示例曲',{artist:'模拟乐队',provider:'demo',sourceId:'demo-song-1'},['多上级']);
add('song2','music','向南的列车 · 示例曲',{artist:'模拟音乐人',provider:'demo',sourceId:'demo-song-2'},['音乐']);
add('song3','music','雨停之后 · 示例曲',{artist:'模拟音乐人',provider:'demo',sourceId:'demo-song-3'},['音乐']);
add('movie','movie','《湖岸四季》· 示例影片',{status:'看过',score:'8.6'},['看过'],'仅虚构元数据，无真实播放链接。');
add('movie2','movie','《园林与时间》· 示例影片',{status:'在看',score:''},['在看']);
add('movie3','movie','《下一站山林》· 示例影片',{status:'想看'},['想看']);
add('todo','todo','把西湖照片整理进日记',{text:'挑选照片，并补充关联说明。',done:false},['未完成']);
add('done','todo','买好返程车票',{text:'返程安排已确认。',done:true},['已完成']);
add('todo2','todo','预约下一次天平山之行',{text:'先查看天气，再确定出发日期。',done:false},['计划']);
add('memo','memo','雨天备选路线',{text:'如果下雨：书店 → 看电影 → 整理摘录。',tone:'blue'},['便签']);
add('memo2','memo','一个尚未分类的念头',{text:'城市的声音，也可以成为旅行记录。',tone:'violet'},['独立节点']);
add('typing','typing_work','抄写 · 旅行的留白',{text:'没有走完的路，留给下一次。',textId:by.quote2.id,complete:true},['已完成']);
add('draft','typing_work','抄写 · 途中草稿',{text:'在路上的观察',textId:by.quote.id,complete:false},['未完成']);
for(const[a,b]of [['trip','hz'],['trip','sz'],['hz','west'],['hz','temple'],['hz','unknown'],['sz','garden'],['sz','wish'],['walk','west'],['walk','garden'],['playlist','song'],['playlist','song2'],['playlist','song3'],['playlist2','song']])link(a,b,'contains','集合收录；移除不删除成员。');
for(const[a,b,n]of [['west','diary','记录发生的片刻'],['temple','diary','同一篇日记的另一地点'],['west','song','在湖边听过'],['west','quote','想到这段文字'],['west','movie','影片中的湖岸让我想起这里'],['west','todo','待整理的照片来自这里'],['garden','diary2','整理时回忆的地点，并非日记写作地'],['west','diary2','另一条回忆来源'],['garden','movie2','与园林主题相关'],['wish','movie3','下次旅行的灵感'],['wish','todo2','出行前待办'],['hz','memo','雨天备选方案'],['hz','done','本段行程的返程安排'],['trip','playlist','旅途中的声音'],['trip','diary2','行程总结'],['trip','movie','出发前的观看灵感'],['book','quote','书籍出处另有精确定位字段'],['book','quote2','同书另一摘录'],['quote','diary','读书时联想到这天'],['quote','draft','正在抄写的原文'],['quote2','typing','已完成抄写'],['typing','diary2','作品与日记相关，不自动同步'],['memo','movie','雨天活动候选'],['memo','todo','顺便整理照片'],['song','diary','当天听到的音乐'],['song2','unknown','列车上的声音'],['movie','movie2','相近观看主题'],['todo','diary','完成后补充日记'],['diary','diary2','日记之间的回顾'],['quote2','wish','留待下次的灵感']])link(a,b,'related',n);
return s;
};
M.mergeSamples=function(state){const incoming=M.complexSeed(),ids=new Map();for(const i of incoming.items){const existing=state.items.find(x=>x.sampleKey===i.sampleKey);ids.set(i.id,existing?.id||i.id);}for(const i of incoming.items){if(state.items.some(x=>x.sampleKey===i.sampleKey))continue;if(i.data.bookId)i.data.bookId=ids.get(i.data.bookId)||i.data.bookId;if(i.data.textId)i.data.textId=ids.get(i.data.textId)||i.data.textId;state.items.push(i);}for(const l of incoming.links){l.fromId=ids.get(l.fromId);l.toId=ids.get(l.toId);if(!M.validateLink(state,l.fromId,l.toId,l.relationType))state.links.push(l);}for(const t of incoming.types)if(!state.types.some(x=>x.id===t.id))state.types.push(t);return state.items.find(x=>x.sampleKey==='complex-v1:west').id;};
})(globalThis.AssetModel);
