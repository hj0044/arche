/** 이름 풀(D01·D03) 로더(지시서 028a). 이름 풀 파일은 읽기만 한다. 문화권이 늘면 여기에 import 한 줄을 더한다 */
import culturesJson from './names/cultures.json';
import blocklistJson from './names/blocklist.json';
import koreaJson from './names/korea.json';
import japanJson from './names/japan.json';
import chinaJson from './names/china.json';
import vietnamJson from './names/vietnam.json';
import thailandJson from './names/thailand.json';
import indonesiaMalaysiaJson from './names/indonesia_malaysia.json';
import philippinesJson from './names/philippines.json';
import indiaNorthJson from './names/india_north.json';
import indiaSouthJson from './names/india_south.json';
import pakistanBangladeshJson from './names/pakistan_bangladesh.json';
import centralAsiaJson from './names/central_asia.json';
import arabGulfLevantJson from './names/arab_gulf_levant.json';
import egyptMaghrebJson from './names/egypt_maghreb.json';
import turkeyJson from './names/turkey.json';
import iranJson from './names/iran.json';
import ukIrelandJson from './names/uk_ireland.json';
import franceJson from './names/france.json';
import germanyNetherlandsJson from './names/germany_netherlands.json';
import italyJson from './names/italy.json';
import iberiaJson from './names/iberia.json';
import nordicJson from './names/nordic.json';
import easternEuropeJson from './names/eastern_europe.json';
import russiaUkraineJson from './names/russia_ukraine.json';
import greeceBalkansJson from './names/greece_balkans.json';
import westAfricaJson from './names/west_africa.json';
import eastAfricaJson from './names/east_africa.json';
import southAfricaJson from './names/south_africa.json';
import brazilJson from './names/brazil.json';
import latinSpanishJson from './names/latin_spanish.json';
import oceaniaJson from './names/oceania.json';

export interface NameEntry { text: string; tones: string[] }
export interface GivenNameEntry extends NameEntry { gender: 'm' | 'f' | 'n' }
export interface CultureRow { id: string; name: string; continent: string; population: number; order: 'family_first' | 'given_first'; surnameCount: [number, number]; note?: string }
export interface NamePoolFile { id: string; surnames: NameEntry[]; names: GivenNameEntry[] }
export interface NamePoolTables { cultures: CultureRow[]; pools: Record<string, NamePoolFile>; /** 걸러낼 [성, 이름] 쌍 */ blocklist: [string, string][] }

export const namePool: NamePoolTables = {
  cultures: culturesJson as CultureRow[],
  blocklist: blocklistJson as [string, string][],
  pools: {
    korea: koreaJson as NamePoolFile,
    japan: japanJson as NamePoolFile,
    china: chinaJson as NamePoolFile,
    vietnam: vietnamJson as NamePoolFile,
    thailand: thailandJson as NamePoolFile,
    indonesia_malaysia: indonesiaMalaysiaJson as NamePoolFile,
    philippines: philippinesJson as NamePoolFile,
    india_north: indiaNorthJson as NamePoolFile,
    india_south: indiaSouthJson as NamePoolFile,
    pakistan_bangladesh: pakistanBangladeshJson as NamePoolFile,
    central_asia: centralAsiaJson as NamePoolFile,
    arab_gulf_levant: arabGulfLevantJson as NamePoolFile,
    egypt_maghreb: egyptMaghrebJson as NamePoolFile,
    turkey: turkeyJson as NamePoolFile,
    iran: iranJson as NamePoolFile,
    uk_ireland: ukIrelandJson as NamePoolFile,
    france: franceJson as NamePoolFile,
    germany_netherlands: germanyNetherlandsJson as NamePoolFile,
    italy: italyJson as NamePoolFile,
    iberia: iberiaJson as NamePoolFile,
    nordic: nordicJson as NamePoolFile,
    eastern_europe: easternEuropeJson as NamePoolFile,
    russia_ukraine: russiaUkraineJson as NamePoolFile,
    greece_balkans: greeceBalkansJson as NamePoolFile,
    west_africa: westAfricaJson as NamePoolFile,
    east_africa: eastAfricaJson as NamePoolFile,
    south_africa: southAfricaJson as NamePoolFile,
    brazil: brazilJson as NamePoolFile,
    latin_spanish: latinSpanishJson as NamePoolFile,
    oceania: oceaniaJson as NamePoolFile,
  },
};
