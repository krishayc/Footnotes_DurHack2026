import { useEnvironment } from '../shared/environment';
import { IconCheck, IconInfo } from '../ui/icons';

/** Plain-words checklist so we can confirm HTTPS + sensors at a glance (Stage 0 test). */
export function EnvChecklist() {
  const env = useEnvironment();
  const rows: [boolean | null, string, string][] = [
    [
      env.secure,
      'Secure connection (HTTPS)',
      'Not secure: motion sensors will not work. Use the https link.',
    ],
    [env.motionApi, 'Motion sensors available', 'This browser has no motion sensors.'],
    [
      env.server === 'checking' ? null : env.server === 'ok',
      env.server === 'checking' ? 'Checking the Footnotes server...' : 'Footnotes server reachable',
      'Cannot reach the Footnotes server.',
    ],
  ];
  return (
    <ul className="checks" aria-label="Device checks">
      {rows.map(([ok, good, bad]) => (
        <li key={good} className={ok === false ? 'no' : 'yes'}>
          {ok === false ? <IconInfo /> : <IconCheck />}
          <span>{ok === false ? bad : good}</span>
        </li>
      ))}
    </ul>
  );
}
