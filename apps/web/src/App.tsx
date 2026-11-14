import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './landing/Landing';
import { SensorPage } from './sensor/SensorPage';

// The Studio (with Tone.js, ~300 KB) loads only on the laptop; the phone never downloads it.
const StudioPage = lazy(() =>
  import('./studio/StudioPage').then((m) => ({ default: m.StudioPage })),
);

/** Three routes: choose a role, the phone (Sensor), the laptop (Studio). */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sensor" element={<SensorPage />} />
        <Route
          path="/studio"
          element={
            <Suspense fallback={<div className="theme-dark" aria-busy="true" />}>
              <StudioPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
