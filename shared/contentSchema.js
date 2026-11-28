(function(root){
const definitions={
 book:['书籍',{author:'',originalAssetId:null,readingAssetId:null,originalFormat:null,readingFormat:'markdown',parseStatus:'pending',reading:{progress:0,totalReadingSeconds:0,lastReadAt:null,lastSessionSeconds:0}}],
 excerpt:['摘录',{text:'',position:null}],annotation:['批注',{text:''}],
 typing_work:['抄写作品',{text:'',chapterTitle:'',typedText:'',cursor:0,status:'not_started',completedAt:null}],
 journey:['旅途',{text:'',startDate:null,endDate:null}],
 memory_point:['记忆点',{country:'',region:'',city:'',cityId:null,latitude:null,longitude:null,text:'',date:null,time:null,timezone:null,visitStatus:'wish',locationStatus:'pending',locationSource:'unknown',dateSource:'unknown'}],
 playlist:['歌单',{text:'',provider:null,sourceId:null}],
 music:['歌曲',{text:'',artist:'',album:'',genre:[],provider:null,sourceId:null,audioAssetId:null,durationSeconds:null}],
 movie:['影片',{text:'',url:null,douban:null,status:'想看',score:null,scoreSource:null,region:[],genres:[],releaseYear:null}],
 diary:['日记',{text:'',date:null,mood:null}],memo:['便签',{text:'',tone:'blue',kind:'text'}],todo:['待办',{text:'',done:false,completedAt:null}]
};
const defaults=type=>structuredClone(definitions[type]?.[1]||{});
function copyState(text,typedText,previousCompletedAt=null,now=new Date().toISOString()){
 const target=Array.from(text),typed=Array.from(typedText).slice(0,target.length).join('');
 const complete=target.length>0&&text===typed;
 return {typedText:typed,cursor:Array.from(typed).length,status:complete?'completed':typed?'in_progress':'not_started',completedAt:complete?(previousCompletedAt||now):null};
}
root.CyberContentSchema={definitions,defaults,copyState};
})(globalThis);
