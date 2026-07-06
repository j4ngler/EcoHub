import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-40 rounded-lg bg-white p-2 shadow-sm hover:bg-gray-100"
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      
      <div className={`transition-[padding] duration-300 ${sidebarOpen ? 'lg:pl-64' : 'lg:pl-0'}`}>
        <Header />
        
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
