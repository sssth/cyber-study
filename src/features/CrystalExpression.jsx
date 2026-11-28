import {useState} from 'react';
import AssistantConversation from '../search/ExpressionAssistant.jsx';
import {translate as t} from '../i18n/index.js';
import {loadSpaceData} from '../data/spaceStorage.js';
import {displayShelves} from './library/sceneShelfArrangement.js';
import {bookFilters} from './library/useLibrarySearch.js';
import {movieFilters} from './movies/movieSearch.js';
import {globalSearchFilters,geographySearchFilters,musicSearchFilters} from '../search/pageModes.js';

function targetGroups(area){
 const page=(id,label,options={})=>({id,label:t(label),...options});
 return [
   ['i18n.library',[
     page('library','i18n.allBooks',{filters:bookFilters}),
     ...displayShelves.map((shelf,index)=>page('display-shelf:'+index,shelf.label??String(index+1),{filters:bookFilters})),
     page('knowledge','i18n.excerptsAndAnnotations')
   ]],
   ['i18n.entireStudy',[page('global','i18n.entireStudy',{relatedSearch:true,filters:globalSearchFilters()})]],
   ['i18n.knowledgeBase',[page('entity-catalog','i18n.allItems',{relatedSearch:true}),page('entity-graph','i18n.relationshipGraph',{relatedSearch:true}),page('entity-trash','i18n.recycleBin')]],
   ['i18n.film',[page('movie','i18n.filmCollectionAndViewingHistory',{filters:movieFilters})]],
   ['i18n.recordPlayer',[page('music','i18n.allPlaylistsAndTracks',{filters:area==='i18n.recordPlayer'?musicSearchFilters(loadSpaceData('music',[])):[]})]],
   ['i18n.globe',[page('geography','i18n.aiRegionExplorer',{filters:geographySearchFilters()}),page('globe','i18n.memoryPin'),page('journey','i18n.trip')]],
   ['i18n.journal',[page('diary','i18n.readingMode'),page('diary','i18n.todaySEntry',{textOnly:true})]],
   ['i18n.memoBoard',[page('memo','i18n.memoBoard',{entityView:'board'}),page('memo','i18n.note',{entityView:'memo'}),page('memo','i18n.toDo',{entityView:'todo'})]],
   ['i18n.typewriter',[page('typewriter','i18n.unfinishedWorkLibrary'),page('typewriter','i18n.completedWorkLibrary'),page('typewriter-source','i18n.sourceBook')]]
 ];
}

const pageKey=scope=>JSON.stringify([scope.id,scope.label,scope.entityView,scope.textOnly]);

export default function CrystalExpression({shortcuts}){
 const [area,setArea]=useState('i18n.library'),[selection,setSelection]=useState('');
 const groups=targetGroups(area);
 const pages=groups.find(([key])=>key===area)[1];
 const target=pages.find(item=>pageKey(item)===selection)??pages[0];
 return <section className="crystal-expression">
   <div className="crystal-targets">
     <label>{t('i18n.aiTargetArea')}<select value={area} onChange={e=>{setArea(e.target.value);setSelection('');}}>
       {groups.map(([key])=><option key={key} value={key}>{t(key)}</option>)}
     </select></label>
     <label>{t('i18n.aiTargetPage')}<select value={pageKey(target)} onChange={e=>setSelection(e.target.value)}>
       {pages.map(scope=><option key={pageKey(scope)} value={pageKey(scope)}>{scope.label}</option>)}
     </select></label>
   </div>
   <AssistantConversation key={pageKey(target)} targetScope={target} open shortcuts={shortcuts}/>
 </section>;
}
