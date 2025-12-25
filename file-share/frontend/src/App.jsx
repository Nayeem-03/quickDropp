import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UploadInterface } from './components/UploadInterface';
import { DownloadPage } from './components/DownloadPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { ReplaceFilePage } from './components/ReplaceFilePage';


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadInterface />} />
        <Route path="/d/:fileId" element={<DownloadPage />} />
        <Route path="/analytics/:fileId" element={<AnalyticsPage />} />
        <Route path="/replace/:fileId" element={<ReplaceFilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
