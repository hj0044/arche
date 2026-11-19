import { useState } from 'react';
import { CitySelect } from './screens/CitySelect';
import { GuildHome } from './screens/GuildHome';

type Screen = { name: 'citySelect' } | { name: 'guildHome'; cityId: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'citySelect' });

  switch (screen.name) {
    case 'citySelect':
      return <CitySelect onSelect={(cityId) => setScreen({ name: 'guildHome', cityId })} />;
    case 'guildHome':
      return <GuildHome cityId={screen.cityId} onBack={() => setScreen({ name: 'citySelect' })} />;
  }
}
