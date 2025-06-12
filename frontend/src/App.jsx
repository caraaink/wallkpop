import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Panel from './pages/Panel';
import Track from './pages/Track';
import Search from './pages/Search';
import './styles/tailwind.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <Routes>
          <Route path="/panel" element={<Panel />} />
          <Route path="/track/:id/:permalinkartist/:permalinktitle" element={<Track />} />
          <Route path="/search/:permalink" element={<Search />} />
          <Route path="/" element={<div className="p-4">Welcome to WallKpop</div>} />
        </Routes>
      </div>
    </Router>
  );
}

export default App
