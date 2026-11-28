import { translate } from '../i18n/index.js';
import { contentTypes, entityTypes } from '../entities/registry.js';
import chinese from '../../electron/i18n/zh-CN.json' with { type: 'json' };

function value(input){
  if(Array.isArray(input)) return input.map(value).filter(Boolean).join('；');
  if(typeof input==='number') return String(input);
  return typeof input==='string' && !/^(?:data:|blob:|study-[\w-]+:\/\/)/i.test(input) ? input.trim() : '';
}
export function snapshotMarkdown({entities,source,scope,time}){
  const lines=['# 书房快照','','截取时间：'+new Date(time).toLocaleString('zh-CN',{timeZoneName:'short'}),'截取范围：'+(source.detail?'对象详情':'结果列表')+' · '+entities.length+' 项','来源界面：'+(source.label || scope?.label || '书房')];
  if(source.position) lines.push('截取时的阅读位置：'+source.position);
  const expression=scope?.state?.expression ?? scope?.state?.query;
  if(expression) lines.push('搜索词：'+expression);
  for(const field of scope?.filters || []){
    const applied=scope.state?.filters?.[field.key];
    if(applied) lines.push('筛选 · '+translate(field.label)+'：'+translate(field.options?.find(([id])=>id===applied)?.[1] ?? applied));
  }
  lines.push('收录说明：仅含文字，不含附件。成员和来源名称是引用，不代表另收录了完整实体。');
  const names=new Map(entities.map(({key,record})=>[key,record.title || record.location || record.filename]));
  entities.forEach(({type,record},index)=>{
    const heading=value(record.title || record.bookTitle || record.location || record.date || record.text || record.quote).split('\n')[0].slice(0,80);
    lines.push('','## '+String(index+1).padStart(2,'0')+'｜'+chinese[contentTypes[type]]+(heading?'｜'+heading:''));
    const add=(label,input)=>{const body=value(input);if(body) lines.push('','**'+label+'**', '',body);};
    for(const pair of (entityTypes[type]?.snapshot || '').split(' ')){
      const [key,label]=pair.split(':');
      add(type === 'book' && key === 'content' && record.chapterTitle ? '本章正文' : label, key==='text' && type==='excerpt' ? record.text ?? record.quote : record[key]);
    }
    add('标签',record.tags);
    if(type==='excerpt') add('摘要', [...new Set([record.summary, ...(record.notes || []).map(note => note.summary)].filter(Boolean))].join('\n\n'));
    if(type==='excerpt') add('用户批注（不是原作者的话）',record.notes?.map(note=>note.annotation).filter(Boolean).join('\n\n') || record.comment?.text || record.annotation || (record.notes?'无批注':'本次未包含批注'));
    if(type==='annotation'){add('被批注的原文',record.excerpt?.text ?? record.quote);add('用户批注',record.text ?? record.annotation);}
    if(type==='todo') add('完成状态',record.done?'已完成':'未完成');
    if(type==='typing_work') add('抄写状态',({completed:'已完成',in_progress:'进行中',not_started:'未开始'})[record.status]);
    if(type==='memory_point') add('到访状态',({visited:'去过',wish:'想去'})[record.visitStatus]);
    if(type==='journey') add('成员记忆点（按行程顺序）',record.pointIds?.map(id=>names.get('memory_point:'+id) || source.pointNames?.get(id) || '名称未取得'));
    if(type==='music'){add('所属歌单',record.playlists?.map(list=>list.title));add('音频','未附音频');}
    if(type==='playlist' && !record.trackNames) add('成员曲目','本次未包含曲目清单');
    const count=record.photos?.length || (record.photo?1:0);
    if(count) add('照片',count+' 张，图片未导出');
    if(record.poster) add('海报','图片未导出');
  });
  return lines.join('\n')+'\n';
}
