/**
 * The patient's phone app (route /sensor). One job per screen:
 *   Welcome (first run) → Home → Step 1 (find your pace) → Step 2 (your beat) → Walking
 *   → End your walk? → After the walk;  plus My walks and Settings.
 * The hidden Developer screen (tap the version number in Settings 5 times) has the signal
 * graph, step tuning and walk recording.
 *
 * The phone stays linked to the laptop the whole time (the laptop plays the music and
 * scores the walk); the screens are drawn from the walk state it sends back.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../shared/store';
import { useSensorLink, walk } from '../sensor/link';
import { SensorPage } from '../sensor/SensorPage';
import { prefs } from './prefs';
import { Home, Step1, Step2, Welcome } from './setup';
import { After, EndConfirm, MyWalks, Settings, Walking } from './walking';
import './patient.css';

interface Route {
  name: string;
  arg?: string;
}

export function PatientApp() {
  const [params] = useSearchParams();
  const room = params.get('room');
  const link = useSensorLink(room);
  const p = useStore(prefs);
  const [route, setRoute] = useState<Route>({ name: p.welcomed ? 'home' : 'welcome' });
  const go = useCallback((name: string, arg?: string) => {
    setRoute({ name, arg });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    document.title = 'Footnotes';
  }, []);

  // "Find their pace" pressed on the laptop while the phone is on Home: open Step 1, which
  // follows the laptop's countdown.
  const phase = useStore(walk).state?.phase;
  useEffect(() => {
    if (phase === 'calibrating' && route.name === 'home') go('step1');
  }, [phase, route.name, go]);

  switch (route.name) {
    case 'welcome':
      return <Welcome onDone={() => go('home')} />;
    case 'step1':
      return <Step1 go={go} link={link} />;
    case 'step2':
      return <Step2 go={go} />;
    case 'walking':
      return <Walking go={go} />;
    case 'end':
      return <EndConfirm go={go} />;
    case 'after':
      return <After go={go} id={route.arg} />;
    case 'history':
      return <MyWalks go={go} />;
    case 'settings':
      return <Settings go={go} onDeveloper={() => go('developer')} />;
    case 'developer':
      return <SensorPage room={room} link={link} onBack={() => go('settings')} />;
    default:
      return <Home go={go} link={link} />;
  }
}
