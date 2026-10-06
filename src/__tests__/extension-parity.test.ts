import {it,expect,vi,afterEach} from 'vitest';
import {consensusOf,agreedCountry} from '../components/consensus';
import {badgesOf} from '../components/badges';
import {lookup} from '../../extension/src/api';
import {defaults} from '../../extension/src/model';
import {resultOf} from '../../extension/src/result-model';
import fixtures from '../../extension/src/__tests__/fixtures/intelligence.json';
afterEach(()=>vi.unstubAllGlobals());
it.each([0,1])('desktop registry and extension agree on reference IP %s',async index=>{
  const fixture=fixtures[index];
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>url.includes('abuseipdb') ? new Response(JSON.stringify(fixture.abuse)) : new Response(`${JSON.stringify({type:'row',result:fixture.radar})}\n${JSON.stringify({type:'done'})}`)));
  const row=await lookup(fixture.radar.ip,{...defaults,abuseKey:'test'},new AbortController().signal);
  const result=resultOf(row);
  expect(result.consensus).toEqual(consensusOf(row.sections!));
  expect(result.country).toEqual(agreedCountry(row.sections!));
  expect({classes:result.classes,infos:result.infos}).toEqual(badgesOf(row.sections!));
});
