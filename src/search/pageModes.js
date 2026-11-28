import {translate as t} from '../i18n/index.js';
import {contentTypes} from '../entities/registry.js';
import {choices} from './typedFields.js';

export function musicSearchFilters(tracks){
 return [{key:'musicTarget',label:t("i18n.searchBy"),options:[['song',t("i18n.trackName")],['artist',t("i18n.artistName")],['playlist',t("i18n.playlistName")]]},{key:'provider',label:t("i18n.platform"),options:[...new Set(tracks.map(t=>t.provider).filter(Boolean))].map(v=>[v,choices.provider[v]||v])}];
}

export function geographySearchFilters(){
 return [{key:'type',label:t("i18n.type"),options:[['memory_point',t("i18n.memoryPin")],['journey',t("i18n.trip")]]}];
}

export function readerSearchFilters(){
 return [{key:'context',label:t("i18n.excerptRange"),defaultLabel:t("i18n.paragraph"),options:[['paragraph',t("i18n.paragraph")],['sentence',t("i18n.sentence")],['chapter',t("i18n.chapter")]]}];
}

export function globalSearchFilters(){
 return [{key:'type',label:t("i18n.contentType"),options:Object.entries(contentTypes)}];
}
