function owner(object, key) {
 for(let node=object;node;node=node.parent)if(node.userData?.[key])return node.userData[key];
 return null;
}
// Only reorder a book ahead of its own bookcase. Other furniture retains
// normal depth-based hit testing, and empty shelf areas keep their handler.
export function prioritizeShelfBooks(hits) {
 const result=[...hits];
 for(const hit of hits){
  const shelf=owner(hit.object,'sceneBookShelf');if(!shelf)continue;
  const bookIndex=result.indexOf(hit);
  const caseIndex=result.findIndex((candidate,index)=>index<bookIndex&&owner(candidate.object,'sceneFurnitureId')===shelf);
  if(caseIndex>=0){result.splice(bookIndex,1);result.splice(caseIndex,0,hit);}
 }
 return result;
}
