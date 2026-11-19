import { cities } from '../../data';
import { AppShell } from '../AppShell';

interface CitySelectProps {
  onSelect: (cityId: string) => void;
}

export function CitySelect({ onSelect }: CitySelectProps) {
  return (
    <AppShell title="시작 도시" subtitle="길드 거점을 둘 도시를 고르세요.">
      <ul className="list">
        {cities.map((city) => (
          <li key={city.id}>
            <button className="card-button" onClick={() => onSelect(city.id)}>
              <span className="card-title">{city.name}</span>
              <span className="card-desc">{city.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
