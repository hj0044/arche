// 시안 화면 이름 ↔ 앱 화면(픽스처 경로). ui:shots와 ui:check가 같이 쓴다(지시서 017).
export interface ScreenDef {
  /** 시안 파일 이름(docs/design/ui/<name>.html)이자 contract.json의 화면 이름 */
  name: string;
  /** 앱 픽스처 screen 파라미터 */
  screen: string;
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
  { name: 'Tower', screen: 'tower' },
  { name: 'Boss', screen: 'boss' },
  { name: 'Recruit', screen: 'recruit' },
];

export const appUrl = (port: number, s: ScreenDef) => `http://localhost:${port}/?fixture=ui&screen=${s.screen}`;
