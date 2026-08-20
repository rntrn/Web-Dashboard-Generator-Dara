import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import EmbedViewer from "./pages/EmbedViewer.jsx";
import StoryViewer from "./pages/StoryViewer.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import "./index.css";

// CATATAN: StrictMode sengaja TIDAK dipakai (react-grid-layout tidak
// kompatibel dengan double-render StrictMode React 18 - drag mati).
//
// Routing sederhana tanpa router (halaman publik untuk iframe MANDOR):
//  /view/:id  -> EmbedViewer  (dashboard publik, tanpa login)
//  /story/:id -> StoryViewer  (presentasi publik, tanpa login)
//  selainnya  -> App          (dengan login)
const path = window.location.pathname;
const root = ReactDOM.createRoot(document.getElementById("root"));

// Halaman publik (embed) tidak butuh i18n. Aplikasi ber-login dibungkus
// I18nProvider agar toggle bahasa & t() tersedia.
if (path.startsWith("/view/")) root.render(<EmbedViewer />);
else if (path.startsWith("/story/")) root.render(<StoryViewer />);
else root.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
