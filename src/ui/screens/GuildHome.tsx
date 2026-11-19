import { findCity } from '../../data';
import { AppShell } from '../AppShell';

interface GuildHomeProps {
  cityId: string;
  onBack: () => void;
}

export function GuildHome({ cityId, onBack }: GuildHomeProps) {
  const city = findCity(cityId);
  return (
    <AppShell
      title="길드 홈"
      subtitle={city ? `${city.name} 거점` : undefined}
      footer={
        <nav className="tabbar">
          <button className="tab" onClick={onBack}>도시</button>
          <button className="tab" disabled>리프트</button>
          <button className="tab" disabled>용병</button>
          <button className="tab primary" disabled>다음 날</button>
        </nav>
      }
    >
      <section className="panel">
        <h2>오늘</h2>
        <p className="muted">날짜, 자원, 파견 현황이 여기에 표시됩니다.</p>
      </section>
      <section className="panel">
        <h2>용병</h2>
        <p className="muted">아직 용병이 없습니다.</p>
      </section>
    </AppShell>
  );
}
