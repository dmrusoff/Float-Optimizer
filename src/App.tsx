import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Float from './pages/Float';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Float />} />
      </Routes>
    </BrowserRouter>
  );
}
