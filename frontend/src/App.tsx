import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import { TourProvider } from './components/Tour';
import { ThemeProvider } from './components/Theme';
import UploadPage from './pages/UploadPage';
import CreateGclPage from './pages/CreateGclPage';
import PackagesPage from './pages/PackagesPage';
import PackageDetailPage from './pages/PackageDetailPage';
import UplPage from './pages/UplPage';

export default function App() {
  return (
    <ThemeProvider>
      <TourProvider>
        <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/create-gcl" replace />} />
          <Route path="/create-gcl" element={<CreateGclPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/packages/:id" element={<PackageDetailPage />} />
          <Route path="/upl" element={<UplPage />} />
          <Route path="*" element={<div className="text-brand-400">Page not found.</div>} />
        </Routes>
        </Shell>
      </TourProvider>
    </ThemeProvider>
  );
}
