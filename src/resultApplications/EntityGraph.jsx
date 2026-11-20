import { translate } from '../i18n/index.js';
import { flushSync } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { editActivationProps } from '../ui/editGesture.js';
import { contentTypes } from '../entities/registry.js';
import { graphLayout, nodeWidth, nodeHeight } from './entityGraph.js';
import { relationLabels } from '../entities/edges.js';
import { useNavigationState } from '../ui/useNavigationState.js';

const initialWindow = {left:0, top:0, right:1536, bottom:1152};
const colors = { direct:'#8ed5d4', contains:'#d9b787', related:'#afa6de' };
function edgePath(a,b) {
  if (a.x === b.x) {
    const down=b.y>a.y, x=a.x+nodeWidth, y1=a.y+nodeHeight/2, y2=b.y+nodeHeight/2;
    return `M${x},${y1} C${x+48},${y1+(down?8:-8)} ${x+48},${y2} ${x},${y2}`;
  }
  const forward=a.x<b.x, x1=a.x+(forward?nodeWidth:0), x2=b.x+(forward?0:nodeWidth);
  const y1=a.y+nodeHeight/2, y2=b.y+nodeHeight/2, mid=(x1+x2)/2;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

export default function EntityGraph({items, matches, search, edges, editing, onOpen, onEdit}) {
  const [selection,select] = useNavigationState('entity-graph','selection',null);
  const [local,setLocal] = useNavigationState('entity-graph','local',false);
  const [zoom,setZoom] = useNavigationState('entity-graph','zoom',1);
  const viewport=useRef(null), drag=useRef(null), suppressClick=useRef(false);
  const relationsList = useRef(null);
  const returnFocus = useRef(null);
  const showRelations = (event, item) => {
    event.preventDefault(); event.stopPropagation();
    drag.current = null; suppressClick.current = false;
    window.dispatchEvent(new CustomEvent('cyber-show-relations', { detail: { source: { ...item, element:event.currentTarget } } }));
  };
  const selectNode = item => {
    select(item.key);
    if (editing && editing.key !== item.key) onEdit(item);
  };
  const filtered = matches.length !== items.length;
  const context = useMemo(()=>{
    if (!filtered) return items;
    const hits=new Set(matches.map(item=>item.key)), visible=new Set(hits);
    for (const {from,to} of edges) {
      if (hits.has(from)) visible.add(to);
      if (hits.has(to)) visible.add(from);
    }
    return items.filter(item=>visible.has(item.key));
  },[matches,items,edges,filtered]);
  const lookup=useMemo(()=>new Map(context.map(item=>[item.key,item])),[context]);
  const selected=lookup.get(selection);
  const available=useMemo(()=>edges.filter(edge=>lookup.has(edge.from)&&lookup.has(edge.to)),[edges,lookup]);
  const adjacent=useMemo(()=>available.filter(edge=>edge.from===selection||edge.to===selection),[available,selection]);
  const nearby=useMemo(()=>new Set([selection,...adjacent.flatMap(edge=>[edge.from,edge.to])]),[selection,adjacent]);
  const focused=Boolean(local && selected);
  const nodes=useMemo(()=>focused?context.filter(item=>nearby.has(item.key)):context,[context,nearby,focused]);
  const visibleEdges=useMemo(()=>focused?available.filter(edge=>nearby.has(edge.from)&&nearby.has(edge.to)):available,[available,nearby,focused]);
  const layout=useMemo(()=>graphLayout(nodes,visibleEdges),[nodes,visibleEdges]);
  const fit=()=>{const el=viewport.current;if(el && nodes.length)setZoom(Math.min(1.2,(el.clientWidth-4)/layout.width,(el.clientHeight-4)/layout.height));};
  const large = nodes.length + visibleEdges.length > 320;
  const [windowBox,setWindowBox] = useState(initialWindow);
  const prepared = useRef(null);
  const prepareWindow = useCallback((left,top,synchronous)=>{
    if (!large) return;
    const el=viewport.current, previous=prepared.current;
    const x=Math.min(Math.max(0,left),Math.max(0,el.scrollWidth-el.clientWidth));
    const y=Math.min(Math.max(0,top),Math.max(0,el.scrollHeight-el.clientHeight));
    const right=x+el.clientWidth, bottom=y+el.clientHeight;
    const margin=96;
    if (previous && x-margin>=previous.left*zoom && y-margin>=previous.top*zoom &&
        right+margin<=previous.right*zoom && bottom+margin<=previous.bottom*zoom) return;
    // Keep a screen of content on either side, including the return path on reversal.
    const padX=Math.max(384,el.clientWidth), padY=Math.max(384,el.clientHeight);
    const box={left:(x-padX)/zoom, top:(y-padY)/zoom,
      right:(right+padX)/zoom, bottom:(bottom+padY)/zoom};
    prepared.current=box;
    if (synchronous) flushSync(()=>setWindowBox(box));
    else setWindowBox(box);
  },[large,zoom]);
  useLayoutEffect(()=>{
    if (!large) return;
    const el=viewport.current;
    prepared.current=null;
    prepareWindow(el.scrollLeft,el.scrollTop,false);
    const update=()=>prepareWindow(el.scrollLeft,el.scrollTop,true);
    const resize=new ResizeObserver(update);
    resize.observe(el);
    el.addEventListener('scroll',update,{passive:true});
    return ()=>{resize.disconnect();el.removeEventListener('scroll',update);};
  },[large,prepareWindow,layout]);
  const panTo=(x,y)=>{
    prepareWindow(x,y,true);
    viewport.current.scrollTo(x,y);
  };
  const bounds=large ? windowBox : null;
  const renderedNodes=useMemo(()=>!bounds ? nodes : nodes.filter(item=>{
    const {x,y}=layout.positions.get(item.key);
    return x+nodeWidth>=bounds.left && x<=bounds.right && y+nodeHeight>=bounds.top && y<=bounds.bottom;
  }),[bounds,nodes,layout]);
  const paths=useMemo(()=>visibleEdges.map(edge=>{
    const a=layout.positions.get(edge.from), b=layout.positions.get(edge.to);
    return {edge,d:edgePath(a,b),left:Math.min(a.x,b.x),right:Math.max(a.x,b.x)+nodeWidth+48,
      top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)+nodeHeight};
  }),[visibleEdges,layout]);
  const renderedPaths=useMemo(()=>!bounds ? paths : paths.filter(p=>
    p.right>=bounds.left && p.left<=bounds.right && p.bottom>=bounds.top && p.top<=bounds.bottom
  ),[paths,bounds]);
  // Clip the SVG layer to the prepared region instead of rasterizing a world-sized surface.
  const svgLeft=bounds ? Math.max(0,bounds.left) : 0, svgTop=bounds ? Math.max(0,bounds.top) : 0;
  const svgWidth=Math.max(1,Math.min(layout.width,bounds?.right ?? layout.width)-svgLeft);
  const svgHeight=Math.max(1,Math.min(layout.height,bounds?.bottom ?? layout.height)-svgTop);
  const reveal=useCallback((key,synchronous=true)=>{
    const p=layout.positions.get(key), el=viewport.current;
    if (!p || !el) return;
    const x=(p.x+nodeWidth/2)*zoom-el.clientWidth/2;
    const y=(p.y+nodeHeight/2)*zoom-el.clientHeight/2;
    prepareWindow(x,y,synchronous);
    el.scrollTo(x,y);
  },[layout,zoom,prepareWindow]);
  useLayoutEffect(()=>{
    if (focused || !returnFocus.current) return;
    const key=returnFocus.current;
    returnFocus.current=null;
    reveal(key,false);
  },[focused,reveal]);
  useEffect(()=>{
    const el=viewport.current;
    const wheel=event=>{
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom(z=>Math.max(.05,Math.min(3,z*Math.exp(-event.deltaY*.01))));
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return ()=>el.removeEventListener('wheel',wheel);
  },[]);
  return <section className="entity-graph" aria-label={translate("i18n.relationshipGraph")}>
    <header className="entity-graph-heading"><h2>{translate("i18n.relationshipGraph")}</h2><small>{filtered && translate("i18n.0Matches", matches.length)}{nodes.length}{' '}{translate("i18n.items2")}{' '}{visibleEdges.length}{' '}{translate("i18n.links")}</small></header>
    <div className="entity-graph-toolbar">
      <div className="entity-graph-legend">{Object.entries(relationLabels).map(([kind,label])=><span key={kind} data-kind={kind} style={{'--edge-color':colors[kind]}}>{label}</span>)}</div>
      <div className="entity-graph-tools">
        <button disabled={!selected} aria-pressed={focused} onClick={()=>{
          if (focused) returnFocus.current=selection;
          setLocal(!focused);
        }}>{focused?translate("i18n.showFullGraph"):translate("i18n.showNeighborsOnly")}</button>
        <button aria-label={translate("i18n.zoomOut")} onClick={()=>setZoom(z=>Math.max(.05,z/1.25))}>−</button>
        <button aria-label={translate("i18n.zoomIn")} onClick={()=>setZoom(z=>Math.min(3,z*1.25))}>＋</button>
        <button onClick={fit}>{translate("i18n.fitToCanvas")}</button>
      </div>
    </div>
    <div ref={viewport} data-scroll-memory={focused ? `graph-${selection}` : "graph-world"} className="entity-graph-viewport" aria-label={translate("i18n.relationshipCanvas")} tabIndex={0}
      onPointerDown={e=>{
        suppressClick.current=false;
        if(e.button!==0 || e.pointerType==='touch') return;
        const el=e.currentTarget;
        drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop,moved:false};
      }}
      onPointerMove={e=>{
        const d=drag.current;
        if(!d || e.pointerId!==d.id) return;
        if(!(e.buttons&1)){drag.current=null;return;}
        const dx=e.clientX-d.x, dy=e.clientY-d.y;
        if(!d.moved){
          if(Math.hypot(dx,dy)<4)return;
          d.moved=true;
          suppressClick.current=true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        panTo(d.left-dx,d.top-dy);
      }}
      onClickCapture={e=>{if(suppressClick.current && e.detail){e.preventDefault();e.stopPropagation();}}}
      onClick={event=>{
        if (!editing && !event.target.closest('button')) {
          select(null);
          setLocal(false);
        }
      }}
      onDoubleClickCapture={e=>{if(suppressClick.current)e.stopPropagation();}}
      onPointerUp={()=>{drag.current=null;}}
      onPointerCancel={()=>{drag.current=null;}}
      onLostPointerCapture={()=>{drag.current=null;}}>
      <div style={{width:layout.width*zoom,height:layout.height*zoom,overflow:'hidden'}}>
        <div className="entity-graph-world" style={{width:layout.width,height:layout.height,transform:`scale(${zoom})`}}>
          <svg style={{left:svgLeft,top:svgTop}} width={svgWidth} height={svgHeight} viewBox={`${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`} aria-hidden="true">
            <defs>{['direct','contains'].map(kind=><marker key={kind} id={'graph-arrow-'+kind} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke={colors[kind]}/></marker>)}</defs>
            {renderedPaths.map(({edge,d})=><path key={edge.id} data-relation={edge.kind} d={d} fill="none" stroke={colors[edge.kind]} strokeWidth="1.7" opacity={!selected||edge.from===selection||edge.to===selection?1:.2} strokeDasharray={edge.kind==='related'?'5 4':undefined} markerEnd={edge.kind==='related'?undefined:`url(#graph-arrow-${edge.kind})`}/>)}
          </svg>
          {renderedNodes.map(item=>{const p=layout.positions.get(item.key);return <button key={item.key} className="entity-graph-node" data-relation-gesture onContextMenu={event => showRelations(event, item)} data-instant-selection aria-pressed={item.key===selection} data-dim={Boolean(selected&&!nearby.has(item.key))} title={item.title}
            style={{left:p.x,top:p.y,width:nodeWidth,height:nodeHeight}} onClick={()=>selectNode(item)} {...editActivationProps(()=>{
              if (!editing) { select(item.key); onEdit(item); }
            })}>
            <small>{translate(contentTypes[item.type])}</small><strong>{item.title}</strong></button>;})}
        </div>
      </div>
    </div>
    <div className="entity-graph-detail-slot">
      {selected && <aside className="entity-graph-detail" aria-label={translate("i18n.linksToSelectedItem")}>
        <header>
          <button type="button" className="entity-graph-detail-title" data-relation-gesture onContextMenu={event => showRelations(event, selected)} onClick={()=>onOpen(selected)}>
            <strong>{selected.title}</strong><small>{translate(contentTypes[selected.type])}</small>
          </button>
        </header>
        <div ref={relationsList} data-scroll-memory={`relations-${selection}`} className="entity-graph-relations" role="region" aria-label={translate("i18n.linkedItems")} tabIndex={adjacent.length ? 0 : undefined}>
          {adjacent.length ? <ul>{adjacent.map(edge=>{
            const out=edge.from===selection, other=lookup.get(out?edge.to:edge.from);
            const label=edge.kind==='direct'?(out?translate("i18n.directChildren"):translate("i18n.directParents")):edge.kind==='contains'?(out?translate("i18n.contains"):translate("i18n.collection")):translate("i18n.link");
            return <li key={edge.id}><button type="button" data-relation-gesture onContextMenu={event => showRelations(event, other)} onClick={()=>{selectNode(other);reveal(other.key);}}><small>{label} · {translate(contentTypes[other.type])}</small> {other.title}</button></li>;
          })}</ul>:<small>{translate("i18n.noLinkedItems")}</small>}
        </div>
      </aside>}
    </div>
  </section>;
}
