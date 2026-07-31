import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CreateTournamentPage } from './pages/CreateTournamentPage';
import { TournamentPage } from './pages/TournamentPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        <nav className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
          <a href="/" className="text-lg sm:text-xl font-bold text-white hover:text-blue-400">
            🏆 Tournament Runner
          </a>
        </nav>
        <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<CreateTournamentPage />} />
            <Route path="/tournament/:id" element={<TournamentPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
