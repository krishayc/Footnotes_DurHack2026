import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Landing } from './landing/Landing';
import { SensorPage } from './sensor/SensorPage';
import { StudioPage } from './studio/StudioPage';

/** Three routes: choose a role, the phone (Sensor), the laptop (Studio). */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/sensor" element={<SensorPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
