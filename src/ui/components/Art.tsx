/**
 * 그림 슬롯(지시서 017 4항). public/art/<kind>/<id>.<webp|png|svg>를 순서대로 시도하고, 모두 없으면 대체 그림을 그린다.
 * 항상 비율 상자 안에 그려 레이아웃이 움직이지 않는다. 경로 규칙과 비율은 ui.json art.
 */
import { useState, type CSSProperties } from 'react';
import { tables } from '../../data';

export type ArtKind = 'portrait' | 'banner' | 'emblem' | 'boss' | 'icon';

/** 실패한 경로는 기억해 다시 요청하지 않는다 */
const missing = new Set<string>();

export function artRatio(kind: ArtKind, id: string): [number, number] {
  const a = tables.ui.art;
  return a.idRatios[`${kind}/${id}`] ?? a.ratios[kind] ?? [1, 1];
}

export function Art({
  kind,
  id,
  fallback,
  fill = false,
  style,
  className,
  'data-ui': dataUi,
}: {
  kind: ArtKind;
  id: string;
  /** 대체 그림 SVG 문자열(src/ui/art/fallback) */
  fallback: string;
  /** 부모 크기를 채운다(비율 상자 대신) */
  fill?: boolean;
  style?: CSSProperties;
  className?: string;
  'data-ui'?: string;
}) {
  const a = tables.ui.art;
  const urls = a.extensions.map((ext) => `${import.meta.env.BASE_URL}${a.basePath}/${kind}/${id}.${ext}`).filter((u) => !missing.has(u));
  const [i, setI] = useState(0);
  const url = urls[i];
  const [w, h] = artRatio(kind, id);
  const box: CSSProperties = fill ? { position: 'absolute', inset: 0 } : { aspectRatio: `${w} / ${h}` };
  return (
    <div className={`art ${className ?? ''}`} style={{ ...box, ...style }} data-ui={dataUi}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            missing.add(url);
            setI((x) => x + 1);
          }}
        />
      ) : (
        <div className="art-fb" dangerouslySetInnerHTML={{ __html: fallback }} />
      )}
    </div>
  );
}
