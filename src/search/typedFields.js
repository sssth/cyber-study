import {legacyTextKeys} from '../../electron/entityText.mjs';
import {bookReadingStatus} from '../features/library/storage.js';
import {excerptAppearance} from '../features/library/knowledgeStore.js';

export const typeNames={book:'书籍',excerpt:'摘录',annotation:'批注',diary:'日记',memo:'便签',todo:'待办',movie:'电影',playlist:'歌单',music:'曲目',memory_point:'记忆点',journey:'旅途',typing_work:'抄写作品'};
const bool={YES:'是',NO:'否'};
export const choices={
 'format.sound':bool,'format.animation':bool,'format.pen':{钢笔:'钢笔',羽毛笔:'羽毛笔'},type:typeNames,readingStatus:{unread:'待读',reading:'在读',finished:'已读'},
 'movie.status':{想看:'想看',在看:'在看',看过:'看过'},
 'typing_work.status':{not_started:'未开始',in_progress:'进行中',completed:'已完成'},
 excerptType:{highlight:'高亮',underline:'划线',bookmark:'书签',hidden:'不显示'},
 color:{'#70c9bc':'青绿','#f0cb68':'金色','#f5a36c':'橙色','#ee91ac':'粉色','#8dbdf6':'浅蓝','#b4a2ee':'紫色'},
 visitStatus:{visited:'已到访',wish:'想去'},tone:{violet:'紫色',cyan:'青色',amber:'琥珀色'},
 done:{YES:'已完成',NO:'未完成'},showOnBoard:{YES:'显示',NO:'不显示'},showSource:bool,
 photo:{YES:'有图片',NO:'无图片'},provider:{local:'本地',qq:'QQ 音乐',netease:'网易云音乐',spotify:'Spotify'}
};
export const meanings={'format.pen':'书写工具','format.sound':'书写音效','format.animation':'手写动画','format.fontSize':'字号','format.lineHeight':'行距',type:'实体类型',createdAt:'创建日期',updatedAt:'更新日期',importedAt:'导入日期',readingStatus:'阅读状态',excerptType:'摘录类型',color:'标记颜色',photo:'图片（有／无）',date:'记录日期',startDate:'开始日期',endDate:'结束日期',completedAt:'完成日期',done:'完成状态',showOnBoard:'板面展示',tone:'颜色','movie.status':'观看状态','typing_work.status':'抄写状态',watchedOn:'观影日期',score:'豆瓣评分',personalScore:'个人评分',review:'影评',url:'影片链接',douban:'豆瓣链接',typedText:'已抄文字',provider:'来源平台',showSource:'显示来源前缀',durationSeconds:'时长（秒）',visitStatus:'到访状态',latitude:'纬度',longitude:'经度',pointIds:'成员记忆点',playlists:'所属歌单',trackNames:'成员曲目',journeys:'所属旅途',time:'记录时间',timezone:'时区',filename:'文件名',caption:'说明',description:'描述',note:'备注'};
export const additional={
 book:'readingStatus photo importedAt',excerpt:'excerptType color updatedAt',annotation:'',
 typing_work:'updatedAt typing_work.status typedText completedAt',diary:'date photo format.pen format.sound format.animation format.fontSize format.lineHeight',
 memo:'showOnBoard tone photo filename',todo:'done completedAt showOnBoard tone',
 movie:'movie.status score personalScore watchedOn text url douban photo',
 music:'text provider showSource durationSeconds playlists photo',playlist:'text provider showSource trackNames photo',
 memory_point:'text visitStatus date photo latitude longitude time timezone filename journeys',
 journey:'text startDate endDate pointIds'
};
export const dateKeys=new Set('createdAt updatedAt importedAt date watchedOn startDate endDate completedAt'.split(' '));
export const numberKeys=new Set('score personalScore latitude longitude durationSeconds format.fontSize format.lineHeight'.split(' '));
export const rangeKey=key=>dateKeys.has(key)||numberKeys.has(key);
export function calendarDay(raw){
 const s=String(raw??'').normalize('NFKC').trim();
 if(/^\d{4}-\d\d-\d\dT/i.test(s)&&Number.isFinite(Date.parse(s)))return new Date(s).toLocaleDateString('sv-SE');
 const m=/^(\d{4})(?:[-/.](\d{1,2})[-/.](\d{1,2})|年(\d{1,2})月(\d{1,2})(?:日|号)?)$/.exec(s);
 if(!m)return null;
 const day=[m[1],(m[2]??m[4]).padStart(2,'0'),(m[3]??m[5]).padStart(2,'0')].join('-');
 const t=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===day?day:null;
}
export function comparable(key,value){
 if(dateKeys.has(key))return calendarDay(value);
 if(value==null||!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(value).trim()))return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
}
export function typedValue(type,key,item){
 if(key.startsWith('format.')){const value=item.format?.[key.slice(7)];return typeof value==='boolean'?(value?'YES':'NO'):value;}
 switch(key){
 case 'type':return type;
 case 'photo':return (item.coverAssetId||item.cover||item.photo||item.photos?.some(Boolean)||item.poster||type==='memory_point'&&item.hash)?'YES':'NO';
 case 'readingStatus':return bookReadingStatus(item.readingRecord??item);
 case 'excerptType':case 'color':return excerptAppearance(item)[key];
 case 'done':return item.done?'YES':'NO';
 case 'showOnBoard':case 'showSource':return item[key]===false?'NO':'YES';
 case 'movie.status':return item.status||'想看';
 case 'typing_work.status':return item.status||(item.complete?'completed':item.typedText?'in_progress':'not_started');
 case 'provider':{const prefix=String(item.id??'').split(':')[0];return item.provider||(type==='playlist'&&Object.hasOwn(choices.provider,prefix)?prefix:'local');}
 case 'playlists':case 'journeys':return (item[key]||[]).flatMap(entry=>typeof entry==='object'?[entry.id,entry.title]:[entry]);
 case 'pointIds':return [...(item.pointIds||[]),...(item.pointNames||[])];
 case 'createdAt':return type==='diary'?item.createdAt||item.date:type==='annotation'?item.annotationCreatedAt||item.createdAt:item.createdAt;
 default:return item[key];
 }
}
const storageKey='cyber-study.search-fields.v1';
let loaded=false,overrides={};
globalThis.window?.addEventListener?.('storage',e=>{if(!e.key||e.key===storageKey){loaded=false;window.dispatchEvent(new Event('cyber-search-fields-changed'));}});
export function preferences(){
 if(!loaded){
   try{overrides=JSON.parse(globalThis.localStorage?.getItem(storageKey)||'{}')||{};}catch{overrides={};}
   loaded=true;
 }
 return overrides;
}
export function defaultEnabled(field){
 const saved=preferences()[field.type]||{};
 return saved[field.key]??(field.key==='text'?saved[legacyTextKeys[field.type]?.[0]]:undefined)??field.defaultOn;
}
export function toggleDefault(field,enabled){
 const all=preferences(),next={...all[field.type]};
 if(field.key==='text')for(const old of legacyTextKeys[field.type]||[])delete next[old];
 if(enabled===field.defaultOn)delete next[field.key];else next[field.key]=enabled;
 globalThis.localStorage.setItem(storageKey,JSON.stringify({...all,[field.type]:next}));
 loaded=false;
 window.dispatchEvent(new Event('cyber-search-fields-changed'));
}
