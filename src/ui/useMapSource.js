import {useLayoutEffect,useRef} from 'react';
import {registerMapSource} from '../data/mapProjection.js';
export {mapEntities} from '../data/mapProjection.js';
export default function useMapSource(source) {
  const latest=useRef(source);latest.current=source;
  useLayoutEffect(()=>registerMapSource(latest,()=>latest.current),[]);
}
