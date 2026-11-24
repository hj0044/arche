// 시안 화면 이름 ↔ 앱 화면(픽스처 경로). ui:shots와 ui:check가 같이 쓴다(지시서 017).
export interface ScreenDef {
  /** 시안 파일 이름(docs/design/ui/<name>.html)이자 contract.json의 화면 이름 */
  name: string;
  /** 앱 픽스처 screen 파라미터 */
  screen: string;
  /** 서브 탭 화면이면 부모 화면 이름. 부모의 머리 구역(header·subtabs)은 같이 보인다 */
  parent?: string;
}

export const SCREENS: ScreenDef[] = [
  { name: 'Main', screen: 'home' },
  { name: 'Content', screen: 'rifts' },
  { name: 'Party', screen: 'party' },
  { name: 'Result', screen: 'dayResult' },
  { name: 'Merc', screen: 'mercs' },
  { name: 'MercDetail', screen: 'merc' },
  { name: 'Battle', screen: 'replay' },
  { name: 'Base', screen: 'base' },
  { name: 'Settings', screen: 'saves' },
  { name: 'Tower', screen: 'tower', parent: 'Content' },
  { name: 'Boss', screen: 'boss', parent: 'Content' },
  { name: 'Recruit', screen: 'recruit', parent: 'Content' },
];

export const appUrl = (port: number, s: ScreenDef) => `http://localhost:${port}/?fixture=ui&screen=${s.screen}`;
