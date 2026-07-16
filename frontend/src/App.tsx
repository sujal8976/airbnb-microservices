import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { Nav } from "./components/Nav";
import { Browse } from "./pages/Browse";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ListingDetail } from "./pages/ListingDetail";
import { CreateListing } from "./pages/CreateListing";
import { MyListings } from "./pages/MyListings";
import { MyBookings } from "./pages/MyBookings";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/host/listings" element={<MyListings />} />
          <Route path="/host/listings/new" element={<CreateListing />} />
          <Route path="/bookings" element={<MyBookings />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
