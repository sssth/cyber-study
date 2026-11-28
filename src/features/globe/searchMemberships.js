// Resolve both directions once per dataset. Keep stored member IDs for exact lookup.
export function searchMemberships(photos=[],journeys=[]){
 const parents=new Map(),names=new Map(photos.filter(p=>!p.deletedAt).map(p=>[p.id,p.title||p.location||p.filename]));
 for(const j of journeys){
   if(j.deletedAt)continue;
   for(const id of j.pointIds||[]){
     if(!parents.has(id))parents.set(id,[]);
     parents.get(id).push({id:j.id,title:j.title});
   }
 }
 return {photos:photos.map(p=>({...p,journeys:parents.get(p.id)||[]})),
   journeys:journeys.map(j=>({...j,pointNames:(j.pointIds||[]).map(id=>names.get(id)).filter(Boolean)}))};
}
