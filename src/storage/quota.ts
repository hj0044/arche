/** 저장 용량 사용률(0~1). 알 수 없으면 undefined. 경고 기준은 화면에서 데이터 값으로 정한다. */
export async function storageUsageRatio(): Promise<number | undefined> {
  const est = await globalThis.navigator?.storage?.estimate?.();
  if (!est?.quota || est.usage === undefined) return undefined;
  return est.usage / est.quota;
}
