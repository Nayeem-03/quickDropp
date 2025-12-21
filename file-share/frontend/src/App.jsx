import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UploadInterface } from './components/UploadInterface';
import { DownloadPage } from './components/DownloadPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UploadInterface />} />
        <Route path="/d/:fileId" element={<DownloadPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
