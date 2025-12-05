import BidirectionalEditor from './pages/BidirectionalEditor';
import Editor from './pages/Editor';
import Stats from './pages/Stats';
import { BrowserRouter, Routes, Route } from 'react-router-dom';


// Main app with routing
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BidirectionalEditor />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
    </BrowserRouter>
  );
}
